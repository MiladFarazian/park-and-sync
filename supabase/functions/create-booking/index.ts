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
  will_use_ev_charging?: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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

    console.log('Creating booking:', { spot_id, start_at, end_at, user_id: userData.user.id, useEvCharging });

    // Re-check availability before proceeding
    console.log('Re-checking spot availability...');
    const { data: isAvailable, error: availabilityError } = await supabase.rpc('check_spot_availability', {
      p_spot_id: spot_id,
      p_start_at: start_at,
      p_end_at: end_at,
      p_exclude_user_id: userData.user.id
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

    // Require a valid non-expired hold from this user for exact time window
    // Get the most recent one in case there are duplicates
    console.log('Verifying booking hold...');
    const { data: holds, error: holdError } = await supabase
      .from('booking_holds')
      .select('id, start_at, end_at, expires_at')
      .eq('spot_id', spot_id)
      .eq('user_id', userData.user.id)
      .eq('start_at', start_at)
      .eq('end_at', end_at)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1);
    
    const hold = holds?.[0] || null;

    if (holdError) {
      console.error('Hold verification error:', holdError);
      throw holdError;
    }

    if (!hold) {
      console.error('Missing or expired booking hold:', { spot_id, user_id: userData.user.id, start_at, end_at });
      return new Response(JSON.stringify({ 
        error: 'Missing or expired booking hold for this time window. Please try booking again.' 
      }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Valid hold found:', hold.id);

    // Get spot details for pricing
    const { data: spot, error: spotError } = await supabase
      .from('spots')
      .select('*, host_id, instant_book, has_ev_charging, ev_charging_premium_per_hour, ev_charger_type, access_notes, ev_charging_instructions')
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

    const isInstantBook = spot.instant_book !== false; // Default to true for backwards compatibility
    console.log('Spot instant_book setting:', isInstantBook);

    // Check if user is trying to book their own spot
    if (userData.user.id === spot.host_id) {
      console.error('Self-booking attempt:', { user_id: userData.user.id, host_id: spot.host_id });
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
    
    console.log('Pricing calculated:', { totalHours, hostHourlyRate, hostEarnings, driverSubtotal, serviceFee, evChargingFee, totalAmount });

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
          console.log('Stripe customer not found, will create new one');
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
    console.log('Checking for saved payment methods...');
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
      limit: 1,
    });

    // If no saved card, return error prompting user to add one (don't create booking)
    if (paymentMethods.data.length === 0) {
      console.log('No saved payment methods found - not creating booking');
      return new Response(JSON.stringify({ 
        error: 'no_payment_method',
        message: 'Please add a payment method before booking'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Cancel any existing pending bookings for the same spot/time/user to avoid duplicates
    const { error: cancelError } = await supabase
      .from('bookings')
      .update({ 
        status: 'canceled', 
        cancellation_reason: 'Superseded by new booking attempt' 
      })
      .eq('spot_id', spot_id)
      .eq('renter_id', userData.user.id)
      .eq('start_at', start_at)
      .eq('end_at', end_at)
      .eq('status', 'pending');

    if (cancelError) {
      console.warn('Failed to cancel existing pending bookings:', cancelError);
      // Continue anyway - not critical
    }

    const bookingId = crypto.randomUUID();
    
    // Create booking record
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        id: bookingId,
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
        host_earnings: hostEarnings,
        idempotency_key: idempotency_key || crypto.randomUUID(),
        will_use_ev_charging: useEvCharging,
        ev_charging_fee: evChargingFee,
      })
      .select()
      .single();

    if (bookingError) {
      console.error('Booking creation error:', bookingError);
      throw bookingError;
    }

    console.log('Booking created:', booking.id);

    // Handle payment based on instant_book setting
    if (isInstantBook) {
      // INSTANT BOOK: Charge immediately
      console.log('Creating PaymentIntent with saved card (instant book)...');
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

        console.log('PaymentIntent created and confirmed:', paymentIntent.id);

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
          console.error('Failed to update booking status:', updateError);
          throw updateError;
        }

        console.log('Booking activated successfully');

        // Release the hold if provided
        if (hold_id) {
          await supabase
            .from('booking_holds')
            .delete()
            .eq('id', hold_id);
        }

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
            console.error('Failed to create booking notifications:', notificationError);
          }

          // Send confirmation emails
          try {
            const hostEmail = hostUser?.email || hostProfile?.email || '';
            const driverEmail = userData.user.email || renterProfile?.email || '';

            console.log('Sending confirmation emails to:', { hostEmail, driverEmail });

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
            console.error('Failed to send confirmation emails:', emailError);
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
        console.error('Payment failed:', paymentError);
        
        // If 3DS is required or card declined, fallback to checkout session
        const requiresAction = paymentError.type === 'StripeCardError' || 
                              paymentError.code === 'authentication_required' ||
                              paymentError.code === 'card_declined';

        if (requiresAction) {
          console.log('Payment requires additional action, creating checkout session...');
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
      console.log('Creating PaymentIntent with manual capture (requires host approval)...');
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

        console.log('PaymentIntent created with hold:', paymentIntent.id);

        // Update booking to 'held' status (awaiting host approval)
        const { error: updateError } = await supabase
          .from('bookings')
          .update({ 
            status: 'held',
            stripe_payment_intent_id: paymentIntent.id,
          })
          .eq('id', booking.id);

        if (updateError) {
          console.error('Failed to update booking status:', updateError);
          throw updateError;
        }

        console.log('Booking set to held status, awaiting host approval');

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
            console.error('Failed to create booking notifications:', notificationError);
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
        console.error('Payment hold failed:', paymentError);
        
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
    console.error('Booking creation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});