import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bookingId } = await req.json();

    if (!bookingId) {
      throw new Error('Booking ID is required');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Authenticate user
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      throw new Error('User not authenticated');
    }

    // Get booking details with spot info
    const { data: booking, error: bookingError } = await supabaseClient
      .from('bookings')
      .select('*, spots(host_id, title)')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      throw new Error('Booking not found');
    }

    // Check if user is the host
    if (booking.spots.host_id !== user.id) {
      throw new Error('Unauthorized: Only the host can cancel tow requests');
    }

    // Check if there's an active tow request
    if (booking.overstay_action !== 'towing') {
      throw new Error('No active tow request for this booking');
    }

    // Cancel the tow request
    const { error: updateError } = await supabaseClient
      .from('bookings')
      .update({
        overstay_action: null,
      })
      .eq('id', bookingId);

    if (updateError) {
      throw new Error(`Failed to cancel tow request: ${updateError.message}`);
    }

    // Send notification to renter
    await supabaseClient
      .from('notifications')
      .insert({
        user_id: booking.renter_id,
        type: 'tow_request_cancelled',
        title: 'Tow Request Cancelled',
        message: `The host has cancelled the tow request for ${booking.spots.title}. However, overstay charges may still apply.`,
        related_id: bookingId,
      });

    // Send notification to host confirming cancellation
    await supabaseClient
      .from('notifications')
      .insert({
        user_id: user.id,
        type: 'tow_request_cancelled',
        title: 'Tow Request Cancelled',
        message: `You have successfully cancelled the tow request for ${booking.spots.title}.`,
        related_id: bookingId,
      });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Tow request cancelled successfully',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Cancel tow request error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
