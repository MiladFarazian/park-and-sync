import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { logger } from "../_shared/logger.ts";
import { getCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

const log = logger.scope('create-booking');

// Rate limit configuration (strict for booking creation)
const RATE_LIMIT_PER_MINUTE = 5;
const RATE_LIMIT_PER_HOUR = 20;

// Check rate limit using database - uses user ID for authenticated users
async function checkRateLimit(
  supabase: any,
  userId: string
): Promise<{ allowed: boolean; retryAfter: number }> {
  const functionName = 'create-booking';
  const minuteKey = `user:${userId}:${functionName}:min`;
  const hourKey = `user:${userId}:${functionName}:hour`;

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
      log.warn('Minute rate limit exceeded', { userId: userId.substring(0, 8) });
      return { allowed: false, retryAfter: 60 };
    }

    if (!hourOk) {
      log.warn('Hour rate limit exceeded', { userId: userId.substring(0, 8) });
      return { allowed: false, retryAfter: 3600 };
    }

    return { allowed: true, retryAfter: 0 };
  } catch (error) {
    log.error('Rate limit check failed', { error: (error as Error).message });
    // Fail open - allow the request if rate limiting fails
    return { allowed: true, retryAfter: 0 };
  }
}

interface BookingRequest {
  spot_id: string;
  start_at: string;
  end_at: string;
  vehicle_id?: string;
  hold_id?: string;
  idempotency_key?: string;
  will_use_ev_charging?: boolean;
}

serve(async (req) => {
  // Handle CORS preflight requests
  const preflightResponse = handleCorsPreflight(req);
  if (preflightResponse) return preflightResponse;

  const corsHeaders = getCorsHeaders(req);

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: {
            Authorization: req.headers.get('Authorization') || '',
          },
        },
      }
    );

    // Create admin client for auth operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get authenticated user
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: authError } = await supabase.auth.getUser(token);

    if (authError || !userData.user) {
      throw new Error('User not authenticated');
    }

    // Check rate limit using user ID (more accurate than IP for authenticated users)
    const rateLimit = await checkRateLimit(supabaseAdmin, userData.user.id);
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
      vehicle_id,
      hold_id,
      idempotency_key,
      will_use_ev_charging
    }: BookingRequest = await req.json();

    const useEvCharging = will_use_ev_charging || false;

    log.info('Creating booking', { spotId: spot_id, userId: userData.user.id, useEvCharging });

    // Note: Availability check and hold verification will be done atomically
    // during the booking creation to prevent race conditions
    log.debug('Will use atomic booking creation with row locking');

    // Get spot details for pricing
    // NOTE: Use service-role client to avoid RLS blocking spot reads during booking creation.
    const { data: spot, error: spotError } = await supabaseAdmin
      .from('spots')
      .select(
        'id, title, address, hourly_rate, host_id, instant_book, has_ev_charging, ev_charging_premium_per_hour, ev_charger_type, access_notes, ev_charging_instructions'
      )
      .eq('id', spot_id)
      .single();

    if (spotError || !spot) {
      log.error('Spot lookup failed', { spotId: spot_id, error: spotError?.message });
      return new Response(JSON.stringify({ error: 'Spot not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate EV charging request
    if (useEvCharging && !spot.has_ev_charging) {
      log.warn('EV charging requested but spot does not support it');
      return new Response(JSON.stringify({ 
        error: 'This spot does not offer EV charging' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const isInstantBook = spot.instant_book !== false; // Default to true for backwards compatibility
    log.debug('Spot instant_book setting', { isInstantBook });

    // Check if user is trying to book their own spot
    if (userData.user.id === spot.host_id) {
      log.warn('Self-booking attempt', { userId: userData.user.id });
      throw new Error('You cannot book your own parking spot');
    }

    // Calculate pricing
    // - Driver sees upcharged rate (host rate + 20% or $1 min) as "Host Rate"
    // - Service fee is separate and visible (20% of host earnings or $1 min)
    // - EV charging fee is optional
    const startDate = new Date(start_at);
    const endDate = new Date(end_at);
    // Calculate actual hours as decimal (e.g., 0.5 for 30 minutes)
    const totalHours = Math.round(((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60)) * 100) / 100;
    const hostHourlyRate = parseFloat(spot.hourly_rate);
    const hostEarnings = Math.round(totalHours * hostHourlyRate * 100) / 100; // What host actually earns
    
    // Invisible upcharge on hourly rate
    const upcharge = Math.max(hostHourlyRate * 0.20, 1.00);
    const driverHourlyRate = hostHourlyRate + upcharge;
    const driverSubtotal = Math.round(driverHourlyRate * totalHours * 100) / 100;
    
    // Visible service fee
    const serviceFee = Math.round(Math.max(hostEarnings * 0.20, 1.00) * 100) / 100;
    
    // EV charging fee
    const evChargingPremium = spot.ev_charging_premium_per_hour || 0;
    const evChargingFee = useEvCharging ? Math.round(evChargingPremium * totalHours * 100) / 100 : 0;
    
    const subtotal = driverSubtotal; // What driver sees as rate × hours
    const platformFee = serviceFee; // Visible service fee
    const totalAmount = Math.round((driverSubtotal + serviceFee + evChargingFee) * 100) / 100;
    
    log.debug('Pricing calculated', { totalHours, totalAmount });

    // Initialize Stripe
    const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecret) {
      throw new Error('Stripe secret key not configured');
    }
    const stripe = new Stripe(stripeSecret, { apiVersion: '2023-10-16' });

    // Get or create Stripe customer
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('user_id', userData.user.id)
      .single();

    let customerId = profile?.stripe_customer_id;

    // Verify customer exists in Stripe, or create a new one
    if (customerId) {
      try {
        await stripe.customers.retrieve(customerId);
      } catch (err: any) {
        if (err.code === 'resource_missing') {
          log.debug('Stripe customer not found, will create new one');
          customerId = null;
        } else {
          throw err;
        }
      }
    }

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

    // Check for saved payment methods BEFORE creating booking
    log.debug('Checking for saved payment methods');
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
      limit: 1,
    });

    // If no saved card, return error prompting user to add one (don't create booking)
    if (paymentMethods.data.length === 0) {
      log.info('No saved payment methods found - not creating booking');
      return new Response(JSON.stringify({ 
        error: 'no_payment_method',
        message: 'Please add a payment method before booking'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create booking atomically with row locking (includes hold verification and availability check)
    log.info('Creating booking atomically with row locking');

    const { data: bookingResult, error: bookingError } = await supabase
      .rpc('create_booking_atomic', {
        p_spot_id: spot_id,
        p_user_id: userData.user.id,
        p_start_at: start_at,
        p_end_at: end_at,
        p_vehicle_id: vehicle_id || null,
        p_idempotency_key: idempotency_key || crypto.randomUUID(),
        p_will_use_ev_charging: useEvCharging,
        p_hourly_rate: spot.hourly_rate,
        p_total_hours: totalHours,
        p_subtotal: subtotal,
        p_platform_fee: platformFee,
        p_total_amount: totalAmount,
        p_host_earnings: hostEarnings,
        p_ev_charging_fee: evChargingFee,
      });

    if (bookingError) {
      log.error('Booking creation error', { error: bookingError.message });
      throw bookingError;
    }

    // The atomic function returns an array with one row
    const result = bookingResult?.[0] || bookingResult;

    if (!result?.success) {
      const errorMessage = result?.error_message || 'Failed to create booking';
      log.warn('Atomic booking creation failed', { error: errorMessage });
      return new Response(JSON.stringify({
        error: errorMessage
      }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const bookingId = result.booking_id;
    log.info('Booking created atomically', { bookingId });

    // Fetch the created booking for subsequent operations
    const { data: booking } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();

    // Handle payment based on instant_book setting
    if (isInstantBook) {
      // INSTANT BOOK: Charge immediately
      log.debug('Creating PaymentIntent with saved card (instant book)');
      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(totalAmount * 100),
          currency: 'usd',
          customer: customerId,
          payment_method: paymentMethods.data[0].id,
          off_session: true,
          confirm: true,
          metadata: {
            booking_id: booking.id,
            spot_id,
            host_id: spot.host_id,
            renter_id: userData.user.id,
          },
          description: `Parking at ${spot.title}`,
        });

        log.info('PaymentIntent created and confirmed', { paymentIntentId: paymentIntent.id });

        // Update booking to active and store payment intent ID
        const { error: updateError } = await supabase
          .from('bookings')
          .update({ 
            status: 'active',
            stripe_payment_intent_id: paymentIntent.id,
            stripe_charge_id: paymentIntent.latest_charge as string
          })
          .eq('id', booking.id);

        if (updateError) {
          log.error('Failed to update booking status', { error: updateError.message });
          throw updateError;
        }

        log.info('Booking activated successfully');

        // Note: Hold was already deleted by create_booking_atomic function

        // Get host and renter profiles for notifications and emails
        const { data: hostProfile } = await supabase
          .from('profiles')
          .select('first_name, email')
          .eq('user_id', spot.host_id)
          .single();

        // Get host's auth email using service role client
        const { data: { user: hostUser } } = await supabaseAdmin.auth.admin.getUserById(spot.host_id);

        const { data: renterProfile } = await supabase
          .from('profiles')
          .select('first_name, email')
          .eq('user_id', userData.user.id)
          .single();

        // Create notifications for host and renter with appropriate routing
        if (hostProfile && renterProfile) {
          const hostNotification = {
            user_id: spot.host_id,
            type: 'booking_host',
            title: 'New Booking Received',
            message: `${renterProfile.first_name || 'A driver'} has booked your spot at ${spot.address}`,
            related_id: booking.id,
          };

          const renterNotification = {
            user_id: userData.user.id,
            type: 'booking',
            title: 'Booking Confirmed',
            message: `Your booking at ${spot.address} has been confirmed`,
            related_id: booking.id,
          };

          const { error: notificationError } = await supabaseAdmin
            .from('notifications')
            .insert([hostNotification, renterNotification]);

          if (notificationError) {
            log.error('Failed to create booking notifications', { error: notificationError.message });
          }

          // Send confirmation emails
          try {
            const hostEmail = hostUser?.email || hostProfile?.email || '';
            const driverEmail = userData.user.email || renterProfile?.email || '';

            log.debug('Sending confirmation emails');

            await supabase.functions.invoke('send-booking-confirmation', {
              body: {
                hostEmail,
                hostName: hostProfile?.first_name || 'Host',
                driverEmail,
                driverName: renterProfile?.first_name || 'Driver',
                spotTitle: spot.title,
                spotAddress: spot.address,
                startAt: start_at,
                endAt: end_at,
                totalAmount: totalAmount,
                bookingId: booking.id,
                // Access and EV charging instructions for driver email
                accessNotes: spot.access_notes || '',
                evChargingInstructions: spot.ev_charging_instructions || '',
                hasEvCharging: spot.has_ev_charging || false,
                willUseEvCharging: useEvCharging,
              },
            });
          } catch (emailError) {
            log.error('Failed to send confirmation emails', { error: emailError instanceof Error ? emailError.message : emailError });
          }
        }

        // Return success
        return new Response(JSON.stringify({
          success: true,
          booking_id: booking.id,
          total_amount: totalAmount,
          platform_fee: platformFee
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      } catch (paymentError: any) {
        log.error('Payment failed', { error: paymentError.message, code: paymentError.code });

        // If 3DS is required or card declined, fallback to checkout session
        const requiresAction = paymentError.type === 'StripeCardError' ||
                              paymentError.code === 'authentication_required' ||
                              paymentError.code === 'card_declined';

        if (requiresAction) {
          log.info('Payment requires additional action, creating checkout session');
          const origin = req.headers.get('origin') || 'http://localhost:8080';
          
          const checkoutSession = await stripe.checkout.sessions.create({
            ui_mode: 'embedded',
            customer: customerId,
            payment_method_types: ['card'],
            line_items: [{
              price_data: {
                currency: 'usd',
                product_data: {
                  name: `Parking at ${spot.title}`,
                  description: `${new Date(start_at).toLocaleString()} - ${new Date(end_at).toLocaleString()}`,
                },
                unit_amount: Math.round(totalAmount * 100),
              },
              quantity: 1,
            }],
            mode: 'payment',
            return_url: `${origin}/checkout-success?session_id={CHECKOUT_SESSION_ID}&booking_id=${booking.id}`,
            metadata: {
              booking_id: booking.id,
              spot_id,
              host_id: spot.host_id,
              renter_id: userData.user.id,
            },
          });

          // Update booking with checkout session ID
          await supabase
            .from('bookings')
            .update({ stripe_payment_intent_id: checkoutSession.id })
            .eq('id', booking.id);

          return new Response(JSON.stringify({
            requires_action: true,
            client_secret: checkoutSession.client_secret,
            booking_id: booking.id,
            message: paymentError.code === 'card_declined' ? 'Card declined' : 'Additional verification required'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // For other errors, throw
        throw paymentError;
      }
    } else {
      // NON-INSTANT BOOK: Hold card, wait for host approval
      log.debug('Creating PaymentIntent with manual capture (requires host approval)');
      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(totalAmount * 100),
          currency: 'usd',
          customer: customerId,
          payment_method: paymentMethods.data[0].id,
          off_session: true,
          confirm: true,
          capture_method: 'manual', // Hold funds but don't capture
          metadata: {
            booking_id: booking.id,
            spot_id,
            host_id: spot.host_id,
            renter_id: userData.user.id,
          },
          description: `Parking at ${spot.title} (pending host approval)`,
        });

        log.info('PaymentIntent created with hold', { paymentIntentId: paymentIntent.id });

        // Update booking to 'held' status (awaiting host approval)
        const { error: updateError } = await supabase
          .from('bookings')
          .update({ 
            status: 'held',
            stripe_payment_intent_id: paymentIntent.id,
          })
          .eq('id', booking.id);

        if (updateError) {
          log.error('Failed to update booking status', { error: updateError.message });
          throw updateError;
        }

        log.info('Booking set to held status, awaiting host approval');

        // Get host and renter profiles for notifications
        const { data: hostProfile } = await supabase
          .from('profiles')
          .select('first_name, email')
          .eq('user_id', spot.host_id)
          .single();

        const { data: renterProfile } = await supabase
          .from('profiles')
          .select('first_name, email')
          .eq('user_id', userData.user.id)
          .single();

        // Create notifications
        if (hostProfile && renterProfile) {
          // Host notification - needs to approve
          const hostNotification = {
            user_id: spot.host_id,
            type: 'booking_approval_required',
            title: 'New Booking Request',
            message: `${renterProfile.first_name || 'A driver'} wants to book your spot at ${spot.address}. Approve within 1 hour.`,
            related_id: booking.id,
          };

          // Driver notification - pending approval
          const renterNotification = {
            user_id: userData.user.id,
            type: 'booking_pending',
            title: 'Booking Request Sent',
            message: `Your booking request at ${spot.address} is awaiting host approval. You'll be notified when they respond.`,
            related_id: booking.id,
          };

          const { error: notificationError } = await supabaseAdmin
            .from('notifications')
            .insert([hostNotification, renterNotification]);

          if (notificationError) {
            log.error('Failed to create booking notifications', { error: notificationError.message });
          }
        }

        // Return success with pending status
        return new Response(JSON.stringify({
          success: true,
          pending_approval: true,
          booking_id: booking.id,
          total_amount: totalAmount,
          platform_fee: platformFee,
          message: 'Your booking request has been sent to the host. You will be notified once they approve.',
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      } catch (paymentError: any) {
        log.error('Payment hold failed', { error: paymentError.message, code: paymentError.code });
        
        // Handle card errors
        if (paymentError.type === 'StripeCardError' || paymentError.code === 'card_declined') {
          return new Response(JSON.stringify({
            error: 'Your card was declined. Please update your payment method and try again.',
            booking_id: booking.id
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        throw paymentError;
      }
    }

  } catch (error) {
    log.error('Booking creation error', { error: error instanceof Error ? error.message : error });
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});