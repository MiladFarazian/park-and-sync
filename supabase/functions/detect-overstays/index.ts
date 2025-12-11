import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to send push notifications
async function sendPushNotification(
  supabaseClient: any,
  userId: string,
  title: string,
  body: string,
  tag: string,
  url: string,
  requireInteraction: boolean = false
) {
  try {
    // Fetch push subscriptions for the user
    const { data: subscriptions } = await supabaseClient
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', userId);

    if (!subscriptions || subscriptions.length === 0) {
      console.log(`No push subscriptions for user ${userId}`);
      return;
    }

    // Call the send-push-notification function
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const response = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        userId,
        title,
        body,
        tag,
        url,
        requireInteraction,
      }),
    });

    if (!response.ok) {
      console.error(`Failed to send push notification: ${response.status}`);
    } else {
      console.log(`Push notification sent to user ${userId}: "${title}"`);
    }
  } catch (error) {
    console.error('Error sending push notification:', error);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const now = new Date();
    
    // Find active bookings that have passed their end time
    const { data: overstayedBookings, error: fetchError } = await supabaseClient
      .from('bookings')
      .select(`
        *,
        spots (
          title,
          address,
          hourly_rate,
          host_id
        ),
        profiles:renter_id (
          first_name,
          last_name,
          email
        )
      `)
      .in('status', ['active', 'paid'])
      .lt('end_at', now.toISOString())
      .is('overstay_detected_at', null);

    if (fetchError) throw fetchError;

    console.log(`Found ${overstayedBookings?.length || 0} overstayed bookings`);

    for (const booking of overstayedBookings || []) {
      // Set overstay detection time and 10-minute grace period
      const graceEnd = new Date(now.getTime() + 10 * 60 * 1000);
      
      const { error: updateError } = await supabaseClient
        .from('bookings')
        .update({
          overstay_detected_at: now.toISOString(),
          overstay_grace_end: graceEnd.toISOString(),
        })
        .eq('id', booking.id);

      if (updateError) {
        console.error('Error updating booking:', updateError);
        continue;
      }

      // Send notification to renter (warning)
      const renterTitle = '⏰ Grace Period Started';
      const renterMessage = `Your parking at ${booking.spots.title} has expired. You have a 10-minute grace period to vacate or extend your booking. After that, overtime charges of $25/hour may apply.`;
      
      await supabaseClient
        .from('notifications')
        .insert({
          user_id: booking.renter_id,
          type: 'overstay_warning',
          title: renterTitle,
          message: renterMessage,
          related_id: booking.id,
        });

      // Send PUSH notification to renter (works even when app is closed)
      await sendPushNotification(
        supabaseClient,
        booking.renter_id,
        renterTitle,
        renterMessage,
        `grace-period-${booking.id}`,
        `/booking/${booking.id}`,
        true // requireInteraction - critical notification
      );

      // Send notification to host
      const hostTitle = 'Guest Overstay Detected';
      const hostMessage = `Guest at ${booking.spots.title} has exceeded their booking time. 10-minute grace period started.`;
      
      await supabaseClient
        .from('notifications')
        .insert({
          user_id: booking.spots.host_id,
          type: 'overstay_detected',
          title: hostTitle,
          message: hostMessage,
          related_id: booking.id,
        });

      // Send PUSH notification to host
      await sendPushNotification(
        supabaseClient,
        booking.spots.host_id,
        hostTitle,
        hostMessage,
        `overstay-host-${booking.id}`,
        `/booking/${booking.id}`,
        true
      );
    }

    // Check for bookings past grace period that need charging or escalation
    const { data: postGraceBookings, error: graceError } = await supabaseClient
      .from('bookings')
      .select(`
        *,
        spots (
          title,
          hourly_rate,
          host_id
        )
      `)
      .in('status', ['active', 'paid'])
      .not('overstay_detected_at', 'is', null)
      .lt('overstay_grace_end', now.toISOString())
      .is('overstay_action', null);

    if (graceError) throw graceError;

    console.log(`Found ${postGraceBookings?.length || 0} bookings past grace period`);

    for (const booking of postGraceBookings || []) {
      // Notify host that grace period has ended and they can take action
      await supabaseClient
        .from('notifications')
        .insert({
          user_id: booking.spots.host_id,
          type: 'overstay_action_needed',
          title: 'Guest Overstay - Action Needed',
          message: `Grace period ended for ${booking.spots.title}. You can now charge overtime or request towing.`,
          related_id: booking.id,
        });

      // Notify guest that grace period has ended
      await supabaseClient
        .from('notifications')
        .insert({
          user_id: booking.renter_id,
          type: 'overstay_grace_ended',
          title: 'Overtime Charges May Apply',
          message: `Your grace period has ended. Please vacate ${booking.spots.title} immediately or you may incur overtime charges.`,
          related_id: booking.id,
        });
    }

    // Calculate overtime charges for bookings with charging action
    const { data: chargingBookings, error: chargingError } = await supabaseClient
      .from('bookings')
      .select(`
        *,
        spots (
          hourly_rate,
          host_id
        )
      `)
      .in('status', ['active', 'paid'])
      .eq('overstay_action', 'charging')
      .lt('overstay_grace_end', now.toISOString());

    if (chargingError) throw chargingError;

    for (const booking of chargingBookings || []) {
      const graceEnd = new Date(booking.overstay_grace_end);
      const minutesOverstayed = Math.max(0, (now.getTime() - graceEnd.getTime()) / (1000 * 60));
      const hoursOverstayed = minutesOverstayed / 60;
      const overtimeRate = 25; // $25/hour
      const overtimeCharge = Math.ceil(hoursOverstayed) * overtimeRate;

      // Only update if charge amount changed
      if (overtimeCharge !== booking.overstay_charge_amount) {
        await supabaseClient
          .from('bookings')
          .update({
            overstay_charge_amount: overtimeCharge,
          })
          .eq('id', booking.id);

        console.log(`Updated overstay charge for booking ${booking.id}: $${overtimeCharge}`);

        // Send notification every $25 increment
        const chargeIncrease = overtimeCharge - (booking.overstay_charge_amount || 0);
        if (chargeIncrease >= 25) {
          await supabaseClient
            .from('notifications')
            .insert({
              user_id: booking.renter_id,
              type: 'overstay_charge_update',
              title: 'Overtime Charges Increasing',
              message: `You are still parked at ${booking.spots.title} past your booking time. Current overtime charge: $${overtimeCharge}. Please vacate immediately.`,
              related_id: booking.id,
            });
        }
      }
    }

    // Auto-complete bookings that ended cleanly (no overstay)
    const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);
    const { data: cleanBookings, error: cleanError } = await supabaseClient
      .from('bookings')
      .select(`
        *,
        spots (
          title,
          host_id
        )
      `)
      .in('status', ['active', 'paid'])
      .lt('end_at', fifteenMinutesAgo.toISOString())
      .is('overstay_detected_at', null)
      .is('departed_at', null);

    if (cleanError) throw cleanError;

    console.log(`Found ${cleanBookings?.length || 0} bookings to auto-complete`);

    for (const booking of cleanBookings || []) {
      // Auto-complete booking
      await supabaseClient
        .from('bookings')
        .update({
          status: 'completed',
          updated_at: now.toISOString(),
        })
        .eq('id', booking.id);

      // Notify host
      await supabaseClient
        .from('notifications')
        .insert({
          user_id: booking.spots.host_id,
          type: 'booking_completed',
          title: 'Booking Completed',
          message: `Booking at ${booking.spots.title} completed successfully.`,
          related_id: booking.id,
        });

      // Notify renter
      await supabaseClient
        .from('notifications')
        .insert({
          user_id: booking.renter_id,
          type: 'booking_completed',
          title: 'Booking Completed',
          message: `Your booking at ${booking.spots.title} has been completed.`,
          related_id: booking.id,
      });
    }

    // Auto-complete bookings with overstays that have been resolved
    // These are bookings where driver overstayed, host charged them, and enough time has passed
    const { data: overstayCompletionBookings, error: overstayCompleteError } = await supabaseClient
      .from('bookings')
      .select(`
        *,
        spots (
          title,
          host_id
        )
      `)
      .in('status', ['active', 'paid'])
      .not('overstay_detected_at', 'is', null)
      .eq('overstay_action', 'charging')
      .lt('end_at', new Date(now.getTime() - 30 * 60 * 1000).toISOString());

    if (!overstayCompleteError && overstayCompletionBookings && overstayCompletionBookings.length > 0) {
      console.log(`Found ${overstayCompletionBookings.length} overstay bookings to complete`);
      
      for (const booking of overstayCompletionBookings) {
        // Finalize the charge amount one last time
        const graceEnd = new Date(booking.overstay_grace_end);
        const minutesOverstayed = Math.max(0, (now.getTime() - graceEnd.getTime()) / (1000 * 60));
        const hoursOverstayed = minutesOverstayed / 60;
        const overtimeRate = 25;
        const finalCharge = Math.ceil(hoursOverstayed) * overtimeRate;
        
        // Mark as completed with final charge
        await supabaseClient
          .from('bookings')
          .update({
            status: 'completed',
            overstay_charge_amount: finalCharge,
            updated_at: now.toISOString(),
          })
          .eq('id', booking.id);
        
        console.log(`Completed overstay booking ${booking.id} with final charge: $${finalCharge}`);
        
        // Notify renter about the final charge
        await supabaseClient
          .from('notifications')
          .insert({
            user_id: booking.renter_id,
            type: 'overstay_charge_finalized',
            title: 'Overtime Charge Applied',
            message: `Your booking at ${booking.spots.title} has been completed. You were charged $${finalCharge} for overstaying. Total charge: $${(booking.total_amount + finalCharge).toFixed(2)}.`,
            related_id: booking.id,
          });
        
        // Notify host
        await supabaseClient
          .from('notifications')
          .insert({
            user_id: booking.spots.host_id,
            type: 'overstay_booking_completed',
            title: 'Overstay Booking Completed',
            message: `Booking at ${booking.spots.title} completed with $${finalCharge} overtime charge applied.`,
            related_id: booking.id,
          });
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Processed ${overstayedBookings?.length || 0} new overstays, ${postGraceBookings?.length || 0} grace period endings, and auto-completed ${cleanBookings?.length || 0} bookings` 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Error detecting overstays:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
