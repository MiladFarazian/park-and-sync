import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2025-08-27.basil',
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

serve(async (req) => {
  const signature = req.headers.get('stripe-signature');
  
  if (!signature) {
    return new Response('No signature', { status: 400 });
  }

  try {
    const body = await req.text();
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    
    if (!webhookSecret) {
      console.error('STRIPE_WEBHOOK_SECRET not set');
      return new Response('Webhook secret not configured', { status: 500 });
    }

    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    console.log(`Webhook received: ${event.type}`);

    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;
        
      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
        break;
        
      case 'checkout.session.completed':
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === 'payment' && session.metadata?.booking_id) {
          await handleCheckoutPaymentCompleted(session);
        } else if (session.metadata?.type === 'extension') {
          await handleCheckoutCompleted(session);
        }
        break;
        
      case 'account.updated':
        await handleAccountUpdated(event.data.object as Stripe.Account);
        break;
        
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Webhook error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(`Webhook error: ${errorMessage}`, {
      status: 400,
    });
  }
});

async function handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  console.log('Payment succeeded:', paymentIntent.id);
  
  // Get the booking details
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('id, host_earnings, renter_id, spot_id, spots!inner(host_id, title, address)')
    .eq('stripe_payment_intent_id', paymentIntent.id)
    .single();

  if (bookingError || !booking) {
    console.error('Failed to fetch booking:', bookingError);
    return;
  }

  // Update booking status to active (paid and ready to use)
  const { error: updateError } = await supabase
    .from('bookings')
    .update({ 
      status: 'active',
      stripe_charge_id: paymentIntent.latest_charge as string
    })
    .eq('stripe_payment_intent_id', paymentIntent.id);

  if (updateError) {
    console.error('Failed to update booking status:', updateError);
    return;
  }

  // Send confirmation notification to renter
  const renterNotification = {
    user_id: booking.renter_id,
    type: 'booking',
    title: 'Payment Successful',
    message: `Your booking at ${(booking.spots as any).address} is now confirmed!`,
    related_id: booking.id,
  };

  await supabase.from('notifications').insert(renterNotification);

  // Credit host's balance
  const hostId = (booking.spots as any).host_id;
  const hostEarnings = booking.host_earnings || 0;

  const { error: balanceError } = await supabase.rpc('increment_balance', {
    user_id: hostId,
    amount: hostEarnings
  });

  if (balanceError) {
    console.error('Failed to update host balance:', balanceError);
    // Try direct update as fallback
    const { error: fallbackError } = await supabase
      .from('profiles')
      .update({ 
        balance: supabase.sql`balance + ${hostEarnings}`
      })
      .eq('user_id', hostId);
    
    if (fallbackError) {
      console.error('Failed to update host balance (fallback):', fallbackError);
    }
  }

  console.log(`Credited ${hostEarnings} to host ${hostId}`);
}

async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
  console.log('Payment failed:', paymentIntent.id);
  
  const { error } = await supabase
    .from('bookings')
    .update({ status: 'canceled' })
    .eq('stripe_payment_intent_id', paymentIntent.id);

  if (error) {
    console.error('Failed to update booking status:', error);
  }
}

async function handleCheckoutPaymentCompleted(session: Stripe.Checkout.Session) {
  console.log('Processing checkout payment completion for session:', session.id);
  
  const bookingId = session.metadata?.booking_id;
  if (!bookingId) {
    console.error('No booking_id in session metadata');
    return;
  }

  try {
    // Update booking status to active
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ 
        status: 'active',
        stripe_charge_id: session.payment_intent as string,
      })
      .eq('id', bookingId);

    if (updateError) throw updateError;

    // Get booking details for notifications
    const { data: booking } = await supabase
      .from('bookings')
      .select('*, spots(host_id, title)')
      .eq('id', bookingId)
      .single();

    if (booking) {
      // Credit host balance
      const hostEarnings = booking.subtotal;
      await supabase.rpc('increment_balance', {
        user_id: (booking.spots as any).host_id,
        amount: hostEarnings,
      });

      // Send notification to renter
      await supabase.from('notifications').insert({
        user_id: booking.renter_id,
        type: 'booking_confirmed',
        title: 'Booking Confirmed',
        message: `Your parking at ${(booking.spots as any).title} has been confirmed.`,
        related_id: bookingId,
      });
    }

    console.log('Successfully processed checkout payment for booking:', bookingId);
  } catch (error) {
    console.error('Error processing checkout payment:', error);
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  console.log('Checkout session completed:', session.id);
  
  // Check if this is an extension payment
  if (session.metadata?.type === 'extension') {
    const bookingId = session.metadata.booking_id;
    const extensionHours = parseInt(session.metadata.extension_hours || '0');
    const newEndTime = session.metadata.new_end_time;
    const hostEarnings = parseFloat(session.metadata.host_earnings || '0');
    const platformFee = parseFloat(session.metadata.platform_fee || '0');
    const hostId = session.metadata.host_id;
    const renterId = session.metadata.renter_id;

    if (!bookingId || !newEndTime) {
      console.error('Missing required metadata for extension');
      return;
    }

    // Get current booking to calculate new totals
    const { data: currentBooking } = await supabase
      .from('bookings')
      .select('total_hours, subtotal, platform_fee, total_amount, host_earnings, spots!inner(title, address)')
      .eq('id', bookingId)
      .single();

    if (!currentBooking) {
      console.error('Booking not found:', bookingId);
      return;
    }

    const extensionCost = hostEarnings + platformFee;

    // Update booking with extended time and costs
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        end_at: newEndTime,
        total_hours: currentBooking.total_hours + extensionHours,
        subtotal: currentBooking.subtotal + extensionCost,
        platform_fee: currentBooking.platform_fee + platformFee,
        total_amount: currentBooking.total_amount + extensionCost,
        host_earnings: (currentBooking.host_earnings || 0) + hostEarnings,
      })
      .eq('id', bookingId);

    if (updateError) {
      console.error('Failed to update booking:', updateError);
      return;
    }

    // Credit host's balance
    const { error: balanceError } = await supabase
      .from('profiles')
      .update({ 
        balance: supabase.sql`balance + ${hostEarnings}`
      })
      .eq('user_id', hostId);

    if (balanceError) {
      console.error('Failed to update host balance:', balanceError);
    }

    // Get profiles for notifications
    const { data: renterProfile } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', renterId)
      .single();

    // Notify host
    const hostNotification = {
      user_id: hostId,
      type: 'booking',
      title: 'Booking Extended',
      message: `${renterProfile?.first_name || 'A driver'} extended their booking at ${(currentBooking.spots as any).title} by ${extensionHours} hour${extensionHours > 1 ? 's' : ''}`,
      related_id: bookingId,
    };

    await supabase.from('notifications').insert(hostNotification);

    // Notify renter
    const renterNotification = {
      user_id: renterId,
      type: 'booking',
      title: 'Extension Confirmed',
      message: `Your parking at ${(currentBooking.spots as any).title} has been extended until ${new Date(newEndTime).toLocaleString()}`,
      related_id: bookingId,
    };

    await supabase.from('notifications').insert(renterNotification);

    console.log(`Booking ${bookingId} extended by ${extensionHours} hours`);
  }
}

async function handleAccountUpdated(account: Stripe.Account) {
  console.log('Account updated:', account.id);
  
  const { error } = await supabase
    .from('profiles')
    .update({ 
      stripe_account_enabled: account.charges_enabled && account.payouts_enabled
    })
    .eq('stripe_account_id', account.id);

  if (error) {
    console.error('Failed to update account status:', error);
  }
}