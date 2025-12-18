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

    const { booking_id } = await req.json();

    if (!booking_id) {
      throw new Error('Missing booking_id');
    }

    console.log('Approving booking:', booking_id);

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
      throw new Error('Only the host can approve this booking');
    }

    // Verify booking is in 'held' status (awaiting approval)
    if (booking.status !== 'held') {
      throw new Error(`Booking cannot be approved - current status: ${booking.status}`);
    }

    // Initialize Stripe
    const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecret) {
      throw new Error('Stripe secret key not configured');
    }
    const stripe = new Stripe(stripeSecret, { apiVersion: '2023-10-16' });

    // Capture the held payment
    if (!booking.stripe_payment_intent_id) {
      throw new Error('No payment intent found for this booking');
    }

    console.log('Capturing payment intent:', booking.stripe_payment_intent_id);
    
    const paymentIntent = await stripe.paymentIntents.capture(booking.stripe_payment_intent_id);
    
    console.log('Payment captured successfully:', paymentIntent.id);

    // Update booking to active
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ 
        status: 'active',
        stripe_charge_id: paymentIntent.latest_charge as string
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

    // Get renter's auth email
    const { data: { user: renterUser } } = await supabaseAdmin.auth.admin.getUserById(booking.renter_id);

    // Create notification for driver
    await supabaseAdmin
      .from('notifications')
      .insert({
        user_id: booking.renter_id,
        type: 'booking',
        title: 'Booking Approved!',
        message: `Your booking at ${booking.spots.address} has been approved by the host`,
        related_id: booking_id,
      });

    // Send confirmation email to driver
    try {
      const driverEmail = renterUser?.email || booking.profiles?.email || '';
      const driverName = booking.profiles?.first_name || 'Driver';
      
      if (driverEmail) {
        await supabase.functions.invoke('send-booking-confirmation', {
          body: {
            driverEmail,
            driverName,
            hostEmail: '', // Don't send another email to host
            hostName: '',
            spotTitle: booking.spots.title,
            spotAddress: booking.spots.address,
            startAt: booking.start_at,
            endAt: booking.end_at,
            totalAmount: booking.total_amount,
            bookingId: booking_id,
          },
        });
      }
    } catch (emailError) {
      console.error('Failed to send confirmation email:', emailError);
    }

    console.log('Booking approved successfully');

    return new Response(JSON.stringify({
      success: true,
      message: 'Booking approved successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Approve booking error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
