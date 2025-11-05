import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2025-08-27.basil',
});

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
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { bookingId, extensionHours = 1 } = await req.json();

    if (!bookingId || extensionHours <= 0) {
      throw new Error('Invalid booking ID or extension hours');
    }

    // Get the booking
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        id,
        renter_id,
        end_at,
        spot_id,
        spots!inner(hourly_rate, host_id, title, address)
      `)
      .eq('id', bookingId)
      .eq('renter_id', user.id)
      .eq('status', 'paid')
      .single();

    if (bookingError || !booking) {
      throw new Error('Booking not found or not eligible for extension');
    }

    // Calculate new end time and cost
    const newEndAt = new Date(booking.end_at);
    newEndAt.setHours(newEndAt.getHours() + extensionHours);

    const extensionCost = (booking.spots as any).hourly_rate * extensionHours;
    const platformFee = extensionCost * 0.15;
    const totalAmount = extensionCost + platformFee;

    // Get customer's default payment method
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single();

    if (!profile?.stripe_customer_id) {
      throw new Error('No payment method on file');
    }

    // Create payment intent for extension
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalAmount * 100),
      currency: 'usd',
      customer: profile.stripe_customer_id,
      description: `Booking extension: ${(booking.spots as any).title}`,
      metadata: {
        booking_id: booking.id,
        extension_hours: extensionHours.toString(),
        type: 'extension',
      },
      off_session: true,
      confirm: true,
    });

    if (paymentIntent.status !== 'succeeded') {
      throw new Error('Payment failed');
    }

    // Update booking with new end time
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        end_at: newEndAt.toISOString(),
        total_amount: supabase.sql`total_amount + ${totalAmount}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId);

    if (updateError) {
      console.error('Failed to update booking:', updateError);
      throw new Error('Failed to extend booking');
    }

    // Notify host
    await supabase.from('notifications').insert({
      user_id: (booking.spots as any).host_id,
      type: 'booking',
      title: 'Booking Extended',
      message: `A driver extended their booking at ${(booking.spots as any).address} by ${extensionHours} hour(s)`,
      related_id: booking.id,
    });

    console.log(`Booking ${bookingId} extended by ${extensionHours} hours`);

    return new Response(
      JSON.stringify({ 
        success: true,
        newEndAt: newEndAt.toISOString(),
        extensionCost,
        totalPaid: totalAmount,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error extending booking:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
