import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

/**
 * Internal Edge Function: notify-hosts-demand
 * 
 * Called by search-spots-lite when a driver search returns zero results
 * within 0.5 miles. Sends push notifications to eligible hosts within 0.75 miles.
 * 
 * Eligibility criteria:
 * 1. Has active spot within 0.75 miles (1207 meters)
 * 2. Has NOT explicitly marked spot unavailable for today
 * 3. Has NOT already updated availability for today
 * 4. Has NOT already received this notification today
 */

const HOST_NOTIFICATION_RADIUS_METERS = 1207; // 0.75 miles

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

    // Step 2: Get calendar overrides for today to check who already updated
    const { data: todayOverrides } = await supabase
      .from('calendar_overrides')
      .select('spot_id, is_available')
      .in('spot_id', spotIds)
      .eq('override_date', pacificDate);

    // Build sets for exclusion
    const spotsWithOverrides = new Set((todayOverrides || []).map(o => o.spot_id));
    const spotsMarkedUnavailable = new Set(
      (todayOverrides || [])
        .filter(o => !o.is_available)
        .map(o => o.spot_id)
    );

    console.log(`[notify-hosts-demand] Spots with overrides today: ${spotsWithOverrides.size}`);
    console.log(`[notify-hosts-demand] Spots marked unavailable: ${spotsMarkedUnavailable.size}`);

    // Step 3: Check which hosts already received notification today
    const { data: alreadyNotified } = await supabase
      .from('demand_notifications_sent')
      .select('host_id')
      .in('host_id', hostIds)
      .eq('notification_date', pacificDate);

    const alreadyNotifiedHostIds = new Set((alreadyNotified || []).map(n => n.host_id));
    console.log(`[notify-hosts-demand] Hosts already notified today: ${alreadyNotifiedHostIds.size}`);

    // Step 4: Determine eligible hosts
    // A host is eligible if they have at least one spot that:
    // - Has NOT been marked unavailable for today
    // - Has NOT had any availability update today (no calendar_override exists)
    // AND the host has NOT already received a notification today
    const eligibleHostSpots: { hostId: string; spotId: string; spotTitle: string; spotLat: number; spotLng: number }[] = [];

    for (const spot of spotsWithinRadius) {
      // Skip if host already notified
      if (alreadyNotifiedHostIds.has(spot.host_id)) continue;
      
      // Skip if spot has any override for today (means they already updated)
      if (spotsWithOverrides.has(spot.id)) continue;
      
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
        reason: 'No eligible hosts (all already notified or updated availability)'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 5: Send notifications and record in suppression table
    const notificationPromises: Promise<any>[] = [];
    const hostIdsToRecord: string[] = [];

    for (const [hostId, spotInfo] of eligibleHosts) {
      hostIdsToRecord.push(hostId);

      // Send push notification via send-push-notification edge function
      const notificationPromise = fetch(
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push-notification`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceRoleKey}`,
            'X-Internal-Secret': serviceRoleKey!,
          },
          body: JSON.stringify({
            user_id: hostId,
            title: 'Drivers searching nearby!',
            message: 'Update your availability today to earn. Tap to manage your spot.',
            url: `/manage-availability?date=${pacificDate}`,
            type: 'demand_availability',
          }),
        }
      ).then(res => {
        if (!res.ok) {
          console.error(`[notify-hosts-demand] Failed to send notification to host ${hostId}`);
        }
        return res;
      }).catch(err => {
        console.error(`[notify-hosts-demand] Error sending notification to host ${hostId}:`, err);
      });

      notificationPromises.push(notificationPromise);
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

    console.log(`[notify-hosts-demand] Successfully notified ${eligibleHosts.size} hosts`);

    return new Response(JSON.stringify({ 
      success: true, 
      hosts_notified: eligibleHosts.size,
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
