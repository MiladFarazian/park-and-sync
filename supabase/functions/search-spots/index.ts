import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SearchRequest {
  latitude: number;
  longitude: number;
  radius?: number; // in meters, default 5000m
  start_time: string; // ISO string
  end_time: string; // ISO string
  vehicle_size?: string;
  has_ev_charging?: boolean;
  is_covered?: boolean;
  is_secure?: boolean;
  max_price?: number;
  min_price?: number;
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
          last_name,
          rating,
          review_count
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
          availableSpots.push({ ...spot, distance });
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