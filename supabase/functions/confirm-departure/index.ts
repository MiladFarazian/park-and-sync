import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { logger } from "../_shared/logger.ts";

const log = logger.scope('confirm-departure');

serve(async (req) => {
  // Handle CORS preflight requests
  const preflightResponse = handleCorsPreflight(req);
  if (preflightResponse) return preflightResponse;

  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { bookingId } = await req.json();

    if (!bookingId) {
      throw new Error('Booking ID is required');
    }

    console.log(`Processing departure confirmation for booking ${bookingId} by user ${user.id}`);

    // Fetch booking details
    const { data: booking, error: fetchError } = await supabaseClient
      .from('bookings')
      .select(`
        *,
        spots (
          title,
          host_id,
          address
        )
      `)
      .eq('id', bookingId)
      .eq('renter_id', user.id)
      .single();

    if (fetchError || !booking) {
      log.error('Booking fetch error:', fetchError);
      throw new Error('Booking not found or access denied');
    }

    // Validate booking state
    if (!['active', 'paid'].includes(booking.status)) {
      throw new Error('Booking is not in a valid state for departure confirmation');
    }

    // Check if booking has ended or is within 15 minutes of ending
    const now = new Date();
    const endTime = new Date(booking.end_at);
    const fifteenMinBeforeEnd = new Date(endTime.getTime() - 15 * 60 * 1000);

    if (now < fifteenMinBeforeEnd) {
      throw new Error('Cannot confirm departure more than 15 minutes before booking ends');
    }

    // Update booking to completed with departure timestamp
    const { error: updateError } = await supabaseClient
      .from('bookings')
      .update({
        status: 'completed',
        departed_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', bookingId);

    if (updateError) {
      console.error('Error updating booking:', updateError);
      throw new Error('Failed to confirm departure');
    }

    // Check if there were overstay charges
    const hasOverstayCharges = booking.overstay_charge_amount && booking.overstay_charge_amount > 0;

    if (hasOverstayCharges) {
      // Send notification to renter about the charge
      await supabaseClient
        .from('notifications')
        .insert({
          user_id: booking.renter_id,
          type: 'overstay_charge_applied',
          title: 'Overtime Charge Applied',
          message: `You were charged $${booking.overstay_charge_amount} for overstaying at ${booking.spots.title}. This charge has been added to your total.`,
          related_id: booking.id,
        });
      
      // Notify host with charge details
      await supabaseClient
        .from('notifications')
        .insert({
          user_id: booking.spots.host_id,
          type: 'departure_confirmed',
          title: 'Driver Departed - Overtime Charged',
          message: `Driver confirmed departure from ${booking.spots.title}. Overtime charge of $${booking.overstay_charge_amount} was applied.`,
          related_id: booking.id,
        });
    } else {
      // Existing notification for clean departures (no overstay)
      await supabaseClient
        .from('notifications')
        .insert({
          user_id: booking.spots.host_id,
          type: 'departure_confirmed',
          title: 'Driver Departed',
          message: `Driver has confirmed departure from ${booking.spots.title}. Booking completed successfully.`,
          related_id: booking.id,
        });
    }

    console.log(`Departure confirmed successfully for booking ${bookingId}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Departure confirmed successfully',
        booking: {
          id: booking.id,
          status: 'completed',
          departed_at: now.toISOString(),
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Error confirming departure:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
