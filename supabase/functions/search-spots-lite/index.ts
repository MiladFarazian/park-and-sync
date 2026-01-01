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
  limit?: number;
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

    const {
      latitude,
      longitude,
      radius = 15000,
      limit = 500
    }: SearchRequest = await req.json();

    console.log('[search-spots-lite] Request:', { latitude, longitude, radius, limit });
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

    const spotsWithDistance = (spots || [])
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
