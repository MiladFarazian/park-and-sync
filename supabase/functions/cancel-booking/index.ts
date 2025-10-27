import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bookingId } = await req.json();

    if (!bookingId) {
      throw new Error('Booking ID is required');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Authenticate user
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      throw new Error('User not authenticated');
    }

    // Get booking details
    const { data: booking, error: bookingError } = await supabaseClient
      .from('bookings')
      .select('*, spots(host_id)')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      throw new Error('Booking not found');
    }

    // Check if user owns the booking
    if (booking.user_id !== user.id) {
      throw new Error('Unauthorized to cancel this booking');
    }

    // Check if booking is already cancelled
    if (booking.status === 'canceled') {
      throw new Error('Booking is already cancelled');
    }

    const now = new Date();
    const bookingStart = new Date(booking.start_time);
    const bookingCreated = new Date(booking.created_at);
    const gracePeriodEnd = new Date(bookingCreated.getTime() + 10 * 60 * 1000); // 10 minutes after booking
    const oneHourBeforeStart = new Date(bookingStart.getTime() - 60 * 60 * 1000);

    let refundAmount = 0;
    let refundReason = '';

    // Determine refund amount based on cancellation policy
    if (now <= gracePeriodEnd) {
      // Within 10-minute grace period - full refund
      refundAmount = booking.total_price;
      refundReason = 'Within 10-minute grace period';
    } else if (now <= oneHourBeforeStart) {
      // More than 1 hour before start time - full refund
      refundAmount = booking.total_price;
      refundReason = 'Cancelled more than 1 hour before start time';
    } else {
      // Less than 1 hour before start or after start - no refund
      refundAmount = 0;
      refundReason = 'Cancelled within 1 hour of start time';
    }

    console.log(`Cancellation for booking ${bookingId}: Refund amount: $${refundAmount}, Reason: ${refundReason}`);

    // Process refund if applicable
    let refundId = null;
    if (refundAmount > 0 && booking.stripe_payment_intent_id) {
      const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
        apiVersion: '2025-08-27.basil',
      });

      try {
        const refund = await stripe.refunds.create({
          payment_intent: booking.stripe_payment_intent_id,
          amount: Math.round(refundAmount * 100), // Convert to cents
          reason: 'requested_by_customer',
        });

        refundId = refund.id;
        console.log(`Refund created: ${refundId} for amount: $${refundAmount}`);
      } catch (stripeError) {
        console.error('Stripe refund error:', stripeError);
        throw new Error(`Failed to process refund: ${stripeError.message}`);
      }
    }

    // Update booking status
    const { error: updateError } = await supabaseClient
      .from('bookings')
      .update({
        status: 'canceled',
        refund_amount: refundAmount,
        stripe_refund_id: refundId,
      })
      .eq('id', bookingId);

    if (updateError) {
      throw new Error(`Failed to update booking: ${updateError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        refundAmount,
        refundReason,
        refundId,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Cancel booking error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
