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
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Checking for pending bookings needing reminders or expiration...');

    const now = Date.now();
    const sixtyMinutesAgo = new Date(now - 60 * 60 * 1000).toISOString();
    const ninetyMinutesAgo = new Date(now - 90 * 60 * 1000).toISOString();

    // ============================================
    // PART 1: Send reminders for bookings at 60+ minutes (30 min before expiration)
    // ============================================
    const { data: bookingsNeedingReminder, error: reminderFetchError } = await supabaseAdmin
      .from('bookings')
      .select(`
        id,
        renter_id,
        spot_id,
        start_at,
        end_at,
        total_amount,
        spots (host_id, address, category, title)
      `)
      .eq('status', 'held')
      .lt('created_at', sixtyMinutesAgo)
      .gte('created_at', ninetyMinutesAgo);

    if (reminderFetchError) {
      console.error('Error fetching bookings for reminders:', reminderFetchError);
    } else if (bookingsNeedingReminder && bookingsNeedingReminder.length > 0) {
      console.log(`Found ${bookingsNeedingReminder.length} bookings needing reminders`);

      for (const booking of bookingsNeedingReminder) {
        const hostId = booking.spots?.host_id;
        if (!hostId) continue;

        // Check if reminder already sent for this booking
        const { data: existingReminder } = await supabaseAdmin
          .from('notifications')
          .select('id')
          .eq('user_id', hostId)
          .eq('related_id', booking.id)
          .eq('type', 'booking_reminder_host')
          .single();

        if (existingReminder) {
          console.log(`Reminder already sent for booking ${booking.id}`);
          continue;
        }

        // Get renter info
        const { data: renterProfile } = await supabaseAdmin
          .from('profiles')
          .select('first_name')
          .eq('user_id', booking.renter_id)
          .single();

        const renterName = renterProfile?.first_name || 'A driver';
        const spotAddress = booking.spots?.address || 'your parking spot';

        // Create reminder notification for host
        await supabaseAdmin
          .from('notifications')
          .insert({
            user_id: hostId,
            type: 'booking_reminder_host',
            title: '⏰ Booking Request Expiring Soon',
            message: `${renterName}'s booking request at ${spotAddress} will expire in 30 minutes. Please approve or decline it soon.`,
            related_id: booking.id,
          });

        // Send push notification to host
        try {
          const { data: subscriptions } = await supabaseAdmin
            .from('push_subscriptions')
            .select('*')
            .eq('user_id', hostId);

          if (subscriptions && subscriptions.length > 0) {
            await supabaseAdmin.functions.invoke('send-push-notification', {
              body: {
                subscriptions,
                title: '⏰ Booking Request Expiring Soon',
                body: `${renterName}'s booking request will expire in 30 minutes. Approve or decline now.`,
                data: { url: `/host-booking-confirmation/${booking.id}` },
              },
            });
          }
        } catch (pushError) {
          console.error(`Failed to send push notification for booking ${booking.id}:`, pushError);
        }

        console.log(`Sent reminder for booking ${booking.id} to host ${hostId}`);
      }
    } else {
      console.log('No bookings need reminders');
    }

    // ============================================
    // PART 2: Expire bookings older than 90 minutes
    // ============================================
    const { data: expiredBookings, error: fetchError } = await supabaseAdmin
      .from('bookings')
      .select(`
        id,
        stripe_payment_intent_id,
        renter_id,
        spot_id,
        spots (address)
      `)
      .eq('status', 'held')
      .lt('created_at', ninetyMinutesAgo);

    if (fetchError) {
      console.error('Error fetching expired bookings:', fetchError);
      throw fetchError;
    }

    if (!expiredBookings || expiredBookings.length === 0) {
      console.log('No expired bookings found');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No expired bookings found',
        expired_count: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Found ${expiredBookings.length} expired bookings`);

    // Initialize Stripe
    const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecret) {
      throw new Error('Stripe secret key not configured');
    }
    const stripe = new Stripe(stripeSecret, { apiVersion: '2023-10-16' });

    let expiredCount = 0;

    for (const booking of expiredBookings) {
      try {
        // Cancel the held payment intent
        if (booking.stripe_payment_intent_id) {
          console.log('Canceling payment intent:', booking.stripe_payment_intent_id);
          await stripe.paymentIntents.cancel(booking.stripe_payment_intent_id);
        }

        // Update booking to canceled
        await supabaseAdmin
          .from('bookings')
          .update({ 
            status: 'canceled',
            cancellation_reason: 'Booking request expired - host did not respond within 1.5 hours'
          })
          .eq('id', booking.id);

        // Delete the booking hold if it exists
        await supabaseAdmin
          .from('booking_holds')
          .delete()
          .eq('spot_id', booking.spot_id)
          .eq('user_id', booking.renter_id);

        // Notify driver
        await supabaseAdmin
          .from('notifications')
          .insert({
            user_id: booking.renter_id,
            type: 'booking',
            title: 'Booking Request Expired',
            message: `Your booking request at ${booking.spots?.address || 'the parking spot'} expired because the host didn't respond within 1.5 hours. Your card was not charged.`,
            related_id: booking.id,
          });

        expiredCount++;
        console.log(`Expired booking ${booking.id}`);
      } catch (bookingError) {
        console.error(`Failed to expire booking ${booking.id}:`, bookingError);
      }
    }

    console.log(`Successfully expired ${expiredCount} bookings`);

    return new Response(JSON.stringify({
      success: true,
      message: `Expired ${expiredCount} bookings`,
      expired_count: expiredCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Expire pending bookings error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
