import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import Stripe from 'https://esm.sh/stripe@17.5.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { bookingId, newStartAt, newEndAt } = await req.json();

    if (!bookingId || !newStartAt || !newEndAt) {
      throw new Error('Missing required fields');
    }

    // Fetch the booking
    const { data: booking, error: bookingError } = await supabaseClient
      .from('bookings')
      .select('*, spots!inner(hourly_rate, host_id)')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      throw new Error('Booking not found');
    }

    // Verify user is the renter
    if (booking.renter_id !== user.id) {
      throw new Error('Unauthorized: You are not the renter');
    }

    // Verify booking is active or paid
    if (booking.status !== 'active' && booking.status !== 'paid') {
      throw new Error('Booking cannot be modified');
    }

    // Verify booking hasn't started yet - after start, driver can only extend
    const startTime = new Date(booking.start_at);
    const now = new Date();

    if (now >= startTime) {
      throw new Error('Cannot modify booking after it has started. Use extend instead.');
    }

    // Validate new times
    const newStart = new Date(newStartAt);
    const newEnd = new Date(newEndAt);

    if (newEnd <= newStart) {
      throw new Error('End time must be after start time');
    }

    // Check if spot is available for new times
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: isAvailable, error: availError } = await supabaseAdmin.rpc('check_spot_availability', {
      p_spot_id: booking.spot_id,
      p_start_at: newStartAt,
      p_end_at: newEndAt,
      p_exclude_booking_id: bookingId,
      p_exclude_user_id: user.id
    });

    if (availError || !isAvailable) {
      throw new Error('Spot is not available for the requested times');
    }

    // Calculate new costs with invisible upcharge + visible service fee
    const durationMs = newEnd.getTime() - newStart.getTime();
    const newTotalHours = durationMs / (1000 * 60 * 60);
    const hostHourlyRate = booking.spots.hourly_rate;
    const hostEarnings = hostHourlyRate * newTotalHours;
    const upcharge = Math.max(hostHourlyRate * 0.20, 1.00);
    const driverHourlyRate = hostHourlyRate + upcharge;
    const driverSubtotal = Math.round(driverHourlyRate * newTotalHours * 100) / 100;
    const newPlatformFee = Math.round(Math.max(hostEarnings * 0.20, 1.00) * 100) / 100;
    const newSubtotal = driverSubtotal;
    const newTotalAmount = Math.round((driverSubtotal + newPlatformFee) * 100) / 100;

    const priceDifference = newTotalAmount - booking.total_amount;
    const absoluteDifference = Math.abs(priceDifference);

    console.log('Pricing calculation:', {
      oldTotalHours: booking.total_hours,
      newTotalHours,
      hostHourlyRate,
      oldTotalAmount: booking.total_amount,
      newTotalAmount,
      priceDifference,
      willCharge: priceDifference > 0,
      willRefund: priceDifference < 0
    });

    // Only process payment if difference is significant (> $0.50)
    if (absoluteDifference > 0.50) {
      const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
        apiVersion: '2024-11-20.acacia',
      });

      // Get user's Stripe customer ID
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('stripe_customer_id')
        .eq('user_id', user.id)
        .single();

      if (!profile?.stripe_customer_id) {
        throw new Error('No payment method found');
      }

      if (priceDifference > 0) {
        // Charge additional amount
        console.log(`Charging additional $${absoluteDifference.toFixed(2)}`);
        
        // Get customer's default payment method
        const paymentMethods = await stripe.paymentMethods.list({
          customer: profile.stripe_customer_id,
          type: 'card',
          limit: 1,
        });

        if (paymentMethods.data.length === 0) {
          throw new Error('No payment method on file. Please add a payment method first.');
        }

        const defaultPaymentMethod = paymentMethods.data[0].id;
        
        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(absoluteDifference * 100),
          currency: 'usd',
          customer: profile.stripe_customer_id,
          payment_method: defaultPaymentMethod,
          description: `Booking modification for ${booking.spots.title}`,
          metadata: {
            booking_id: bookingId,
            type: 'booking_modification'
          },
          off_session: true,
          confirm: true,
        });

        if (paymentIntent.status !== 'succeeded') {
          throw new Error('Payment failed');
        }
      } else {
        // Refund difference
        console.log(`Refunding $${absoluteDifference.toFixed(2)}`);

        if (booking.stripe_payment_intent_id) {
          const refund = await stripe.refunds.create({
            payment_intent: booking.stripe_payment_intent_id,
            amount: Math.round(absoluteDifference * 100),
          });

          if (refund.status !== 'succeeded') {
            console.log('Refund pending:', refund.status);
          }
        }
      }
    }

    // Update the booking
    const { error: updateError } = await supabaseAdmin
      .from('bookings')
      .update({
        start_at: newStartAt,
        end_at: newEndAt,
        total_hours: newTotalHours,
        subtotal: newSubtotal,
        platform_fee: newPlatformFee,
        total_amount: newTotalAmount,
        updated_at: new Date().toISOString()
      })
      .eq('id', bookingId);

    if (updateError) {
      throw updateError;
    }

    // Send notifications
    await supabaseAdmin.from('notifications').insert([
      {
        user_id: booking.spots.host_id,
        type: 'booking_modified',
        title: 'Booking Times Modified',
        message: `A booking at your spot has been rescheduled.`,
        related_id: bookingId,
      },
      {
        user_id: user.id,
        type: 'booking_modified',
        title: 'Booking Updated',
        message: `Your booking times have been successfully modified.`,
        related_id: bookingId,
      }
    ]);

    return new Response(
      JSON.stringify({
        success: true,
        priceDifference: priceDifference > 0 ? absoluteDifference : -absoluteDifference,
        newTotalAmount
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error modifying booking:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
