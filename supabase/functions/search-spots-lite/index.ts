import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limit configuration (generous for map interactions)
const RATE_LIMIT_PER_MINUTE = 60;
const RATE_LIMIT_PER_HOUR = 500;

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
      console.warn(`[rate-limit] ${functionName} minute limit exceeded for IP: ${clientIp.substring(0, 8)}...`);
      return { allowed: false, retryAfter: 60 };
    }
    
    if (!hourOk) {
      console.warn(`[rate-limit] ${functionName} hour limit exceeded for IP: ${clientIp.substring(0, 8)}...`);
      return { allowed: false, retryAfter: 3600 };
    }

    return { allowed: true, retryAfter: 0 };
  } catch (error) {
    console.error('[rate-limit] Error checking rate limit:', error);
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
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const { data: userData } = await supabase.auth.getUser(token);
        userId = userData.user?.id || null;
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
      end_time
    }: SearchRequest = await req.json();

    console.log('[search-spots-lite] Request:', { latitude, longitude, radius, limit, start_time, end_time, userId });
    const startTime = Date.now();

    // Simple query for active spots only - no availability checks, no pricing rules
    const { data: spots, error } = await supabase
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
        has_ev_charging,
        is_covered,
        is_secure,
        is_ada_accessible,
        instant_book,
        spot_photos (
          url,
          is_primary
        )
      `)
      .eq('status', 'active');

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
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);

    // If time range is provided, filter out spots with conflicting bookings or unavailable overrides
    if (start_time && end_time) {
      const spotIds = spotsWithDistance.map(s => s.id);
      
      if (spotIds.length > 0) {
        // Get dates covered by the search range for calendar override checks
        const startDate = new Date(start_time);
        const endDate = new Date(end_time);
        const searchDates: string[] = [];
        const currentDate = new Date(startDate);
        currentDate.setHours(0, 0, 0, 0);
        const endDateMidnight = new Date(endDate);
        endDateMidnight.setHours(0, 0, 0, 0);
        
        while (currentDate <= endDateMidnight) {
          searchDates.push(currentDate.toISOString().split('T')[0]);
          currentDate.setDate(currentDate.getDate() + 1);
        }

        // Get calendar overrides that mark spots as unavailable for the search dates
        const { data: unavailableOverrides } = await supabase
          .from('calendar_overrides')
          .select('spot_id, override_date, start_time, end_time, is_available')
          .in('spot_id', spotIds)
          .in('override_date', searchDates)
          .eq('is_available', false);

        // Determine which spots are fully unavailable during the search time
        const unavailableSpotIds = new Set<string>();
        
        for (const override of unavailableOverrides || []) {
          // If override has no time range (full day block), spot is unavailable
          if (!override.start_time && !override.end_time) {
            unavailableSpotIds.add(override.spot_id);
            continue;
          }
          
          // Check if override time range overlaps with search time on that date
          const overrideDate = override.override_date;
          const overrideStart = override.start_time 
            ? new Date(`${overrideDate}T${override.start_time}`) 
            : new Date(`${overrideDate}T00:00:00`);
          const overrideEnd = override.end_time 
            ? new Date(`${overrideDate}T${override.end_time}`) 
            : new Date(`${overrideDate}T23:59:59`);
          
          // Check overlap: override blocks if search range overlaps with blocked range
          if (new Date(start_time) < overrideEnd && new Date(end_time) > overrideStart) {
            unavailableSpotIds.add(override.spot_id);
          }
        }

        if (unavailableSpotIds.size > 0) {
          spotsWithDistance = spotsWithDistance.filter(spot => !unavailableSpotIds.has(spot.id));
          console.log(`[search-spots-lite] Filtered out ${unavailableSpotIds.size} unavailable spots (calendar overrides)`);
        }

        // Get all bookings that overlap with the requested time range
        // A booking overlaps if: booking.start_at < end_time AND booking.end_at > start_time
        const remainingSpotIds = spotsWithDistance.map(s => s.id);
        
        if (remainingSpotIds.length > 0) {
          const { data: conflictingBookings } = await supabase
            .from('bookings')
            .select('spot_id')
            .in('spot_id', remainingSpotIds)
            .in('status', ['pending', 'held', 'paid', 'active'])
            .lt('start_at', end_time)
            .gt('end_at', start_time);
          
          const bookedSpotIds = new Set((conflictingBookings || []).map(b => b.spot_id));
          
          // Filter out spots that have conflicting bookings (unless it's the current user's booking)
          if (bookedSpotIds.size > 0) {
            // If user is authenticated, check if any of the "conflicting" bookings are their own
            let userBookedSpotIds = new Set<string>();
            if (userId) {
              const { data: userBookings } = await supabase
                .from('bookings')
                .select('spot_id')
                .in('spot_id', Array.from(bookedSpotIds))
                .eq('renter_id', userId)
                .in('status', ['pending', 'held', 'paid', 'active'])
                .lt('start_at', end_time)
                .gt('end_at', start_time);
              
              userBookedSpotIds = new Set((userBookings || []).map(b => b.spot_id));
            }
            
            // Remove spots that are booked by someone else
            spotsWithDistance = spotsWithDistance.filter(spot => {
              // If spot has no conflicting booking, keep it
              if (!bookedSpotIds.has(spot.id)) return true;
              // If the booking is the user's own, keep it (they can view their booking)
              if (userBookedSpotIds.has(spot.id)) return true;
              // Otherwise, filter it out
              return false;
            });
            
            console.log(`[search-spots-lite] Filtered out ${bookedSpotIds.size - userBookedSpotIds.size} booked spots`);
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
        spot_rating: Number(stats.avgRating.toFixed(2)),
        spot_review_count: stats.count,
        primary_photo_url: primaryPhoto,
        has_ev_charging: spot.has_ev_charging,
        is_covered: spot.is_covered,
        is_secure: spot.is_secure,
        is_ada_accessible: spot.is_ada_accessible,
        instant_book: spot.instant_book,
        distance: spot.distance
      };
    });

    const duration = Date.now() - startTime;
    console.log(`[search-spots-lite] Found ${transformedSpots.length} spots in ${duration}ms`);

    return new Response(JSON.stringify({
      spots: transformedSpots,
      total: transformedSpots.length
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
