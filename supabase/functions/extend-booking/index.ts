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

    const { bookingId, extensionHours }: ExtendBookingRequest = await req.json();

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
    const stripe = new Stripe(stripeSecret, {});

    // Get customer ID and default payment method
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('user_id', userData.user.id)
      .single();

    if (!profile?.stripe_customer_id) {
      throw new Error('Payment method not found. Please add a payment method first.');
    }

    // Get customer's default payment method from Stripe
    const customer = await stripe.customers.retrieve(profile.stripe_customer_id);
    
    if (!customer || customer.deleted) {
      throw new Error('Customer not found');
    }

    const defaultPaymentMethodId = customer.invoice_settings?.default_payment_method;
    
    if (!defaultPaymentMethodId) {
      throw new Error('No payment method on file. Please add a payment method in your profile.');
    }

    // Create payment intent for extension with saved payment method
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(extensionCost * 100),
      currency: 'usd',
      customer: profile.stripe_customer_id,
      payment_method: defaultPaymentMethodId as string,
      off_session: true,
      confirm: true,
      metadata: {
        booking_id: bookingId,
        extension_hours: extensionHours.toString(),
        host_id: booking.spots.host_id,
        renter_id: userData.user.id,
        type: 'extension'
      }
    });

    if (paymentIntent.status !== 'succeeded') {
      throw new Error('Payment failed. Please check your payment method.');
    }

    // Update booking with new end time and charges
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        end_at: newEndTime.toISOString(),
        total_hours: booking.total_hours + extensionHours,
        subtotal: booking.subtotal + extensionCost,
        platform_fee: booking.platform_fee + platformFee,
        total_amount: booking.total_amount + extensionCost,
        host_earnings: (booking.host_earnings || 0) + hostEarnings,
      })
      .eq('id', bookingId);

    if (updateError) {
      console.error('Failed to update booking:', updateError);
      // Refund the payment if booking update fails
      await stripe.refunds.create({ payment_intent: paymentIntent.id });
      throw new Error('Failed to extend booking');
    }

    // Credit host's balance
    const { error: balanceError } = await supabase
      .from('profiles')
      .update({ 
        balance: supabase.sql`balance + ${hostEarnings}`
      })
      .eq('user_id', booking.spots.host_id);

    if (balanceError) {
      console.error('Failed to update host balance:', balanceError);
    }

    // Get renter and host profiles for notification
    const { data: renterProfile } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', userData.user.id)
      .single();

    const { data: hostProfile } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', booking.spots.host_id)
      .single();

    // Send notification to host
    const hostNotification = {
      user_id: booking.spots.host_id,
      type: 'booking',
      title: 'Booking Extended',
      message: `${renterProfile?.first_name || 'A driver'} extended their booking at ${booking.spots.title} by ${extensionHours} hour${extensionHours > 1 ? 's' : ''}`,
      related_id: bookingId,
    };

    await supabase.from('notifications').insert(hostNotification);

    // Send notification to renter
    const renterNotification = {
      user_id: userData.user.id,
      type: 'booking',
      title: 'Extension Confirmed',
      message: `Your parking at ${booking.spots.title} has been extended until ${newEndTime.toLocaleString()}`,
      related_id: bookingId,
    };

    await supabase.from('notifications').insert(renterNotification);

    console.log('Booking extended successfully:', {
      bookingId,
      newEndTime,
      extensionCost,
      hostEarnings
    });

    return new Response(JSON.stringify({
      success: true,
      newEndTime: newEndTime.toISOString(),
      extensionCost,
      message: `Booking extended by ${extensionHours} hour${extensionHours > 1 ? 's' : ''}`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Extension error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
