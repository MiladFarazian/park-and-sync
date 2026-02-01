import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

// Rate limit configuration (generous for map interactions)
const RATE_LIMIT_PER_MINUTE = 60;
const RATE_LIMIT_PER_HOUR = 500;

// Distance thresholds for demand notification feature
const HALF_MILE_METERS = 804; // 0.5 miles - trigger threshold for zero-spot notifications

// Check rate limit using database
async function checkRateLimit(
  supabase: any,
  clientIp: string
): Promise<{ allowed: boolean; retryAfter: number }> {
  const functionName = 'search-spots-lite';
  const minuteKey = `ip:${clientIp}:${functionName}:min`;
  const hourKey = `ip:${clientIp}:${functionName}:hour`;

  try {
    const { data: minuteOk } = await supabase.rpc('check_rate_limit', {
      p_key: minuteKey,
      p_window_seconds: 60,
      p_max_requests: RATE_LIMIT_PER_MINUTE
    });

    const { data: hourOk } = await supabase.rpc('check_rate_limit', {
      p_key: hourKey,
      p_window_seconds: 3600,
      p_max_requests: RATE_LIMIT_PER_HOUR
    });

    if (!minuteOk) {
      // Rate limit exceeded - don't log in production to avoid noise
      return { allowed: false, retryAfter: 60 };
    }
    
    if (!hourOk) {
      // Rate limit exceeded - don't log in production to avoid noise
      return { allowed: false, retryAfter: 3600 };
    }

    return { allowed: true, retryAfter: 0 };
  } catch (error) {
    // If rate limiting fails, allow the request
    return { allowed: true, retryAfter: 0 };
  }
}

interface SearchRequest {
  latitude: number;
  longitude: number;
  radius?: number;
  limit?: number;
  start_time?: string;
  end_time?: string;
  ev_charger_type?: string; // Filter for specific EV charger type
}

// Helper to convert a UTC date to Pacific timezone and extract date/time components
const toPacificComponents = (utcDate: Date): { dateStr: string; timeStr: string; dayOfWeek: number } => {
  // Use Intl.DateTimeFormat to get Pacific time components
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short'
  });
  
  const parts = formatter.formatToParts(utcDate);
  const get = (type: string) => parts.find(p => p.type === type)?.value || '';
  
  // Build date string as YYYY-MM-DD
  const dateStr = `${get('year')}-${get('month')}-${get('day')}`;
  
  // Build time string as HH:MM:SS
  let hour = get('hour');
  // Handle midnight edge case (some formatters return '24' for midnight)
  if (hour === '24') hour = '00';
  const timeStr = `${hour}:${get('minute')}:${get('second')}`;
  
  // Get day of week (0=Sunday, 1=Monday, etc.)
  const weekdayMap: Record<string, number> = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
  const dayOfWeek = weekdayMap[get('weekday')] ?? new Date(dateStr).getDay();
  
  return { dateStr, timeStr, dayOfWeek };
};

serve(async (req) => {
  // Handle CORS preflight requests
  const preflightResponse = handleCorsPreflight(req);
  if (preflightResponse) return preflightResponse;

  const corsHeaders = getCorsHeaders(req);

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get client IP for rate limiting
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() 
      || req.headers.get('cf-connecting-ip') 
      || req.headers.get('x-real-ip')
      || 'unknown';

    // Check rate limit
    const rateLimit = await checkRateLimit(supabase, clientIp);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ 
        error: 'Too many requests. Please try again later.',
        retry_after: rateLimit.retryAfter
      }), {
        status: 429,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Retry-After': String(rateLimit.retryAfter)
        },
      });
    }

    // Try to get authenticated user (optional for search)
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    let showOwnSpots = false;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const { data: userData } = await supabase.auth.getUser(token);
        userId = userData.user?.id || null;
        
        // Check if user wants to see their own spots
        if (userId) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('show_own_spots_in_search')
            .eq('user_id', userId)
            .single();
          showOwnSpots = profile?.show_own_spots_in_search ?? false;
        }
      } catch {
        // Ignore auth errors for search - it's optional
      }
    }

    const {
      latitude,
      longitude,
      radius = 15000,
      limit = 500,
      start_time,
      end_time,
      ev_charger_type
    }: SearchRequest = await req.json();

    console.log('[search-spots-lite] Request:', { latitude, longitude, radius, limit, start_time, end_time, ev_charger_type, userId });
    const startTime = Date.now();

    // Simple query for active spots only - no availability checks, no pricing rules
    let query = supabase
      .from('spots')
      .select(`
        id,
        host_id,
        title,
        category,
        address,
        latitude,
        longitude,
        hourly_rate,
        quantity,
        has_ev_charging,
        ev_charger_type,
        ev_charging_premium_per_hour,
        is_covered,
        is_secure,
        is_ada_accessible,
        instant_book,
        size_constraints,
        spot_photos (
          url,
          is_primary
        )
      `)
      .eq('status', 'active');

    const { data: spots, error } = await query;

    if (error) throw error;

    // Filter by distance using Haversine formula (fast JS calculation)
    const R = 6371e3; // Earth's radius in meters
    const φ1 = latitude * Math.PI / 180;

    let spotsWithDistance = (spots || [])
      .map(spot => {
        const φ2 = spot.latitude * Math.PI / 180;
        const Δφ = (spot.latitude - latitude) * Math.PI / 180;
        const Δλ = (spot.longitude - longitude) * Math.PI / 180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c;

        return { ...spot, distance };
      })
      .filter(spot => spot.distance <= radius)
      .filter(spot => showOwnSpots || !userId || spot.host_id !== userId) // Exclude host's own spots unless they enabled the setting
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);

    // Track if EV filter was applied and how many matched
    let evFilterApplied = false;
    let evMatchCount = 0;
    
    // If EV charger type filter is specified, filter spots
    if (ev_charger_type) {
      evFilterApplied = true;
      const evSpots = spotsWithDistance.filter(spot => 
        spot.has_ev_charging && spot.ev_charger_type === ev_charger_type
      );
      evMatchCount = evSpots.length;
      
      // If no EV spots found, keep all spots but flag it
      if (evSpots.length > 0) {
        spotsWithDistance = evSpots;
      }
      // If no matches, spotsWithDistance stays as-is (fallback to all spots)
    }

    // Capture count before availability filtering for debugging
    const spotsBeforeAvailabilityFilter = spotsWithDistance.length;
    const spotIdsBeforeFilter = spotsWithDistance.map(s => s.id);

    // If time range is provided, filter out spots with conflicting bookings or unavailable overrides
    if (start_time && end_time) {
      const spotIds = spotsWithDistance.map(s => s.id);

      if (spotIds.length > 0) {
        // Convert search times to Pacific timezone for availability rule comparisons
        // Availability rules are stored in Pacific time (e.g., 00:00:00 to 23:59:00 means midnight to 11:59 PM Pacific)
        const searchStartUtc = new Date(start_time);
        const searchEndUtc = new Date(end_time);
        const startPacific = toPacificComponents(searchStartUtc);
        const endPacific = toPacificComponents(searchEndUtc);
        
        console.log(`[search-spots-lite] Search times - UTC: ${start_time} to ${end_time}`);
        console.log(`[search-spots-lite] Search times - Pacific: ${startPacific.dateStr} ${startPacific.timeStr} to ${endPacific.dateStr} ${endPacific.timeStr}`);

        // Get dates covered by the search range in Pacific timezone
        const searchDates: string[] = [];
        const searchDaysOfWeek = new Set<number>();
        
        // Start from the Pacific date of the start time
        let currentDateStr = startPacific.dateStr;
        const endDateStr = endPacific.dateStr;
        
        while (currentDateStr <= endDateStr) {
          searchDates.push(currentDateStr);
          // Calculate day of week for this date
          const [year, month, day] = currentDateStr.split('-').map(Number);
          const dateForDow = new Date(year, month - 1, day);
          searchDaysOfWeek.add(dateForDow.getDay());
          // Move to next day
          dateForDow.setDate(dateForDow.getDate() + 1);
          currentDateStr = dateForDow.toISOString().split('T')[0];
        }

        // Get calendar overrides for the search dates (both available and unavailable)
        const { data: calendarOverrides } = await supabase
          .from('calendar_overrides')
          .select('spot_id, override_date, start_time, end_time, is_available')
          .in('spot_id', spotIds)
          .in('override_date', searchDates);

        // Get availability rules (recurring weekly schedules) for all spots
        const { data: availabilityRules } = await supabase
          .from('availability_rules')
          .select('spot_id, day_of_week, start_time, end_time, is_available')
          .in('spot_id', spotIds)
          .in('day_of_week', Array.from(searchDaysOfWeek));

        // Build a map of spots with their overrides and rules
        const spotOverrides = new Map<string, any[]>();
        for (const override of calendarOverrides || []) {
          if (!spotOverrides.has(override.spot_id)) {
            spotOverrides.set(override.spot_id, []);
          }
          spotOverrides.get(override.spot_id)!.push(override);
        }

        const spotRules = new Map<string, any[]>();
        for (const rule of availabilityRules || []) {
          if (!spotRules.has(rule.spot_id)) {
            spotRules.set(rule.spot_id, []);
          }
          spotRules.get(rule.spot_id)!.push(rule);
        }

        // Helper to normalize time strings to HH:MM:SS format
        const normalizeTimeStr = (timeStr: string): string => {
          if (!timeStr) return '00:00:00';
          return timeStr.length === 5 ? timeStr + ':00' : timeStr;
        };

        // Determine which spots are unavailable during the search time
        const unavailableSpotIds = new Set<string>();

        for (const spotId of spotIds) {
          const overrides = spotOverrides.get(spotId) || [];
          const rules = spotRules.get(spotId) || [];

          // Check each date in the search range (dates are in Pacific timezone)
          let isAvailableForAllDates = true;

          for (const dateStr of searchDates) {
            // Calculate day of week for this Pacific date
            const [year, month, day] = dateStr.split('-').map(Number);
            const dateForDow = new Date(year, month - 1, day);
            const dayOfWeek = dateForDow.getDay();

            // Determine what portion of the search time falls on this Pacific date
            // If search spans multiple days, we need to check each day's portion
            let searchStartTimeOnDate: string;
            let searchEndTimeOnDate: string;
            
            if (dateStr === startPacific.dateStr && dateStr === endPacific.dateStr) {
              // Search is entirely on this day
              searchStartTimeOnDate = startPacific.timeStr;
              searchEndTimeOnDate = endPacific.timeStr;
            } else if (dateStr === startPacific.dateStr) {
              // First day of multi-day search: from start time to end of day
              searchStartTimeOnDate = startPacific.timeStr;
              searchEndTimeOnDate = '23:59:59';
            } else if (dateStr === endPacific.dateStr) {
              // Last day of multi-day search: from start of day to end time
              searchStartTimeOnDate = '00:00:00';
              searchEndTimeOnDate = endPacific.timeStr;
            } else {
              // Middle day: full day needed
              searchStartTimeOnDate = '00:00:00';
              searchEndTimeOnDate = '23:59:59';
            }

            // Find override for this specific date (takes precedence over rules)
            const dateOverride = overrides.find(o => o.override_date === dateStr);

            if (dateOverride) {
              // Override exists for this date
              if (!dateOverride.is_available) {
                // Date is blocked
                if (!dateOverride.start_time && !dateOverride.end_time) {
                  // Full day block
                  isAvailableForAllDates = false;
                  break;
                }
                // Partial block - check if search time overlaps with blocked time (using string comparison in Pacific)
                const blockStart = normalizeTimeStr(dateOverride.start_time || '00:00:00');
                const blockEnd = normalizeTimeStr(dateOverride.end_time || '23:59:59');
                // Overlap check: searchStart < blockEnd AND searchEnd > blockStart
                if (searchStartTimeOnDate < blockEnd && searchEndTimeOnDate > blockStart) {
                  isAvailableForAllDates = false;
                  break;
                }
              } else {
                // Override marks as available - check if search time is within available hours
                if (dateOverride.start_time && dateOverride.end_time) {
                  const availStart = normalizeTimeStr(dateOverride.start_time);
                  const availEnd = normalizeTimeStr(dateOverride.end_time);
                  // Search must be entirely within available window (Pacific time string comparison)
                  if (searchStartTimeOnDate < availStart || searchEndTimeOnDate > availEnd) {
                    isAvailableForAllDates = false;
                    break;
                  }
                }
                // If no time range specified in override, treat as available all day
              }
            } else {
              // No override - check recurring rules for this day of week
              // IMPORTANT: Spot must have a matching availability rule with is_available=true to be considered available
              const dayRule = rules.find(r => r.day_of_week === dayOfWeek && r.is_available === true);

              if (!dayRule) {
                // No availability rule for this day = spot is unavailable (matches DB check_spot_availability function)
                console.log(`[search-spots-lite] Spot ${spotId} unavailable: no rule for day ${dayOfWeek}`);
                isAvailableForAllDates = false;
                break;
              }

              // Rule exists and is_available=true - check if search time falls within the available window
              if (dayRule.start_time && dayRule.end_time) {
                const ruleStart = normalizeTimeStr(dayRule.start_time);
                // Handle 24:00 as end-of-day (treat as 23:59:59 for comparison since string comparison fails)
                let ruleEnd = normalizeTimeStr(dayRule.end_time);
                if (ruleEnd === '24:00:00') {
                  ruleEnd = '23:59:59';
                }

                // Pacific time string comparison - search time must be within rule window
                console.log(`[search-spots-lite] Spot ${spotId} rule check: search ${searchStartTimeOnDate}-${searchEndTimeOnDate} vs rule ${ruleStart}-${ruleEnd}`);
                if (searchStartTimeOnDate < ruleStart || searchEndTimeOnDate > ruleEnd) {
                  console.log(`[search-spots-lite] Spot ${spotId} unavailable: outside rule window`);
                  isAvailableForAllDates = false;
                  break;
                }
              } else {
                console.log(`[search-spots-lite] Spot ${spotId} has null time range in rule, treating as available all day`);
              }
              // If rule has no time range (null/null), treat as available all day
            }
          }

          if (!isAvailableForAllDates) {
            unavailableSpotIds.add(spotId);
          }
        }

        if (unavailableSpotIds.size > 0) {
          spotsWithDistance = spotsWithDistance.filter(spot => !unavailableSpotIds.has(spot.id));
          console.log(`[search-spots-lite] Filtered out ${unavailableSpotIds.size} unavailable spots (availability rules/overrides)`);
        }

        // For multi-spot listings, we need to check available quantity instead of simple conflict detection
        // Get all bookings and holds that overlap with the requested time range
        const remainingSpotIds = spotsWithDistance.map(s => s.id);
        
        if (remainingSpotIds.length > 0) {
          // Get booking counts per spot for the time range
          const { data: conflictingBookings } = await supabase
            .from('bookings')
            .select('spot_id')
            .in('spot_id', remainingSpotIds)
            .in('status', ['pending', 'held', 'paid', 'active'])
            .lt('start_at', end_time)
            .gt('end_at', start_time);
          
          // Get active holds per spot for the time range
          const { data: activeHolds } = await supabase
            .from('booking_holds')
            .select('spot_id')
            .in('spot_id', remainingSpotIds)
            .gt('expires_at', new Date().toISOString())
            .lt('start_at', end_time)
            .gt('end_at', start_time);
          
          // Count bookings and holds per spot
          const bookingCountBySpot = new Map<string, number>();
          for (const b of conflictingBookings || []) {
            bookingCountBySpot.set(b.spot_id, (bookingCountBySpot.get(b.spot_id) || 0) + 1);
          }
          
          const holdCountBySpot = new Map<string, number>();
          for (const h of activeHolds || []) {
            holdCountBySpot.set(h.spot_id, (holdCountBySpot.get(h.spot_id) || 0) + 1);
          }
          
          // If user is authenticated, get their own bookings (don't count against availability for them)
          let userBookingCountBySpot = new Map<string, number>();
          if (userId) {
            const { data: userBookings } = await supabase
              .from('bookings')
              .select('spot_id')
              .in('spot_id', remainingSpotIds)
              .eq('renter_id', userId)
              .in('status', ['pending', 'held', 'paid', 'active'])
              .lt('start_at', end_time)
              .gt('end_at', start_time);
            
            for (const b of userBookings || []) {
              userBookingCountBySpot.set(b.spot_id, (userBookingCountBySpot.get(b.spot_id) || 0) + 1);
            }
          }
          
          // Filter spots based on available quantity
          const spotsToRemove: string[] = [];
          for (const spot of spotsWithDistance) {
            const spotQuantity = spot.quantity || 1;
            const bookingCount = bookingCountBySpot.get(spot.id) || 0;
            const holdCount = holdCountBySpot.get(spot.id) || 0;
            const userBookingCount = userBookingCountBySpot.get(spot.id) || 0;
            
            // Available = quantity - (bookings not by this user) - holds
            // User's own bookings don't reduce availability from their perspective
            const othersBookingCount = bookingCount - userBookingCount;
            const availableQuantity = spotQuantity - othersBookingCount - holdCount;
            
            // Store available quantity on spot for UI display
            (spot as any).available_quantity = Math.max(availableQuantity, 0);
            
            if (availableQuantity < 1) {
              spotsToRemove.push(spot.id);
            }
          }
          
          if (spotsToRemove.length > 0) {
            spotsWithDistance = spotsWithDistance.filter(spot => !spotsToRemove.includes(spot.id));
            console.log(`[search-spots-lite] Filtered out ${spotsToRemove.length} fully booked spots`);
          }
        }
      }
    }

    // Get all spot IDs for batch review query
    const spotIds = spotsWithDistance.map(s => s.id);

    // Batch fetch reviews for all spots at once (much faster than per-spot queries)
    let reviewStats: Map<string, { avgRating: number; count: number }> = new Map();
    
    if (spotIds.length > 0) {
      const { data: reviews } = await supabase
        .from('reviews')
        .select('rating, reviewer_id, booking:booking_id(spot_id, renter_id)')
        .eq('is_public', true);

      // Group reviews by spot_id - only count driver reviews (where reviewer is the renter)
      const spotReviews = new Map<string, number[]>();
      for (const review of reviews || []) {
        const booking = review.booking as any;
        const spotId = booking?.spot_id;
        // Only include if reviewer is the driver (renter), not the host
        if (spotId && spotIds.includes(spotId) && review.reviewer_id === booking?.renter_id) {
          if (!spotReviews.has(spotId)) {
            spotReviews.set(spotId, []);
          }
          spotReviews.get(spotId)!.push(review.rating);
        }
      }

      // Calculate stats
      for (const [spotId, ratings] of spotReviews) {
        const count = ratings.length;
        const avgRating = count > 0 ? ratings.reduce((a, b) => a + b, 0) / count : 0;
        reviewStats.set(spotId, { avgRating, count });
      }
    }

    // Transform response with minimal data for map pins
    const transformedSpots = spotsWithDistance.map(spot => {
      const stats = reviewStats.get(spot.id) || { avgRating: 0, count: 0 };
      
      // Calculate driver price (base rate + 20% platform fee or $1 min)
      const baseRate = parseFloat(spot.hourly_rate);
      const platformFee = Math.max(baseRate * 0.20, 1.00);
      const driverPrice = Math.round((baseRate + platformFee) * 100) / 100;

      // Get primary photo
      const primaryPhoto = spot.spot_photos?.find((p: any) => p.is_primary)?.url 
        || spot.spot_photos?.[0]?.url 
        || null;

      return {
        id: spot.id,
        title: spot.title,
        category: spot.category,
        address: spot.address,
        latitude: spot.latitude,
        longitude: spot.longitude,
        hourly_rate: driverPrice,
        ev_charging_premium_per_hour: spot.ev_charging_premium_per_hour || 0,
        spot_rating: Number(stats.avgRating.toFixed(2)),
        spot_review_count: stats.count,
        primary_photo_url: primaryPhoto,
        has_ev_charging: spot.has_ev_charging,
        ev_charger_type: spot.ev_charger_type,
        is_covered: spot.is_covered,
        is_secure: spot.is_secure,
        is_ada_accessible: spot.is_ada_accessible,
        instant_book: spot.instant_book,
        distance: spot.distance,
        size_constraints: spot.size_constraints,
        quantity: spot.quantity || 1,
        available_quantity: (spot as any).available_quantity ?? (spot.quantity || 1),
      };
    });

    const duration = Date.now() - startTime;
    console.log(`[search-spots-lite] Found ${transformedSpots.length} spots in ${duration}ms`);

    // Check if we should trigger demand notifications to hosts
    // Conditions: zero spots found within 0.5 miles of search center
    let demandNotificationSent = false;
    let hostsNotifiedCount = 0;
    const spotsWithinHalfMile = transformedSpots.filter(s => s.distance <= HALF_MILE_METERS);
    if (spotsWithinHalfMile.length === 0) {
      console.log(`[search-spots-lite] Zero spots within 0.5mi - checking for eligible hosts to notify`);

      // Wait for the notify-hosts-demand response to determine if there are actually hosts to notify
      // Only show the banner to drivers if hosts were actually notified
      try {
        const response = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/notify-hosts-demand`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              'X-Internal-Secret': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
            },
            body: JSON.stringify({
              latitude,
              longitude,
              start_time,
              end_time,
            }),
          }
        );
        const result = await response.json();
        console.log(`[search-spots-lite] Demand notification result:`, result);

        // Only set demandNotificationSent to true if hosts were actually notified
        hostsNotifiedCount = result.hosts_notified || 0;
        if (hostsNotifiedCount > 0) {
          demandNotificationSent = true;
          console.log(`[search-spots-lite] ${hostsNotifiedCount} hosts notified - showing banner to driver`);
        } else {
          console.log(`[search-spots-lite] No eligible hosts to notify - not showing banner`);
        }
      } catch (err) {
        console.error(`[search-spots-lite] Failed to send demand notifications:`, err);
        // On error, don't show the banner since we don't know if hosts were notified
        demandNotificationSent = false;
      }
    }

    // Debug info for troubleshooting availability filtering
    const debugInfo = {
      search_times: start_time && end_time ? { start: start_time, end: end_time } : null,
      time_filtering_applied: !!(start_time && end_time),
      spots_before_availability_filter: spotsBeforeAvailabilityFilter,
      spot_ids_before_filter: spotIdsBeforeFilter,
      spots_after_all_filters: transformedSpots.length,
      spot_ids_after_filter: transformedSpots.map(s => s.id),
      half_mile_count: transformedSpots.filter(s => s.distance <= 804).length,
    };

    return new Response(JSON.stringify({
      spots: transformedSpots,
      total: transformedSpots.length,
      ev_filter_applied: evFilterApplied,
      ev_match_count: evMatchCount,
      demand_notification_sent: demandNotificationSent,
      notification_timeout_seconds: demandNotificationSent ? 45 : undefined,
      _debug: debugInfo,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[search-spots-lite] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
