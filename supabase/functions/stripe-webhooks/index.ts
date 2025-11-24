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

  // Prefer explicit booking_id from metadata when available
  const metadata = (paymentIntent.metadata || {}) as Record<string, string>;
  const bookingIdFromMetadata = metadata.booking_id;

  let booking: any = null;
  let bookingError: any = null;

  try {
    if (bookingIdFromMetadata) {
      const { data, error } = await supabase
        .from('bookings')
        .select('id, status, host_earnings, renter_id, spot_id, spots!inner(host_id, title, address)')
        .eq('id', bookingIdFromMetadata)
        .single();

      booking = data;
      bookingError = error;
    } else {
      const { data, error } = await supabase
        .from('bookings')
        .select('id, status, host_earnings, renter_id, spot_id, spots!inner(host_id, title, address)')
        .eq('stripe_payment_intent_id', paymentIntent.id)
        .single();

      booking = data;
      bookingError = error;
    }
  } catch (err) {
    console.error('Unexpected error fetching booking for payment_intent.succeeded:', err);
    return;
  }

  if (bookingError || !booking) {
    console.error('Failed to fetch booking for payment_intent.succeeded:', bookingError, {
      payment_intent_id: paymentIntent.id,
      booking_id_metadata: bookingIdFromMetadata,
    });
    return;
  }

  if (booking.status === 'active' || booking.status === 'completed') {
    console.log('Booking already active/completed, skipping update for PaymentIntent:', paymentIntent.id);
    return;
  }

  // Update booking status to active and store PaymentIntent + charge IDs
  const { error: updateError } = await supabase
    .from('bookings')
    .update({
      status: 'active',
      stripe_payment_intent_id: paymentIntent.id,
      stripe_charge_id: paymentIntent.latest_charge as string,
    })
    .eq('id', booking.id);

  if (updateError) {
    console.error('Failed to update booking status on payment_intent.succeeded:', updateError, {
      booking_id: booking.id,
    });
    return;
  }

  console.log('Booking activated from payment_intent.succeeded:', booking.id);

  // Send confirmation notification to renter
  const renterNotification = {
    user_id: booking.renter_id,
    type: 'booking',
    title: 'Payment Successful',
    message: `Your booking at ${(booking.spots as any).address} is now confirmed!`,
    related_id: booking.id,
  };

  await supabase.from('notifications').insert(renterNotification);

  // Credit host's balance (idempotent because we only do this when booking was not active)
  const hostId = (booking.spots as any).host_id;
  const hostEarnings = booking.host_earnings || 0;

  if (hostEarnings > 0) {
    const { error: balanceError } = await supabase.rpc('increment_balance', {
      user_id: hostId,
      amount: hostEarnings,
    });

    if (balanceError) {
      console.error('Failed to update host balance on payment_intent.succeeded:', balanceError, {
        host_id: hostId,
      });
    } else {
      console.log(`Credited ${hostEarnings} to host ${hostId} from payment_intent.succeeded`);
    }
  }
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
    console.error('No booking_id in checkout.session.completed metadata');
    return;
  }

  try {
    // Fetch booking first so we can enforce idempotency and compute earnings
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, status, subtotal, host_earnings, renter_id, spots!inner(host_id, title)')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      console.error('Failed to fetch booking for checkout.session.completed:', bookingError, {
        booking_id: bookingId,
      });
      return;
    }

    if (booking.status === 'active' || booking.status === 'completed') {
      console.log('Booking already active/completed, skipping checkout.session.completed handling for:', bookingId);
      return;
    }

    // Ensure host_earnings is populated (fallback to subtotal if needed)
    const hostEarnings = (booking.host_earnings ?? booking.subtotal) || 0;

    // Update booking status and Stripe references
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        status: 'active',
        stripe_payment_intent_id: session.payment_intent as string,
        stripe_charge_id: session.payment_intent as string,
        host_earnings: hostEarnings,
      })
      .eq('id', bookingId);

    if (updateError) {
      console.error('Failed to update booking on checkout.session.completed:', updateError, {
        booking_id: bookingId,
      });
      return;
    }

    // Credit host balance once
    if (hostEarnings > 0) {
      const hostId = (booking.spots as any).host_id;
      const { error: balanceError } = await supabase.rpc('increment_balance', {
        user_id: hostId,
        amount: hostEarnings,
      });

      if (balanceError) {
        console.error('Failed to update host balance on checkout.session.completed:', balanceError, {
          host_id: hostId,
        });
      }
    }

    // Send notification to renter
    await supabase.from('notifications').insert({
      user_id: booking.renter_id,
      type: 'booking_confirmed',
      title: 'Booking Confirmed',
      message: `Your parking at ${(booking.spots as any).title} has been confirmed.`,
      related_id: bookingId,
    });

    console.log('Successfully processed checkout payment for booking:', bookingId);
  } catch (error) {
    console.error('Error processing checkout payment:', error, {
      booking_id: session.metadata?.booking_id,
      session_id: session.id,
    });
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