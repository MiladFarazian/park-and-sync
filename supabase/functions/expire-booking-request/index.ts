import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { getCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { logger } from "../_shared/logger.ts";

const log = logger.scope('expire-booking-request');

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

    const { booking_id } = await req.json();

    if (!booking_id) {
      throw new Error('Missing booking_id');
    }

    log.debug('Attempting to expire booking request:', booking_id);

    // Get booking with spot info
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from('bookings')
      .select(`
        *,
        spots (host_id, address, title)
      `)
      .eq('id', booking_id)
      .single();

    if (bookingError || !booking) {
      throw new Error('Booking not found');
    }

    // Verify user is either the renter or the host
    const isRenter = booking.renter_id === userData.user.id;
    const isHost = booking.spots?.host_id === userData.user.id;

    if (!isRenter && !isHost) {
      throw new Error('Only the driver or host can expire this booking request');
    }

    // Verify booking is in 'held' status
    if (booking.status !== 'held') {
      log.debug('Booking already processed', { status: booking.status });
      return new Response(JSON.stringify({
        success: true,
        already_processed: true,
        status: booking.status,
        message: `Booking is already ${booking.status}`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify booking has passed 1-hour expiration window
    const createdAt = new Date(booking.created_at);
    const expiryAt = new Date(createdAt.getTime() + 60 * 60 * 1000); // 1 hour
    const now = new Date();

    if (now < expiryAt) {
      throw new Error('Booking request has not yet expired');
    }

    log.info('Expiring booking request', { bookingId: booking_id });

    // Initialize Stripe
    const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecret) {
      throw new Error('Stripe secret key not configured');
    }
    const stripe = new Stripe(stripeSecret, { apiVersion: '2023-10-16' });

    // Cancel the held payment intent
    if (booking.stripe_payment_intent_id) {
      try {
        log.debug('Canceling payment intent:', booking.stripe_payment_intent_id);
        await stripe.paymentIntents.cancel(booking.stripe_payment_intent_id);
        log.debug('Payment intent canceled');
      } catch (stripeError: any) {
        // Payment intent may already be canceled
        if (stripeError.code !== 'payment_intent_unexpected_state') {
          log.error('Failed to cancel payment intent', { error: stripeError.message });
        }
      }
    }

    // Update booking to canceled
    const { error: updateError } = await supabaseAdmin
      .from('bookings')
      .update({ 
        status: 'canceled',
        cancellation_reason: 'Booking request expired - host did not respond within 1 hour'
      })
      .eq('id', booking_id);

    if (updateError) {
      log.error('Failed to update booking status:', updateError);
      throw updateError;
    }

    // Delete the booking hold if it exists
    await supabaseAdmin
      .from('booking_holds')
      .delete()
      .eq('spot_id', booking.spot_id)
      .eq('user_id', booking.renter_id);

    // Create notifications for both parties
    const notifications = [
      {
        user_id: booking.renter_id,
        type: 'booking',
        title: 'Booking Request Expired',
        message: `Your booking request at ${booking.spots?.address || 'the parking spot'} expired because the host didn't respond within 1 hour. Your card was not charged.`,
        related_id: booking_id,
      }
    ];

    // Add host notification
    if (booking.spots?.host_id) {
      notifications.push({
        user_id: booking.spots.host_id,
        type: 'booking_host',
        title: 'Booking Request Expired',
        message: `A booking request at ${booking.spots?.address || 'your spot'} expired because you didn't respond within 1 hour.`,
        related_id: booking_id,
      });
    }

    const { error: notificationError } = await supabaseAdmin
      .from('notifications')
      .insert(notifications);

    if (notificationError) {
      log.error('Failed to create expiration notifications', { error: notificationError.message });
    }

    // Send push notifications
    try {
      // Notify driver
      await supabaseAdmin.functions.invoke('send-push-notification', {
        body: {
          userId: booking.renter_id,
          title: '⏰ Booking Request Expired',
          body: 'The host didn\'t respond in time. Your card was not charged.',
          url: `/booking-confirmation/${booking_id}`,
          type: 'booking',
        },
      });

      // Notify host
      if (booking.spots?.host_id) {
        await supabaseAdmin.functions.invoke('send-push-notification', {
          body: {
            userId: booking.spots.host_id,
            title: '⏰ Booking Request Expired',
            body: 'You missed a booking request because you didn\'t respond in time.',
            url: `/host-booking-confirmation/${booking_id}`,
            type: 'booking_host',
          },
        });
      }
    } catch (pushError) {
      log.error('Failed to send push notifications', { error: pushError instanceof Error ? pushError.message : pushError });
    }

    log.info('Booking request expired successfully', { bookingId: booking_id });

    return new Response(JSON.stringify({
      success: true,
      message: 'Booking request expired successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    log.error('Expire booking request error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
