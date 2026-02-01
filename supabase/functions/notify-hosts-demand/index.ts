import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

/**
 * Internal Edge Function: notify-hosts-demand
 *
 * Called by search-spots-lite when a driver search returns zero results
 * within 0.5 miles. Sends push notifications AND SMS to eligible hosts within 0.75 miles.
 *
 * Eligibility criteria:
 * 1. Has active spot within 0.75 miles (1207 meters)
 * 2. Has NOT explicitly marked spot UNAVAILABLE for today (calendar_override with is_available=false)
 *
 * Note: Hosts CAN receive multiple notifications throughout the day from different driver searches.
 * Notifications are only suppressed if the host explicitly marks their spot as unavailable.
 */

const HOST_NOTIFICATION_RADIUS_METERS = 1207; // 0.75 miles

// SMS notification via Twilio
async function sendSmsNotification(
  toPhoneNumber: string,
  message: string
): Promise<boolean> {
  const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

  if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
    console.log('[notify-hosts-demand] Twilio credentials not configured, skipping SMS');
    return false;
  }

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: toPhoneNumber,
          From: twilioPhoneNumber,
          Body: message,
        }),
      }
    );

    if (response.ok) {
      const result = await response.json();
      console.log(`[notify-hosts-demand] SMS sent successfully to ${toPhoneNumber}, SID: ${result.sid}`);
      return true;
    } else {
      const error = await response.text();
      console.error(`[notify-hosts-demand] SMS failed to ${toPhoneNumber}: ${response.status}`, error);
      return false;
    }
  } catch (err) {
    console.error(`[notify-hosts-demand] SMS error to ${toPhoneNumber}:`, err);
    return false;
  }
}

interface NotifyRequest {
  latitude: number;
  longitude: number;
  start_time?: string;
  end_time?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflight(req);
  if (preflightResponse) return preflightResponse;
  
  const corsHeaders = getCorsHeaders(req);

  try {
    // Validate internal call (only called from search-spots-lite)
    const internalSecret = req.headers.get('X-Internal-Secret');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (internalSecret !== serviceRoleKey) {
      console.log('[notify-hosts-demand] Unauthorized request - missing or invalid internal secret');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      serviceRoleKey ?? ''
    );

    const { latitude, longitude, start_time, end_time }: NotifyRequest = await req.json();
    
    if (!latitude || !longitude) {
      return new Response(JSON.stringify({ error: 'Missing latitude or longitude' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[notify-hosts-demand] Processing request for location: ${latitude}, ${longitude}`);

    // Get today's date in Pacific timezone
    const now = new Date();
    const pacificDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(now);

    console.log(`[notify-hosts-demand] Today's date (Pacific): ${pacificDate}`);

    // Step 1: Find active spots within 0.75 miles
    // Use PostGIS ST_DWithin for efficient geo-query
    const { data: nearbySpots, error: spotsError } = await supabase
      .from('spots')
      .select('id, host_id, title, latitude, longitude')
      .eq('status', 'active');

    if (spotsError) {
      console.error('[notify-hosts-demand] Error fetching spots:', spotsError);
      throw spotsError;
    }

    // Filter by distance using Haversine formula
    const R = 6371e3; // Earth's radius in meters
    const φ1 = latitude * Math.PI / 180;

    const spotsWithinRadius = (nearbySpots || []).filter(spot => {
      const φ2 = spot.latitude * Math.PI / 180;
      const Δφ = (spot.latitude - latitude) * Math.PI / 180;
      const Δλ = (spot.longitude - longitude) * Math.PI / 180;

      const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distance = R * c;

      return distance <= HOST_NOTIFICATION_RADIUS_METERS;
    });

    console.log(`[notify-hosts-demand] Found ${spotsWithinRadius.length} active spots within 0.75 miles`);
    console.log(`[notify-hosts-demand] Spots within radius:`, spotsWithinRadius.map(s => ({ id: s.id, title: s.title, host_id: s.host_id })));

    if (spotsWithinRadius.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        hosts_notified: 0,
        reason: 'No active spots within radius'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const spotIds = spotsWithinRadius.map(s => s.id);
    const hostIds = [...new Set(spotsWithinRadius.map(s => s.host_id))];
    console.log(`[notify-hosts-demand] Unique host IDs:`, hostIds);

    // Step 2: Get calendar overrides for today - ONLY check for spots explicitly marked UNAVAILABLE
    // Hosts can receive multiple notifications unless they explicitly mark their spot as unavailable
    const { data: todayOverrides } = await supabase
      .from('calendar_overrides')
      .select('spot_id, is_available')
      .in('spot_id', spotIds)
      .eq('override_date', pacificDate)
      .eq('is_available', false); // Only get unavailable overrides

    // Build set of spots that are explicitly marked unavailable
    const spotsMarkedUnavailable = new Set((todayOverrides || []).map(o => o.spot_id));

    console.log(`[notify-hosts-demand] Spots explicitly marked unavailable today: ${spotsMarkedUnavailable.size}`);

    // Step 3: Determine eligible hosts
    // A host is eligible if they have at least one spot that has NOT been explicitly marked unavailable for today
    // Hosts CAN receive multiple notifications - no suppression based on previous notifications
    const eligibleHostSpots: { hostId: string; spotId: string; spotTitle: string; spotLat: number; spotLng: number }[] = [];

    for (const spot of spotsWithinRadius) {
      // Only skip if spot is explicitly marked unavailable
      if (spotsMarkedUnavailable.has(spot.id)) {
        console.log(`[notify-hosts-demand] Skipping spot ${spot.id} (${spot.title}): explicitly marked unavailable for today`);
        continue;
      }

      console.log(`[notify-hosts-demand] Spot ${spot.id} (${spot.title}) is eligible for notification`);
      eligibleHostSpots.push({
        hostId: spot.host_id,
        spotId: spot.id,
        spotTitle: spot.title,
        spotLat: spot.latitude,
        spotLng: spot.longitude
      });
    }

    // Dedupe by host (one notification per host)
    const eligibleHosts = new Map<string, { spotId: string; spotTitle: string; spotLat: number; spotLng: number }>();
    for (const item of eligibleHostSpots) {
      if (!eligibleHosts.has(item.hostId)) {
        eligibleHosts.set(item.hostId, {
          spotId: item.spotId,
          spotTitle: item.spotTitle,
          spotLat: item.spotLat,
          spotLng: item.spotLng
        });
      }
    }

    console.log(`[notify-hosts-demand] Eligible hosts to notify: ${eligibleHosts.size}`);

    if (eligibleHosts.size === 0) {
      return new Response(JSON.stringify({
        success: true,
        hosts_notified: 0,
        reason: 'No eligible hosts (all spots marked unavailable for today)'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 5: Collect all eligible spots per host for the deep-link
    const hostSpotIds = new Map<string, string[]>();
    for (const item of eligibleHostSpots) {
      if (!hostSpotIds.has(item.hostId)) {
        hostSpotIds.set(item.hostId, []);
      }
      hostSpotIds.get(item.hostId)!.push(item.spotId);
    }

    // Step 5.5: Fetch host profiles to get phone numbers for SMS
    const eligibleHostIds = Array.from(eligibleHosts.keys());
    const { data: hostProfiles } = await supabase
      .from('profiles')
      .select('user_id, phone, phone_verified, first_name')
      .in('user_id', eligibleHostIds);

    const hostProfileMap = new Map<string, { phone: string | null; phone_verified: boolean; first_name: string | null }>();
    for (const profile of hostProfiles || []) {
      hostProfileMap.set(profile.user_id, {
        phone: profile.phone,
        phone_verified: profile.phone_verified || false,
        first_name: profile.first_name,
      });
    }

    console.log(`[notify-hosts-demand] Fetched ${hostProfileMap.size} host profiles`);

    // Step 6: Send notifications (push + SMS) and record in suppression table
    const notificationPromises: Promise<any>[] = [];
    const hostIdsToRecord: string[] = [];
    let smsSentCount = 0;
    let pushSentCount = 0;

    for (const [hostId, spotInfo] of eligibleHosts) {
      hostIdsToRecord.push(hostId);

      // Build deep-link URL with spot IDs for direct navigation
      const spotIdsForHost = hostSpotIds.get(hostId) || [spotInfo.spotId];
      const deepLinkUrl = `/manage-availability?date=${pacificDate}&spots=${spotIdsForHost.join(',')}`;
      const fullDeepLinkUrl = `https://useparkzy.com${deepLinkUrl}`;

      // Get host profile for SMS
      const hostProfile = hostProfileMap.get(hostId);

      // Send push notification via send-push-notification edge function
      const pushPromise = fetch(
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push-notification`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceRoleKey}`,
            'X-Internal-Secret': serviceRoleKey!,
          },
          body: JSON.stringify({
            userId: hostId,
            title: 'Drivers searching nearby!',
            body: 'Update your availability today to earn. Tap to manage your spot.',
            url: deepLinkUrl,
            type: 'demand_availability',
          }),
        }
      ).then(async res => {
        const responseBody = await res.json().catch(() => ({}));
        if (!res.ok) {
          console.error(`[notify-hosts-demand] Failed to send push to host ${hostId}: ${res.status}`, responseBody);
        } else {
          console.log(`[notify-hosts-demand] Push sent to host ${hostId}:`, responseBody);
          pushSentCount++;
        }
        return res;
      }).catch(err => {
        console.error(`[notify-hosts-demand] Error sending push to host ${hostId}:`, err);
      });

      notificationPromises.push(pushPromise);

      // Send SMS if host has a verified phone number
      if (hostProfile?.phone && hostProfile.phone_verified) {
        const firstName = hostProfile.first_name || 'Host';
        const smsMessage = `Hi ${firstName}! Drivers are searching for parking near your spot on Parkzy. Update your availability to earn today: ${fullDeepLinkUrl}`;

        const smsPromise = sendSmsNotification(hostProfile.phone, smsMessage)
          .then(success => {
            if (success) {
              smsSentCount++;
              console.log(`[notify-hosts-demand] SMS sent to host ${hostId}`);
            }
          });

        notificationPromises.push(smsPromise);
      } else {
        console.log(`[notify-hosts-demand] Skipping SMS for host ${hostId}: no verified phone (phone=${hostProfile?.phone}, verified=${hostProfile?.phone_verified})`);
      }
    }

    // Record in suppression table (batch insert)
    const suppressionRecords = hostIdsToRecord.map(hostId => ({
      host_id: hostId,
      notification_date: pacificDate,
      search_location: `SRID=4326;POINT(${longitude} ${latitude})`,
    }));

    // Use upsert with on_conflict to handle race conditions
    const { error: insertError } = await supabase
      .from('demand_notifications_sent')
      .upsert(suppressionRecords, {
        onConflict: 'host_id,notification_date',
        ignoreDuplicates: true,
      });

    if (insertError) {
      console.error('[notify-hosts-demand] Error recording notifications:', insertError);
      // Continue anyway - notifications were sent
    }

    // Wait for all notifications to complete
    await Promise.allSettled(notificationPromises);

    console.log(`[notify-hosts-demand] Successfully notified ${eligibleHosts.size} hosts (${pushSentCount} push, ${smsSentCount} SMS)`);

    return new Response(JSON.stringify({
      success: true,
      hosts_notified: eligibleHosts.size,
      push_sent: pushSentCount,
      sms_sent: smsSentCount,
      _debug: {
        search_location: { latitude, longitude },
        pacific_date: pacificDate,
        spots_within_radius: spotsWithinRadius.length,
        spots_marked_unavailable_today: spotsMarkedUnavailable.size,
        eligible_host_spots: eligibleHostSpots.map(s => ({ spotId: s.spotId, hostId: s.hostId, title: s.spotTitle })),
        host_ids_notified: hostIdsToRecord,
        hosts_with_verified_phone: Array.from(hostProfileMap.entries())
          .filter(([_, p]) => p.phone && p.phone_verified)
          .map(([id]) => id),
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[notify-hosts-demand] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
