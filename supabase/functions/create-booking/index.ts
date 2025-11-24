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
      idempotency_key 
    }: BookingRequest = await req.json();

    console.log('Creating booking:', { spot_id, start_at, end_at, user_id: userData.user.id });

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
    console.log('Verifying booking hold...');
    const { data: hold, error: holdError } = await supabase
      .from('booking_holds')
      .select('id, start_at, end_at, expires_at')
      .eq('spot_id', spot_id)
      .eq('user_id', userData.user.id)
      .eq('start_at', start_at)
      .eq('end_at', end_at)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

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
      .select('*, host_id')
      .eq('id', spot_id)
      .single();

    if (spotError || !spot) {
      throw new Error('Spot not found');
    }

    // Check if user is trying to book their own spot
    if (userData.user.id === spot.host_id) {
      console.error('Self-booking attempt:', { user_id: userData.user.id, host_id: spot.host_id });
      throw new Error('You cannot book your own parking spot');
    }

    // Calculate pricing
    const startDate = new Date(start_at);
    const endDate = new Date(end_at);
    const totalHours = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60));
    const subtotal = totalHours * parseFloat(spot.hourly_rate);
    const platformFee = Math.round(subtotal * 0.15 * 100) / 100; // 15% platform fee
    const hostEarnings = subtotal - platformFee; // Host gets subtotal minus platform fee
    const totalAmount = subtotal;

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

    // Check for saved payment methods
    console.log('Checking for saved payment methods...');
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
      limit: 1,
    });

    const bookingId = crypto.randomUUID();
    
    // Create booking record first
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
        idempotency_key: idempotency_key || crypto.randomUUID()
      })
      .select()
      .single();

    if (bookingError) {
      console.error('Booking creation error:', bookingError);
      throw bookingError;
    }

    console.log('Booking created:', booking.id);

    // If no saved card, return error prompting user to add one
    if (paymentMethods.data.length === 0) {
      console.log('No saved payment methods found');
      return new Response(JSON.stringify({ 
        error: 'no_payment_method',
        message: 'Please add a payment method before booking',
        booking_id: booking.id
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Try to charge the saved card
    console.log('Creating PaymentIntent with saved card...');
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

    // Create notifications for host and renter
    if (hostProfile && renterProfile) {
      const hostNotification = {
        user_id: spot.host_id,
        type: 'booking',
        title: 'New Booking Confirmed',
        message: `${renterProfile.first_name || 'A driver'} has booked your spot at ${spot.address}`,
        related_id: booking.id,
      };

      const renterNotification = {
        user_id: userData.user.id,
        type: 'booking',
        title: 'Booking Created',
        message: `Your booking at ${spot.address} will be confirmed once payment is complete`,
        related_id: booking.id,
      };

      await supabase.from('notifications').insert([hostNotification, renterNotification]);

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
          },
        });
      } catch (emailError) {
        console.error('Failed to send confirmation emails:', emailError);
        // Don't fail the booking if email fails
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

  } catch (error) {
    console.error('Booking creation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});