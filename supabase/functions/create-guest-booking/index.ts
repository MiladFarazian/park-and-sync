import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { calculateBookingTotal } from "../_shared/pricing.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limit configuration (strict for booking creation)
const RATE_LIMIT_PER_MINUTE = 3;
const RATE_LIMIT_PER_HOUR = 10;

// Check rate limit using database
async function checkRateLimit(
  supabase: any,
  clientIp: string
): Promise<{ allowed: boolean; retryAfter: number }> {
  const functionName = 'create-guest-booking';
  const minuteKey = `ip:${clientIp}:${functionName}:min`;
  const hourKey = `ip:${clientIp}:${functionName}:hour`;

  try {
    const { data: minuteOk } = await supabase.rpc('check_rate_limit', {
      p_key: minuteKey,
      p_window_seconds: 60,
      p_max_requests: RATE_LIMIT_PER_MINUTE
    });

    const { data: hourOk } = await supabase.rpc('check_rate_limit', {
      p_key: hourKey,
      p_window_seconds: 3600,
      p_max_requests: RATE_LIMIT_PER_HOUR
    });

    if (!minuteOk) {
      console.warn(`[rate-limit] ${functionName} minute limit exceeded for IP: ${clientIp.substring(0, 8)}...`);
      return { allowed: false, retryAfter: 60 };
    }
    
    if (!hourOk) {
      console.warn(`[rate-limit] ${functionName} hour limit exceeded for IP: ${clientIp.substring(0, 8)}...`);
      return { allowed: false, retryAfter: 3600 };
    }

    return { allowed: true, retryAfter: 0 };
  } catch (error) {
    console.error('[rate-limit] Error checking rate limit:', error);
    return { allowed: true, retryAfter: 0 };
  }
}

interface GuestBookingRequest {
  spot_id: string;
  start_at: string;
  end_at: string;
  guest_full_name: string;
  guest_email?: string;
  guest_phone?: string;
  guest_car_model: string;
  guest_license_plate?: string;
  will_use_ev_charging?: boolean;
  save_payment_method?: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create admin client for operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get client IP for rate limiting
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() 
      || req.headers.get('cf-connecting-ip') 
      || req.headers.get('x-real-ip')
      || 'unknown';

    // Check rate limit
    const rateLimit = await checkRateLimit(supabaseAdmin, clientIp);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ 
        error: 'Too many booking attempts. Please try again later.',
        retry_after: rateLimit.retryAfter
      }), {
        status: 429,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Retry-After': String(rateLimit.retryAfter)
        },
      });
    }

    const { 
      spot_id, 
      start_at, 
      end_at, 
      guest_full_name,
      guest_email,
      guest_phone,
      guest_car_model,
      guest_license_plate,
      will_use_ev_charging,
      save_payment_method
    }: GuestBookingRequest = await req.json();

    console.log('Creating guest booking:', { spot_id, start_at, end_at, guest_full_name, guest_email, guest_phone });

    // Validate required fields
    if (!guest_full_name?.trim()) {
      return new Response(JSON.stringify({ error: 'Full name is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!guest_email?.trim() && !guest_phone?.trim()) {
      return new Response(JSON.stringify({ error: 'Email or phone is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!guest_car_model?.trim()) {
      return new Response(JSON.stringify({ error: 'Vehicle model is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const useEvCharging = will_use_ev_charging || false;

    // Input sanitization - strip HTML/script tags and limit length
    const sanitizeInput = (input: string, maxLength: number = 200): string => {
      return input
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/[<>]/g, '') // Remove remaining angle brackets
        .trim()
        .substring(0, maxLength);
    };

    const sanitizedName = sanitizeInput(guest_full_name, 100);
    const sanitizedEmail = guest_email ? sanitizeInput(guest_email, 254) : null;
    const sanitizedPhone = guest_phone ? sanitizeInput(guest_phone, 20) : null;
    const sanitizedCarModel = sanitizeInput(guest_car_model, 100);
    const sanitizedLicensePlate = guest_license_plate ? sanitizeInput(guest_license_plate, 20).toUpperCase() : null;

    // Validate email format if provided
    if (sanitizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitizedEmail)) {
      return new Response(JSON.stringify({ error: 'Invalid email format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check availability using admin client
    console.log('Checking spot availability...');
    const { data: isAvailable, error: availabilityError } = await supabaseAdmin.rpc('check_spot_availability', {
      p_spot_id: spot_id,
      p_start_at: start_at,
      p_end_at: end_at,
    });

    if (availabilityError) {
      console.error('Availability check error:', availabilityError);
      throw availabilityError;
    }

    if (!isAvailable) {
      console.error('Spot is not available:', { spot_id, start_at, end_at });
      return new Response(JSON.stringify({ 
        error: 'Spot is not available for the requested time' 
      }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get spot details for pricing
    const { data: spot, error: spotError } = await supabaseAdmin
      .from('spots')
      .select('*, host_id, instant_book, has_ev_charging, ev_charging_premium_per_hour')
      .eq('id', spot_id)
      .single();

    if (spotError || !spot) {
      throw new Error('Spot not found');
    }

    // Validate EV charging request
    if (useEvCharging && !spot.has_ev_charging) {
      console.error('EV charging requested but spot does not support it');
      return new Response(JSON.stringify({ 
        error: 'This spot does not offer EV charging' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Calculate pricing using shared module (ensures consistency with frontend)
    const startDate = new Date(start_at);
    const endDate = new Date(end_at);
    const totalHours = Math.round(((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60)) * 100) / 100;
    const hostHourlyRate = parseFloat(spot.hourly_rate);
    const evChargingPremium = spot.ev_charging_premium_per_hour || 0;

    const pricing = calculateBookingTotal(hostHourlyRate, totalHours, evChargingPremium, useEvCharging);

    const { hostEarnings, driverSubtotal, serviceFee, evChargingFee, driverTotal: totalAmount } = pricing;
    const subtotal = driverSubtotal;
    const platformFee = serviceFee;

    console.log('Pricing calculated:', { totalHours, hostHourlyRate, hostEarnings, driverSubtotal, serviceFee, evChargingFee, totalAmount });

    // Initialize Stripe
    const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecret) {
      throw new Error('Stripe secret key not configured');
    }
    const stripe = new Stripe(stripeSecret, { apiVersion: '2025-08-27.basil' });

    // Generate guest access token
    const guestAccessToken = crypto.randomUUID();
    const bookingId = crypto.randomUUID();
    
    // Create pending booking for guest
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from('bookings')
      .insert({
        id: bookingId,
        spot_id,
        renter_id: spot.host_id, // Use host_id as placeholder for guest bookings (required field)
        start_at,
        end_at,
        status: 'pending',
        hourly_rate: spot.hourly_rate,
        total_hours: totalHours,
        subtotal,
        platform_fee: platformFee,
        total_amount: totalAmount,
        host_earnings: hostEarnings,
        will_use_ev_charging: useEvCharging,
        ev_charging_fee: evChargingFee,
        is_guest: true,
        guest_full_name: sanitizedName,
        guest_email: sanitizedEmail,
        guest_phone: sanitizedPhone,
        guest_car_model: sanitizedCarModel,
        guest_license_plate: sanitizedLicensePlate,
        guest_access_token: guestAccessToken,
      })
      .select()
      .single();

    if (bookingError) {
      console.error('Guest booking creation error:', bookingError);
      throw bookingError;
    }

    console.log('Guest booking created:', booking.id);

    // Create PaymentIntent for the guest (no customer ID)
    // If save_payment_method is true, set up for future use
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalAmount * 100),
      currency: 'usd',
      ...(save_payment_method && { setup_future_usage: 'off_session' }),
      metadata: {
        booking_id: booking.id,
        spot_id,
        host_id: spot.host_id,
        is_guest: 'true',
        guest_email: guest_email || '',
        guest_phone: guest_phone || '',
        guest_access_token: guestAccessToken,
        save_payment_method: save_payment_method ? 'true' : 'false',
      },
      description: `Parking at ${spot.title} - Guest: ${guest_full_name}`,
    });

    console.log('PaymentIntent created for guest:', paymentIntent.id);

    // Update booking with payment intent ID
    await supabaseAdmin
      .from('bookings')
      .update({ stripe_payment_intent_id: paymentIntent.id })
      .eq('id', booking.id);

    // Return client secret for Stripe Elements
    return new Response(JSON.stringify({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
      booking_id: booking.id,
      guest_access_token: guestAccessToken,
      pricing: {
        subtotal,
        platform_fee: platformFee,
        ev_charging_fee: evChargingFee,
        total_amount: totalAmount,
        total_hours: totalHours,
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Guest booking error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
