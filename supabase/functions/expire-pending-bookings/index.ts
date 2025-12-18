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
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Checking for expired pending bookings...');

    // Find bookings in 'held' status that are older than 1 hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    const { data: expiredBookings, error: fetchError } = await supabaseAdmin
      .from('bookings')
      .select(`
        id,
        stripe_payment_intent_id,
        renter_id,
        spot_id,
        spots (address)
      `)
      .eq('status', 'held')
      .lt('created_at', oneHourAgo);

    if (fetchError) {
      console.error('Error fetching expired bookings:', fetchError);
      throw fetchError;
    }

    if (!expiredBookings || expiredBookings.length === 0) {
      console.log('No expired bookings found');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No expired bookings found',
        expired_count: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Found ${expiredBookings.length} expired bookings`);

    // Initialize Stripe
    const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecret) {
      throw new Error('Stripe secret key not configured');
    }
    const stripe = new Stripe(stripeSecret, { apiVersion: '2023-10-16' });

    let expiredCount = 0;

    for (const booking of expiredBookings) {
      try {
        // Cancel the held payment intent
        if (booking.stripe_payment_intent_id) {
          console.log('Canceling payment intent:', booking.stripe_payment_intent_id);
          await stripe.paymentIntents.cancel(booking.stripe_payment_intent_id);
        }

        // Update booking to canceled
        await supabaseAdmin
          .from('bookings')
          .update({ 
            status: 'canceled',
            cancellation_reason: 'Booking request expired - host did not respond within 1 hour'
          })
          .eq('id', booking.id);

        // Delete the booking hold if it exists
        await supabaseAdmin
          .from('booking_holds')
          .delete()
          .eq('spot_id', booking.spot_id)
          .eq('user_id', booking.renter_id);

        // Notify driver
        await supabaseAdmin
          .from('notifications')
          .insert({
            user_id: booking.renter_id,
            type: 'booking',
            title: 'Booking Request Expired',
            message: `Your booking request at ${booking.spots?.address || 'the parking spot'} expired because the host didn't respond in time. Your card was not charged.`,
            related_id: booking.id,
          });

        expiredCount++;
        console.log(`Expired booking ${booking.id}`);
      } catch (bookingError) {
        console.error(`Failed to expire booking ${booking.id}:`, bookingError);
      }
    }

    console.log(`Successfully expired ${expiredCount} bookings`);

    return new Response(JSON.stringify({
      success: true,
      message: `Expired ${expiredCount} bookings`,
      expired_count: expiredCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Expire pending bookings error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
