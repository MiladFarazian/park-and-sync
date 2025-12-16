import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SearchRequest {
  latitude: number;
  longitude: number;
  radius?: number;
  start_time: string;
  end_time: string;
  vehicle_size?: string;
  has_ev_charging?: boolean;
  is_covered?: boolean;
  is_secure?: boolean;
  max_price?: number;
  min_price?: number;
}

interface AvailabilityRule {
  day_of_week: number;
  custom_rate: number | null;
}

interface CalendarOverride {
  override_date: string;
  custom_rate: number | null;
}

// Calculate effective hourly rate based on custom pricing rules
function calculateEffectiveRate(
  baseRate: number,
  startTime: string,
  endTime: string,
  availabilityRules: AvailabilityRule[],
  calendarOverrides: CalendarOverride[]
): number {
  const start = new Date(startTime);
  const end = new Date(endTime);
  
  // Build a map of date-specific custom rates (highest priority)
  const dateOverrideMap = new Map<string, number>();
  for (const override of calendarOverrides) {
    if (override.custom_rate !== null) {
      dateOverrideMap.set(override.override_date, override.custom_rate);
    }
  }
  
  // Build a map of day-of-week custom rates
  const dayOfWeekRateMap = new Map<number, number>();
  for (const rule of availabilityRules) {
    if (rule.custom_rate !== null) {
      dayOfWeekRateMap.set(rule.day_of_week, rule.custom_rate);
    }
  }
  
  // Calculate total hours and weighted rate
  let totalHours = 0;
  let weightedRateSum = 0;
  
  const current = new Date(start);
  while (current < end) {
    const dateStr = current.toISOString().split('T')[0];
    const dayOfWeek = current.getDay();
    
    // Determine rate for this hour (date override > day-of-week > base)
    let hourRate = baseRate;
    if (dateOverrideMap.has(dateStr)) {
      hourRate = dateOverrideMap.get(dateStr)!;
    } else if (dayOfWeekRateMap.has(dayOfWeek)) {
      hourRate = dayOfWeekRateMap.get(dayOfWeek)!;
    }
    
    weightedRateSum += hourRate;
    totalHours += 1;
    
    // Move to next hour
    current.setHours(current.getHours() + 1);
  }
  
  // Return weighted average rate (or base rate if no hours)
  if (totalHours === 0) {
    return baseRate;
  }
  
  return weightedRateSum / totalHours;
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

    // Clean up expired holds first
    await supabase.rpc('cleanup_expired_holds');

    // Try to get authenticated user (optional for search)
    const authHeader = req.headers.get('Authorization');
    let userId = null;
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const { data: userData } = await supabase.auth.getUser(token);
        userId = userData.user?.id || null;
      } catch (e) {
        // Ignore auth errors for search - it's optional
      }
    }

    const {
      latitude,
      longitude,
      radius = 5000,
      start_time,
      end_time,
      vehicle_size,
      has_ev_charging,
      is_covered,
      is_secure,
      max_price,
      min_price
    }: SearchRequest = await req.json();

    console.log('Search request:', { latitude, longitude, radius, start_time, end_time, userId });

    // Build the query with geospatial search
    let query = supabase
      .from('spots')
      .select(`
        id,
        host_id,
        title,
        category,
        description,
        address,
        latitude,
        longitude,
        hourly_rate,
        daily_rate,
        has_ev_charging,
        is_covered,
        is_secure,
        size_constraints,
        status,
        profiles!spots_host_id_fkey (
          first_name,
          last_name
        ),
        spot_photos (
          url,
          is_primary
        )
      `)
      .eq('status', 'active');

    // Apply filters
    if (vehicle_size) {
      query = query.contains('size_constraints', [vehicle_size]);
    }
    
    if (has_ev_charging !== undefined) {
      query = query.eq('has_ev_charging', has_ev_charging);
    }
    
    if (is_covered !== undefined) {
      query = query.eq('is_covered', is_covered);
    }
    
    if (is_secure !== undefined) {
      query = query.eq('is_secure', is_secure);
    }
    
    if (min_price !== undefined) {
      query = query.gte('hourly_rate', min_price);
    }
    
    if (max_price !== undefined) {
      query = query.lte('hourly_rate', max_price);
    }

    const { data: spots, error } = await query;

    if (error) throw error;

    // Get date range for calendar overrides query
    const startDate = start_time.split('T')[0];
    const endDate = end_time.split('T')[0];

    // For now, filter by distance manually since PostGIS dwithin might not work as expected
    const availableSpots = [];
    for (const spot of spots || []) {
      // Calculate distance using Haversine formula
      const R = 6371e3; // Earth's radius in meters
      const φ1 = latitude * Math.PI / 180;
      const φ2 = spot.latitude * Math.PI / 180;
      const Δφ = (spot.latitude - latitude) * Math.PI / 180;
      const Δλ = (spot.longitude - longitude) * Math.PI / 180;

      const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

      const distance = R * c; // Distance in meters

      if (distance <= radius) {
        const { data: isAvailable } = await supabase
          .rpc('check_spot_availability', {
            p_spot_id: spot.id,
            p_start_at: start_time,
            p_end_at: end_time,
            p_exclude_user_id: userId
          });

        if (isAvailable) {
          // Fetch custom pricing rules for this spot
          const [availabilityRulesResult, calendarOverridesResult] = await Promise.all([
            supabase
              .from('availability_rules')
              .select('day_of_week, custom_rate')
              .eq('spot_id', spot.id),
            supabase
              .from('calendar_overrides')
              .select('override_date, custom_rate')
              .eq('spot_id', spot.id)
              .gte('override_date', startDate)
              .lte('override_date', endDate)
          ]);

          const availabilityRules: AvailabilityRule[] = availabilityRulesResult.data || [];
          const calendarOverrides: CalendarOverride[] = calendarOverridesResult.data || [];

          // Calculate effective host rate based on custom pricing
          const baseHostRate = parseFloat(spot.hourly_rate);
          const effectiveHostRate = calculateEffectiveRate(
            baseHostRate,
            start_time,
            end_time,
            availabilityRules,
            calendarOverrides
          );

          // Get spot-specific reviews through bookings
          const { data: spotReviews } = await supabase
            .from('reviews')
            .select('rating, booking:booking_id(spot_id)')
            .eq('is_public', true);
          
          const spotSpecificReviews = (spotReviews || []).filter(
            (r: any) => r.booking?.spot_id === spot.id
          );
          
          const reviewCount = spotSpecificReviews.length;
          const avgRating = reviewCount > 0 
            ? spotSpecificReviews.reduce((sum: number, r: any) => sum + r.rating, 0) / reviewCount 
            : 0;

          // Check if user has an active/paid booking for this spot that overlaps with search time
          let userBooking = null;
          if (userId) {
            const { data: existingBooking } = await supabase
              .from('bookings')
              .select('id, start_at, end_at, status')
              .eq('spot_id', spot.id)
              .eq('renter_id', userId)
              .in('status', ['paid', 'active'])
              .gte('end_at', start_time)
              .lte('start_at', end_time)
              .maybeSingle();
            
            if (existingBooking) {
              userBooking = existingBooking;
            }
          }

          // Calculate driver-facing price (effective host rate + 20% or $1 min)
          const platformFee = Math.max(effectiveHostRate * 0.20, 1.00);
          const driverPrice = Math.round((effectiveHostRate + platformFee) * 100) / 100;

          availableSpots.push({ 
            ...spot, 
            distance,
            spot_rating: Number(avgRating.toFixed(2)),
            spot_review_count: reviewCount,
            user_booking: userBooking,
            driver_hourly_rate: driverPrice,
            effective_host_rate: Math.round(effectiveHostRate * 100) / 100
          });
        }
      }
    }

    console.log(`Found ${availableSpots.length} available spots`);

    return new Response(JSON.stringify({
      spots: availableSpots,
      total: availableSpots.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Search error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
  } catch (error) {
    console.error('Search error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});