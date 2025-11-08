import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BookingRequest {
  spot_id: string;
  start_at: string;
  end_at: string;
  vehicle_id?: string;
  hold_id?: string;
  idempotency_key?: string;
}

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

    // Get authenticated user
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !userData.user) {
      throw new Error('User not authenticated');
    }

    const { 
      spot_id, 
      start_at, 
      end_at, 
      vehicle_id, 
      hold_id,
      idempotency_key 
    }: BookingRequest = await req.json();

    console.log('Creating booking:', { spot_id, start_at, end_at, user_id: userData.user.id });

    // Get spot details for pricing
    const { data: spot, error: spotError } = await supabase
      .from('spots')
      .select('*, host_id')
      .eq('id', spot_id)
      .single();

    if (spotError || !spot) {
      throw new Error('Spot not found');
    }

    // Check if user is trying to book their own spot
    if (userData.user.id === spot.host_id) {
      console.error('Self-booking attempt:', { user_id: userData.user.id, host_id: spot.host_id });
      throw new Error('You cannot book your own parking spot');
    }

    // Calculate pricing
    const startDate = new Date(start_at);
    const endDate = new Date(end_at);
    const totalHours = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60));
    const subtotal = totalHours * parseFloat(spot.hourly_rate);
    const platformFee = Math.round(subtotal * 0.15 * 100) / 100; // 15% platform fee
    const hostEarnings = subtotal - platformFee; // Host gets subtotal minus platform fee
    const totalAmount = subtotal;

    // Initialize Stripe
    const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecret) {
      throw new Error('Stripe secret key not configured');
    }
    const stripe = new Stripe(stripeSecret, {});

    // Get or create Stripe customer
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('user_id', userData.user.id)
      .single();

    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userData.user.email!,
        metadata: {
          supabase_user_id: userData.user.id
        }
      });
      customerId = customer.id;

      // Update profile with customer ID
      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('user_id', userData.user.id);
    }

    // Create payment intent (charge to platform account, track host balance)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalAmount * 100), // Convert to cents
      currency: 'usd',
      customer: customerId,
      metadata: {
        spot_id,
        host_id: spot.host_id,
        renter_id: userData.user.id,
        start_at,
        end_at,
        host_earnings: hostEarnings.toString()
      }
    });

    // Create booking record
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        spot_id,
        renter_id: userData.user.id,
        vehicle_id,
        start_at,
        end_at,
        status: 'pending',
        hourly_rate: spot.hourly_rate,
        total_hours: totalHours,
        subtotal,
        platform_fee: platformFee,
        total_amount: totalAmount,
        host_earnings: hostEarnings,
        stripe_payment_intent_id: paymentIntent.id,
        idempotency_key: idempotency_key || crypto.randomUUID()
      })
      .select()
      .single();

    if (bookingError) {
      console.error('Booking creation error:', bookingError);
      // Cancel the payment intent if booking creation failed
      await stripe.paymentIntents.cancel(paymentIntent.id);
      throw bookingError;
    }

    // Release the hold if provided
    if (hold_id) {
      await supabase
        .from('booking_holds')
        .delete()
        .eq('id', hold_id);
    }

    // Get host and renter profiles for notifications and emails
    const { data: hostProfile } = await supabase
      .from('profiles')
      .select('first_name, email')
      .eq('user_id', spot.host_id)
      .single();

    // Get host's auth email using service role client
    const { data: { user: hostUser } } = await supabaseAdmin.auth.admin.getUserById(spot.host_id);

    const { data: renterProfile } = await supabase
      .from('profiles')
      .select('first_name, email')
      .eq('user_id', userData.user.id)
      .single();

    // Create notifications for host and renter
    if (hostProfile && renterProfile) {
      const hostNotification = {
        user_id: spot.host_id,
        type: 'booking',
        title: 'New Booking Confirmed',
        message: `${renterProfile.first_name || 'A driver'} has booked your spot at ${spot.address}`,
        related_id: booking.id,
      };

      const renterNotification = {
        user_id: userData.user.id,
        type: 'booking',
        title: 'Booking Created',
        message: `Your booking at ${spot.address} will be confirmed once payment is complete`,
        related_id: booking.id,
      };

      await supabase.from('notifications').insert([hostNotification, renterNotification]);

      // Send confirmation emails
      try {
        const hostEmail = hostUser?.email || hostProfile?.email || '';
        const driverEmail = userData.user.email || renterProfile?.email || '';
        
        console.log('Sending confirmation emails to:', { hostEmail, driverEmail });
        
        await supabase.functions.invoke('send-booking-confirmation', {
          body: {
            hostEmail,
            hostName: hostProfile?.first_name || 'Host',
            driverEmail,
            driverName: renterProfile?.first_name || 'Driver',
            spotTitle: spot.title,
            spotAddress: spot.address,
            startAt: start_at,
            endAt: end_at,
            totalAmount: totalAmount,
            bookingId: booking.id,
          },
        });
      } catch (emailError) {
        console.error('Failed to send confirmation emails:', emailError);
        // Don't fail the booking if email fails
      }
    }

    console.log('Booking created:', booking.id);

    return new Response(JSON.stringify({
      booking_id: booking.id,
      client_secret: paymentIntent.client_secret,
      total_amount: totalAmount,
      platform_fee: platformFee
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Booking creation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});