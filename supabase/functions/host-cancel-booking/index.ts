import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { getCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { logger } from "../_shared/logger.ts";

const log = logger.scope('host-cancel-booking');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bookingId, reason } = await req.json();
    logStep('Request received', { bookingId, reason });

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
    log.debug('User authenticated', { userId: user.id });

    // Get booking details with spot info
    const { data: booking, error: bookingError } = await supabaseClient
      .from('bookings')
      .select('*, spots(host_id, address, title)')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      throw new Error('Booking not found');
    }
    log.debug('Booking found', { bookingId: booking.id, status: booking.status, renterId: booking.renter_id });

    // Check if user is the host of this spot
    if (booking.spots.host_id !== user.id) {
      throw new Error('Unauthorized: Only the host can cancel this booking');
    }

    // Check if booking is already cancelled
    if (booking.status === 'canceled' || booking.status === 'refunded') {
      throw new Error('Booking is already cancelled');
    }

    // Host-initiated cancellations always get full refund
    const refundAmount = booking.total_amount;
    const refundReason = reason || 'Cancelled by host - spot marked unavailable';
    log.debug('Processing full refund', { refundAmount, refundReason });

    // Process refund if there's a payment
    let refundId = null;
    if (booking.stripe_payment_intent_id) {
      const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
        apiVersion: '2025-08-27.basil',
      });

      try {
        const pi = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id);
        log.debug('PaymentIntent retrieved', { status: pi.status });

        if (pi.status === 'succeeded') {
          // Payment was captured, process refund
          const refund = await stripe.refunds.create({
            payment_intent: booking.stripe_payment_intent_id,
            amount: Math.round(refundAmount * 100),
            reason: 'requested_by_customer',
          });
          refundId = refund.id;
          logStep('Refund created', { refundId, amount: refundAmount });
        } else if (pi.status === 'requires_capture') {
          // Payment was authorized but not captured, cancel the intent
          await stripe.paymentIntents.cancel(pi.id);
          log.debug('PaymentIntent cancelled (was requires_capture)');
        } else if (pi.status !== 'canceled') {
          // Try to cancel any other non-terminal state
          try {
            await stripe.paymentIntents.cancel(pi.id);
            logStep('PaymentIntent cancelled', { previousStatus: pi.status });
          } catch (cancelErr) {
            log.warn('Could not cancel PaymentIntent', { error: String(cancelErr) });
          }
        }
      } catch (stripeError) {
        logStep('Stripe error', { error: String(stripeError) });
        // Continue with booking cancellation even if stripe fails
      }
    }

    // Update booking status
    const { error: updateError } = await supabaseClient
      .from('bookings')
      .update({
        status: 'canceled',
        refund_amount: refundAmount,
        stripe_refund_id: refundId,
        cancellation_reason: refundReason,
      })
      .eq('id', bookingId);

    if (updateError) {
      throw new Error(`Failed to update booking: ${updateError.message}`);
    }
    log.debug('Booking updated to canceled');

    // Create notification for the renter
    const { error: notifError } = await supabaseClient
      .from('notifications')
      .insert({
        user_id: booking.renter_id,
        type: 'booking_cancelled_by_host',
        title: 'Booking Cancelled & Refunded',
        message: `Your booking at ${booking.spots.address} has been cancelled by the host. A full refund of $${refundAmount.toFixed(2)} has been processed.`,
        related_id: bookingId,
      });

    if (notifError) {
      logStep('Failed to create notification', { error: notifError.message });
    } else {
      log.debug('Notification sent to renter');
    }

    // Send push notification to driver
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

      await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          userId: booking.renter_id,
          title: '❌ Booking Cancelled by Host',
          body: `Your booking at ${booking.spots.address} was cancelled. Full refund of $${refundAmount.toFixed(2)} processed.`,
          url: `/activity`,
          type: 'booking_cancelled_by_host',
          bookingId: bookingId,
          requireInteraction: true,
        }),
      });
      log.debug('Push notification sent to driver');
    } catch (pushError) {
      log.error('Failed to send push notification:', { error: pushError instanceof Error ? pushError.message : pushError });
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error('ERROR', { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
