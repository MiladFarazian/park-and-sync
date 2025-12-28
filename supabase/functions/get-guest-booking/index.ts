import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GetGuestBookingRequest {
  booking_id: string;
  access_token: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { booking_id, access_token }: GetGuestBookingRequest = await req.json();

    console.log('Fetching guest booking:', { booking_id });

    if (!booking_id || !access_token) {
      return new Response(JSON.stringify({ error: 'Booking ID and access token are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch booking with spot and host details
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from('bookings')
      .select(`
        id,
        spot_id,
        start_at,
        end_at,
        status,
        hourly_rate,
        total_hours,
        subtotal,
        platform_fee,
        total_amount,
        ev_charging_fee,
        is_guest,
        guest_full_name,
        guest_email,
        guest_phone,
        guest_car_model,
        guest_license_plate,
        guest_access_token,
        created_at,
        spots!inner(
          id,
          title,
          address,
          latitude,
          longitude,
          access_notes,
          host_rules,
          host_id,
          has_ev_charging,
          is_covered,
          is_secure
        )
      `)
      .eq('id', booking_id)
      .eq('is_guest', true)
      .single();

    if (bookingError || !booking) {
      console.error('Booking not found:', bookingError);
      return new Response(JSON.stringify({ error: 'Booking not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate access token
    if (booking.guest_access_token !== access_token) {
      console.error('Invalid access token for booking:', booking_id);
      return new Response(JSON.stringify({ error: 'Invalid access token' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get host profile
    const spot = booking.spots as any;
    const { data: hostProfile } = await supabaseAdmin
      .from('profiles')
      .select('first_name, avatar_url, rating, review_count')
      .eq('user_id', spot.host_id)
      .single();

    // Get spot photos
    const { data: spotPhotos } = await supabaseAdmin
      .from('spot_photos')
      .select('url, is_primary, sort_order')
      .eq('spot_id', spot.id)
      .order('sort_order', { ascending: true });

    // Remove sensitive token from response
    const { guest_access_token: _, ...safeBooking } = booking;

    return new Response(JSON.stringify({
      booking: safeBooking,
      spot: {
        ...spot,
        photos: spotPhotos || [],
      },
      host: hostProfile || { first_name: 'Host' },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Get guest booking error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
