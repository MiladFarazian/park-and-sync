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