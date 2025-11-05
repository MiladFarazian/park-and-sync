import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExtendBookingRequest {
  bookingId: string;
  extensionHours: number;
  paymentMethodId?: string;
  finalize?: boolean;
  paymentIntentId?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const userSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const { data: userData, error: authError } = await userSupabase.auth.getUser();
    
    if (authError || !userData.user) {
      throw new Error('User not authenticated');
    }

    const { bookingId, extensionHours, paymentMethodId, finalize, paymentIntentId }: ExtendBookingRequest = await req.json();

    console.log('Extending booking:', { bookingId, extensionHours, userId: userData.user.id });

    // Validate extension hours
    if (!extensionHours || extensionHours < 1 || extensionHours > 24) {
      throw new Error('Extension must be between 1 and 24 hours');
    }

    // Get booking details
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        *,
        spots!inner(
          id,
          title,
          address,
          hourly_rate,
          host_id
        )
      `)
      .eq('id', bookingId)
      .eq('renter_id', userData.user.id)
      .single();

    if (bookingError || !booking) {
      throw new Error('Booking not found or access denied');
    }

    // Check if booking is active
    if (booking.status !== 'active' && booking.status !== 'paid') {
      throw new Error('Only active bookings can be extended');
    }

    // Calculate new end time
    const currentEndTime = new Date(booking.end_at);
    const newEndTime = new Date(currentEndTime.getTime() + extensionHours * 60 * 60 * 1000);
    
    // Check for conflicts with other bookings
    const { data: conflictingBookings, error: conflictError } = await supabase
      .from('bookings')
      .select('id')
      .eq('spot_id', booking.spot_id)
      .neq('id', bookingId)
      .in('status', ['active', 'paid', 'pending'])
      .lte('start_at', newEndTime.toISOString())
      .gte('end_at', currentEndTime.toISOString());

    if (conflictError) {
      console.error('Error checking conflicts:', conflictError);
      throw new Error('Failed to check booking availability');
    }

    if (conflictingBookings && conflictingBookings.length > 0) {
      throw new Error('This spot has another booking during the requested extension period. Please choose a shorter extension.');
    }

    // Calculate extension cost
    const extensionCost = booking.spots.hourly_rate * extensionHours;
    const platformFee = Math.round(extensionCost * 0.15 * 100) / 100;
    const hostEarnings = extensionCost - platformFee;

    // Initialize Stripe
    const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecret) {
      throw new Error('Stripe secret key not configured');
    }
    const stripe = new Stripe(stripeSecret, {
      apiVersion: '2025-08-27.basil',
    });

    // Get customer ID
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('user_id', userData.user.id)
      .single();

    let customerId = profile?.stripe_customer_id as string | undefined;

    // Create or get customer
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userData.user.email!,
        metadata: { supabase_user_id: userData.user.id },
      });
      customerId = customer.id;
      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('user_id', userData.user.id);
    }

    // Finalize path: called after client handles 3DS
    if (finalize && paymentIntentId) {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (pi.status !== 'succeeded') {
        throw new Error('Payment not completed');
      }

      // Update the booking with new end time
      const { error: updateError } = await supabase
        .from('bookings')
        .update({
          end_at: newEndTime.toISOString(),
          total_amount: booking.total_amount + extensionCost,
          updated_at: new Date().toISOString(),
        })
        .eq('id', bookingId);
      if (updateError) {
        console.error('Error updating booking:', updateError);
        throw new Error('Payment succeeded but failed to update booking. Please contact support.');
      }

      // Credit the host
      const { error: balanceError } = await supabase.rpc('increment_balance', {
        user_id: booking.spots.host_id,
        amount: hostEarnings,
      });
      if (balanceError) console.error('Error updating host balance:', balanceError);

      return new Response(JSON.stringify({
        success: true,
        message: `Booking extended by ${extensionHours} hour${extensionHours > 1 ? 's' : ''}`,
        newEndTime: newEndTime.toISOString(),
        extensionCost,
        paymentIntentId,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Resolve payment method
    let resolvedPaymentMethodId = paymentMethodId as string | undefined;

    if (resolvedPaymentMethodId) {
      try {
        const pm = await stripe.paymentMethods.retrieve(resolvedPaymentMethodId);
        if (!pm.customer) {
          await stripe.paymentMethods.attach(resolvedPaymentMethodId, { customer: customerId! });
        }
      } catch (e) {
        console.error('Provided payment method invalid or cannot be attached', e);
        throw new Error('Invalid payment method');
      }
    } else {
      const { data: methods } = await stripe.paymentMethods.list({ customer: customerId!, type: 'card' });
      if (!methods || methods.data.length === 0) {
        throw new Error('No payment method on file. Please add a payment method in your profile.');
      }
      resolvedPaymentMethodId = methods.data[0].id;
    }

    // Create and confirm PaymentIntent (on-session)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(extensionCost * 100),
      currency: 'usd',
      customer: customerId!,
      payment_method: resolvedPaymentMethodId,
      confirm: true,
      description: `Parking Extension - ${booking.spots.title}`,
      metadata: {
        booking_id: bookingId,
        extension_hours: extensionHours.toString(),
        host_id: booking.spots.host_id,
        renter_id: userData.user.id,
        type: 'extension',
        new_end_time: newEndTime.toISOString(),
        host_earnings: hostEarnings.toString(),
        platform_fee: platformFee.toString(),
      },
    });

    if (paymentIntent.status === 'requires_action') {
      return new Response(JSON.stringify({
        requiresAction: true,
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        message: 'Additional authentication required',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (paymentIntent.status !== 'succeeded') {
      throw new Error('Payment failed. Please try again or update your payment method.');
    }

    // Update booking on success
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        end_at: newEndTime.toISOString(),
        total_amount: booking.total_amount + extensionCost,
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId);

    if (updateError) {
      console.error('Error updating booking:', updateError);
      throw new Error('Payment succeeded but failed to update booking. Please contact support.');
    }

    const { error: balanceError } = await supabase.rpc('increment_balance', {
      user_id: booking.spots.host_id,
      amount: hostEarnings,
    });
    if (balanceError) console.error('Error updating host balance:', balanceError);

    return new Response(JSON.stringify({
      success: true,
      message: `Booking extended by ${extensionHours} hour${extensionHours > 1 ? 's' : ''}`,
      newEndTime: newEndTime.toISOString(),
      extensionCost,
      paymentIntentId: paymentIntent.id,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Extension error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
