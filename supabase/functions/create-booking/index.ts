import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BookingRequest {
  spot_id: string;
  start_at: string;
  end_at: string;
  vehicle_id?: string;
  hold_id?: string;
  idempotency_key?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    // Get authenticated user
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !userData.user) {
      throw new Error('User not authenticated');
    }

    const { 
      spot_id, 
      start_at, 
      end_at, 
      vehicle_id, 
      hold_id,
      idempotency_key 
    }: BookingRequest = await req.json();

    console.log('Creating booking:', { spot_id, start_at, end_at, user_id: userData.user.id });

    // Get spot details for pricing
    const { data: spot, error: spotError } = await supabase
      .from('spots')
      .select(`
        *,
        profiles!spots_host_id_fkey (
          stripe_account_id,
          stripe_account_enabled
        )
      `)
      .eq('id', spot_id)
      .single();

    if (spotError || !spot) {
      throw new Error('Spot not found');
    }

    if (!spot.profiles?.stripe_account_enabled) {
      throw new Error('Host has not completed payment setup');
    }

    // Calculate pricing
    const startDate = new Date(start_at);
    const endDate = new Date(end_at);
    const totalHours = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60));
    const subtotal = totalHours * parseFloat(spot.hourly_rate);
    const platformFee = Math.round(subtotal * 0.15 * 100) / 100; // 15% platform fee
    const totalAmount = subtotal + platformFee;

    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2025-08-27.basil',
    });

    // Get or create Stripe customer
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('user_id', userData.user.id)
      .single();

    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userData.user.email!,
        metadata: {
          supabase_user_id: userData.user.id
        }
      });
      customerId = customer.id;

      // Update profile with customer ID
      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('user_id', userData.user.id);
    }

    // Create payment intent with application fee (platform fee goes to main account)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalAmount * 100), // Convert to cents
      currency: 'usd',
      customer: customerId,
      application_fee_amount: Math.round(platformFee * 100),
      transfer_data: {
        destination: spot.profiles.stripe_account_id
      },
      metadata: {
        spot_id,
        renter_id: userData.user.id,
        start_at,
        end_at
      }
    });

    // Create booking record
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        spot_id,
        renter_id: userData.user.id,
        vehicle_id,
        start_at,
        end_at,
        status: 'pending',
        hourly_rate: spot.hourly_rate,
        total_hours: totalHours,
        subtotal,
        platform_fee: platformFee,
        total_amount: totalAmount,
        stripe_payment_intent_id: paymentIntent.id,
        idempotency_key: idempotency_key || crypto.randomUUID()
      })
      .select()
      .single();

    if (bookingError) {
      console.error('Booking creation error:', bookingError);
      // Cancel the payment intent if booking creation failed
      await stripe.paymentIntents.cancel(paymentIntent.id);
      throw bookingError;
    }

    // Release the hold if provided
    if (hold_id) {
      await supabase
        .from('booking_holds')
        .delete()
        .eq('id', hold_id);
    }

    console.log('Booking created:', booking.id);

    return new Response(JSON.stringify({
      booking_id: booking.id,
      client_secret: paymentIntent.client_secret,
      total_amount: totalAmount,
      platform_fee: platformFee
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Booking creation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});