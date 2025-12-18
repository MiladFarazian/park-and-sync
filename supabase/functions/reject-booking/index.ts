import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: {
            Authorization: req.headers.get('Authorization') || '',
          },
        },
      }
    );

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get authenticated user
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !userData.user) {
      throw new Error('User not authenticated');
    }

    const { booking_id, reason } = await req.json();

    if (!booking_id) {
      throw new Error('Missing booking_id');
    }

    console.log('Rejecting booking:', booking_id);

    // Get booking with spot info
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        *,
        spots (host_id, title, address),
        profiles!bookings_renter_id_fkey (first_name, email, user_id)
      `)
      .eq('id', booking_id)
      .single();

    if (bookingError || !booking) {
      throw new Error('Booking not found');
    }

    // Verify user is the host
    if (booking.spots.host_id !== userData.user.id) {
      throw new Error('Only the host can reject this booking');
    }

    // Verify booking is in 'held' status (awaiting approval)
    if (booking.status !== 'held') {
      throw new Error(`Booking cannot be rejected - current status: ${booking.status}`);
    }

    // Initialize Stripe
    const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecret) {
      throw new Error('Stripe secret key not configured');
    }
    const stripe = new Stripe(stripeSecret, { apiVersion: '2023-10-16' });

    // Cancel the held payment intent
    if (booking.stripe_payment_intent_id) {
      console.log('Canceling payment intent:', booking.stripe_payment_intent_id);
      await stripe.paymentIntents.cancel(booking.stripe_payment_intent_id);
      console.log('Payment intent canceled');
    }

    // Update booking to canceled
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ 
        status: 'canceled',
        cancellation_reason: reason || 'Host declined the booking request'
      })
      .eq('id', booking_id);

    if (updateError) {
      console.error('Failed to update booking status:', updateError);
      throw updateError;
    }

    // Delete the booking hold if it exists
    await supabase
      .from('booking_holds')
      .delete()
      .eq('spot_id', booking.spot_id)
      .eq('user_id', booking.renter_id);

    // Create notification for driver
    await supabaseAdmin
      .from('notifications')
      .insert({
        user_id: booking.renter_id,
        type: 'booking',
        title: 'Booking Request Declined',
        message: `Your booking request at ${booking.spots.address} was declined by the host. Your card was not charged.`,
        related_id: booking_id,
      });

    console.log('Booking rejected successfully');

    return new Response(JSON.stringify({
      success: true,
      message: 'Booking rejected successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Reject booking error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
