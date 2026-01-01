import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "Parkzy <noreply@parkzy.app>";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to send overstay email to host
async function sendHostOverstayEmail(
  supabaseClient: any,
  hostUserId: string,
  spotTitle: string,
  spotAddress: string,
  driverName: string,
  bookingId: string,
  graceEndTime: string
) {
  try {
    // Get host email from profiles
    const { data: hostProfile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('email, first_name')
      .eq('user_id', hostUserId)
      .single();

    if (profileError || !hostProfile?.email) {
      console.log(`No email found for host ${hostUserId}, skipping email notification`);
      return;
    }

    const bookingUrl = `https://parkzy.app/booking/${bookingId}?fromNotification=overstay_host`;

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
              <!-- Header -->
              <div style="text-align: center; margin-bottom: 24px;">
                <h1 style="color: #dc2626; margin: 0; font-size: 24px;">⚠️ Guest Overstay Alert</h1>
              </div>
              
              <!-- Content -->
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
                Hi ${hostProfile.first_name || 'there'},
              </p>
              
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
                A guest has exceeded their booking time at your parking spot. Here are the details:
              </p>
              
              <!-- Booking Details Box -->
              <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 20px 0;">
                <p style="margin: 0 0 8px 0; color: #374151;"><strong>Spot:</strong> ${spotTitle}</p>
                <p style="margin: 0 0 8px 0; color: #374151;"><strong>Address:</strong> ${spotAddress}</p>
                <p style="margin: 0 0 8px 0; color: #374151;"><strong>Driver:</strong> ${driverName}</p>
                <p style="margin: 0; color: #dc2626;"><strong>Grace Period Ends:</strong> ${graceEndTime}</p>
              </div>
              
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                The guest has a 10-minute grace period to leave. After that, you can choose to apply overtime charges ($25/hour) or request a tow.
              </p>
              
              <!-- CTA Button -->
              <div style="text-align: center; margin: 28px 0;">
                <a href="${bookingUrl}" style="display: inline-block; background-color: #6366f1; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                  View Booking & Take Action
                </a>
              </div>
              
              <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 20px 0 0 0;">
                You'll receive another notification when the grace period ends if the guest hasn't left.
              </p>
            </div>
            
            <!-- Footer -->
            <div style="text-align: center; padding: 20px;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                © ${new Date().getFullYear()} Parkzy. All rights reserved.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    const { error: emailError } = await resend.emails.send({
      from: fromEmail,
      to: [hostProfile.email],
      subject: `⚠️ Guest Overstay Alert - ${spotTitle}`,
      html: emailHtml,
    });

    if (emailError) {
      console.error(`Failed to send overstay email to host ${hostUserId}:`, emailError);
    } else {
      console.log(`Sent overstay alert email to host ${hostProfile.email} for booking ${bookingId}`);
    }
  } catch (error) {
    console.error('Error sending host overstay email:', error);
  }
}

// Helper function to send grace period warning email to driver
async function sendDriverGracePeriodEmail(
  supabaseClient: any,
  driverUserId: string,
  spotTitle: string,
  spotAddress: string,
  bookingId: string,
  graceEndTime: string,
  hourlyRate: number
) {
  try {
    // Get driver email from profiles
    const { data: driverProfile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('email, first_name')
      .eq('user_id', driverUserId)
      .single();

    if (profileError || !driverProfile?.email) {
      console.log(`No email found for driver ${driverUserId}, skipping email notification`);
      return;
    }

    const bookingUrl = `https://parkzy.app/booking/${bookingId}?fromNotification=grace_period`;

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
              <!-- Header -->
              <div style="text-align: center; margin-bottom: 24px;">
                <h1 style="color: #dc2626; margin: 0; font-size: 24px;">🚨 URGENT: Leave Now!</h1>
              </div>
              
              <!-- Content -->
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
                Hi ${driverProfile.first_name || 'there'},
              </p>
              
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
                <strong>Your parking time has expired!</strong> You are now in a 10-minute grace period. Please leave immediately to avoid charges.
              </p>
              
              <!-- Warning Box -->
              <div style="background-color: #fef2f2; border: 2px solid #dc2626; border-radius: 8px; padding: 16px; margin: 20px 0;">
                <p style="margin: 0 0 8px 0; color: #374151;"><strong>Location:</strong> ${spotTitle}</p>
                <p style="margin: 0 0 8px 0; color: #374151;"><strong>Address:</strong> ${spotAddress}</p>
                <p style="margin: 0; color: #dc2626; font-weight: bold; font-size: 18px;">⏰ Grace Period Ends: ${graceEndTime}</p>
              </div>
              
              <!-- Penalty Warning -->
              <div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin: 20px 0;">
                <p style="margin: 0; color: #92400e; font-weight: 600;">
                  ⚠️ If you don't leave or extend your booking:
                </p>
                <ul style="margin: 8px 0 0 0; padding-left: 20px; color: #92400e;">
                  <li>You will be charged <strong>$25/hour</strong> for overtime</li>
                  <li>Your vehicle may be towed at your expense</li>
                </ul>
              </div>
              
              <!-- CTA Buttons -->
              <div style="text-align: center; margin: 28px 0;">
                <a href="${bookingUrl}" style="display: inline-block; background-color: #dc2626; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; margin-bottom: 12px;">
                  Extend Booking Now
                </a>
                <p style="margin: 12px 0 0 0; color: #6b7280; font-size: 14px;">
                  Or confirm your departure in the app
                </p>
              </div>
              
              <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 20px 0 0 0; text-align: center;">
                This is an automated message. Please take action immediately.
              </p>
            </div>
            
            <!-- Footer -->
            <div style="text-align: center; padding: 20px;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                © ${new Date().getFullYear()} Parkzy. All rights reserved.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    const { error: emailError } = await resend.emails.send({
      from: fromEmail,
      to: [driverProfile.email],
      subject: `🚨 URGENT: Your parking has expired - ${spotTitle}`,
      html: emailHtml,
    });

    if (emailError) {
      console.error(`Failed to send grace period email to driver ${driverUserId}:`, emailError);
    } else {
      console.log(`Sent grace period warning email to driver ${driverProfile.email} for booking ${bookingId}`);
    }
  } catch (error) {
    console.error('Error sending driver grace period email:', error);
  }
}

// Helper function to send push notifications with deep-link data
async function sendPushNotification(
  supabaseClient: any,
  userId: string,
  title: string,
  body: string,
  tag: string,
  url: string,
  requireInteraction: boolean = false,
  type?: string,
  bookingId?: string
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
        type,
        bookingId,
      }),
    });

    if (!response.ok) {
      console.error(`Failed to send push notification: ${response.status}`);
    } else {
      console.log(`Push notification sent to user ${userId}: "${title}" (type: ${type})`);
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
    // Validate internal secret - this is a cron job / internal function
    const authHeader = req.headers.get('Authorization');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!authHeader || !authHeader.includes(serviceRoleKey || '')) {
      console.warn('[detect-overstays] Unauthorized access attempt');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const now = new Date();
    const fifteenMinutesFromNow = new Date(now.getTime() + 15 * 60 * 1000);
    const sixteenMinutesFromNow = new Date(now.getTime() + 16 * 60 * 1000);
    
    // Find active bookings ending in ~15 minutes (within the next minute window)
    // to send a 15-minute warning push notification
    const { data: endingSoonBookings, error: endingSoonError } = await supabaseClient
      .from('bookings')
      .select(`
        *,
        spots (
          title,
          address,
          hourly_rate,
          host_id
        )
      `)
      .in('status', ['active', 'paid'])
      .gte('end_at', fifteenMinutesFromNow.toISOString())
      .lt('end_at', sixteenMinutesFromNow.toISOString())
      .is('overstay_detected_at', null);

    if (endingSoonError) {
      console.error('Error fetching ending soon bookings:', endingSoonError);
    } else {
      console.log(`Found ${endingSoonBookings?.length || 0} bookings ending in ~15 minutes`);

      for (const booking of endingSoonBookings || []) {
        // Check if we already sent a 15-minute warning notification for this booking
        const { data: existingNotif } = await supabaseClient
          .from('notifications')
          .select('id')
          .eq('user_id', booking.renter_id)
          .eq('related_id', booking.id)
          .eq('type', 'booking_ending_soon')
          .limit(1)
          .maybeSingle();

        if (!existingNotif) {
          // Send in-app notification
          const notifTitle = '⏰ 15 Minutes Left';
          const notifMessage = `Your parking at ${booking.spots.title} ends in 15 minutes. Tap to extend your booking.`;

          const { error: notifError } = await supabaseClient
            .from('notifications')
            .insert({
              user_id: booking.renter_id,
              type: 'booking_ending_soon',
              title: notifTitle,
              message: notifMessage,
              related_id: booking.id,
            });

          if (notifError) {
            console.error(`Failed to insert 15-min warning notification for booking ${booking.id}:`, notifError);
          } else {
            console.log(`Sent 15-minute warning notification to user ${booking.renter_id} for booking ${booking.id}`);
          }

          // Send push notification with deep-link data
          await sendPushNotification(
            supabaseClient,
            booking.renter_id,
            notifTitle,
            notifMessage,
            `ending-soon-${booking.id}`,
            `/booking/${booking.id}?fromNotification=ending_soon`,
            false,
            'BOOKING_ENDING_SOON',
            booking.id
          );
        }
      }
    }
    
    // Find active bookings that have passed their end time
    // SAFEGUARD: Only check bookings from the last 24 hours to prevent old stuck bookings from triggering
    const twentyFourHoursAgoForOverstay = new Date(now.getTime() - 24 * 60 * 60 * 1000);
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
      .gt('end_at', twentyFourHoursAgoForOverstay.toISOString())
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

      // Send notification to renter (urgent warning)
      const renterTitle = '🚨 Grace Period - Leave Now!';
      const renterMessage = `Your parking at ${booking.spots.title} has expired! You have 10 minutes to leave or you WILL be charged $25/hour and may be towed. Tap to extend or confirm departure.`;
      
      const { error: renterNotifError } = await supabaseClient
        .from('notifications')
        .insert({
          user_id: booking.renter_id,
          type: 'overstay_warning',
          title: renterTitle,
          message: renterMessage,
          related_id: booking.id,
        });

      if (renterNotifError) {
        console.error(`Failed to insert overstay warning notification for booking ${booking.id}:`, renterNotifError);
      } else {
        console.log(`Sent grace period warning notification to renter ${booking.renter_id} for booking ${booking.id}`);
      }

      // Send PUSH notification to renter with deep-link data (works even when app is closed)
      await sendPushNotification(
        supabaseClient,
        booking.renter_id,
        renterTitle,
        renterMessage,
        `grace-period-${booking.id}`,
        `/booking/${booking.id}?fromNotification=grace_period`,
        true, // requireInteraction - critical notification
        'GRACE_PERIOD',
        booking.id
      );

      // Send notification to host
      const hostTitle = 'Guest Overstay Detected';
      const hostMessage = `Guest at ${booking.spots.title} has exceeded their booking time. 10-minute grace period started.`;
      
      const { error: hostNotifError } = await supabaseClient
        .from('notifications')
        .insert({
          user_id: booking.spots.host_id,
          type: 'overstay_detected',
          title: hostTitle,
          message: hostMessage,
          related_id: booking.id,
        });

      if (hostNotifError) {
        console.error(`Failed to insert host overstay notification for booking ${booking.id}:`, hostNotifError);
      } else {
        console.log(`Sent overstay notification to host ${booking.spots.host_id} for booking ${booking.id}`);
      }

      // Send PUSH notification to host with deep-link data
      await sendPushNotification(
        supabaseClient,
        booking.spots.host_id,
        hostTitle,
        hostMessage,
        `overstay-host-${booking.id}`,
        `/booking/${booking.id}?fromNotification=overstay_host`,
        true,
        'OVERSTAY_HOST',
        booking.id
      );

      // Send EMAIL notification to host
      const driverName = booking.profiles 
        ? `${booking.profiles.first_name || ''} ${booking.profiles.last_name || ''}`.trim() || 'Guest'
        : 'Guest';
      const graceEndFormatted = new Date(graceEnd).toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
      
      await sendHostOverstayEmail(
        supabaseClient,
        booking.spots.host_id,
        booking.spots.title,
        booking.spots.address,
        driverName,
        booking.id,
        graceEndFormatted
      );

      // Send EMAIL notification to driver (grace period warning)
      await sendDriverGracePeriodEmail(
        supabaseClient,
        booking.renter_id,
        booking.spots.title,
        booking.spots.address,
        booking.id,
        graceEndFormatted,
        booking.spots.hourly_rate
      );
    }

    // Check for bookings past grace period that need charging or escalation
    // SAFEGUARD: Only check bookings from the last 24 hours to prevent old stuck bookings from triggering
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
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
      .gt('overstay_grace_end', twentyFourHoursAgo.toISOString())
      .is('overstay_action', null);

    if (graceError) throw graceError;

    console.log(`Found ${postGraceBookings?.length || 0} bookings past grace period`);

    for (const booking of postGraceBookings || []) {
      // Mark as pending_action to prevent duplicate notifications on next run
      await supabaseClient
        .from('bookings')
        .update({ overstay_action: 'pending_action' })
        .eq('id', booking.id);

      // Notify host that grace period has ended and they can take action
      const { error: hostActionError } = await supabaseClient
        .from('notifications')
        .insert({
          user_id: booking.spots.host_id,
          type: 'overstay_action_needed',
          title: 'Guest Overstay - Action Needed',
          message: `Grace period ended for ${booking.spots.title}. You can now charge overtime or request towing.`,
          related_id: booking.id,
        });

      if (hostActionError) {
        console.error(`Failed to insert host action notification for booking ${booking.id}:`, hostActionError);
      }

      // Notify guest that grace period has ended
      const { error: guestGraceError } = await supabaseClient
        .from('notifications')
        .insert({
          user_id: booking.renter_id,
          type: 'overstay_grace_ended',
          title: 'Overtime Charges May Apply',
          message: `Your grace period has ended. Please vacate ${booking.spots.title} immediately or you may incur overtime charges.`,
          related_id: booking.id,
        });

      if (guestGraceError) {
        console.error(`Failed to insert guest grace ended notification for booking ${booking.id}:`, guestGraceError);
      }

      console.log(`Marked booking ${booking.id} as pending_action after grace period ended`);
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
          const { error: chargeNotifError } = await supabaseClient
            .from('notifications')
            .insert({
              user_id: booking.renter_id,
              type: 'overstay_charge_update',
              title: 'Overtime Charges Increasing',
              message: `You are still parked at ${booking.spots.title} past your booking time. Current overtime charge: $${overtimeCharge}. Please vacate immediately.`,
              related_id: booking.id,
            });

          if (chargeNotifError) {
            console.error(`Failed to insert charge update notification for booking ${booking.id}:`, chargeNotifError);
          }
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
      const { error: hostCompleteError } = await supabaseClient
        .from('notifications')
        .insert({
          user_id: booking.spots.host_id,
          type: 'booking_completed',
          title: 'Booking Completed',
          message: `Booking at ${booking.spots.title} completed successfully.`,
          related_id: booking.id,
        });

      if (hostCompleteError) {
        console.error(`Failed to insert host booking completed notification for booking ${booking.id}:`, hostCompleteError);
      }

      // Notify renter
      const { error: renterCompleteError } = await supabaseClient
        .from('notifications')
        .insert({
          user_id: booking.renter_id,
          type: 'booking_completed',
          title: 'Booking Completed',
          message: `Your booking at ${booking.spots.title} has been completed.`,
          related_id: booking.id,
        });

      if (renterCompleteError) {
        console.error(`Failed to insert renter booking completed notification for booking ${booking.id}:`, renterCompleteError);
      }
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
        const { error: finalChargeError } = await supabaseClient
          .from('notifications')
          .insert({
            user_id: booking.renter_id,
            type: 'overstay_charge_finalized',
            title: 'Overtime Charge Applied',
            message: `Your booking at ${booking.spots.title} has been completed. You were charged $${finalCharge} for overstaying. Total charge: $${(booking.total_amount + finalCharge).toFixed(2)}.`,
            related_id: booking.id,
          });

        if (finalChargeError) {
          console.error(`Failed to insert final charge notification for booking ${booking.id}:`, finalChargeError);
        }
        
        // Notify host
        const { error: hostOverstayCompleteError } = await supabaseClient
          .from('notifications')
          .insert({
            user_id: booking.spots.host_id,
            type: 'overstay_booking_completed',
            title: 'Overstay Booking Completed',
            message: `Booking at ${booking.spots.title} completed with $${finalCharge} overtime charge applied.`,
            related_id: booking.id,
          });

        if (hostOverstayCompleteError) {
          console.error(`Failed to insert host overstay complete notification for booking ${booking.id}:`, hostOverstayCompleteError);
        }
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
