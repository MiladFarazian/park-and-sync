import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limit configuration (strict for cancellations)
const RATE_LIMIT_PER_MINUTE = 3;
const RATE_LIMIT_PER_HOUR = 10;

async function checkRateLimit(
  supabase: any,
  clientIp: string
): Promise<{ allowed: boolean; retryAfter: number }> {
  const functionName = 'cancel-guest-booking';
  const minuteKey = `ip:${clientIp}:${functionName}:min`;
  const hourKey = `ip:${clientIp}:${functionName}:hour`;

  try {
    const { data: minuteOk } = await supabase.rpc('check_rate_limit', {
      p_key: minuteKey,
      p_window_seconds: 60,
      p_max_requests: RATE_LIMIT_PER_MINUTE
    });

    const { data: hourOk } = await supabase.rpc('check_rate_limit', {
      p_key: hourKey,
      p_window_seconds: 3600,
      p_max_requests: RATE_LIMIT_PER_HOUR
    });

    if (!minuteOk) {
      console.warn(`[rate-limit] ${functionName} minute limit exceeded for IP: ${clientIp.substring(0, 8)}...`);
      return { allowed: false, retryAfter: 60 };
    }
    
    if (!hourOk) {
      console.warn(`[rate-limit] ${functionName} hour limit exceeded for IP: ${clientIp.substring(0, 8)}...`);
      return { allowed: false, retryAfter: 3600 };
    }

    return { allowed: true, retryAfter: 0 };
  } catch (error) {
    console.error('[rate-limit] Error checking rate limit:', error);
    return { allowed: true, retryAfter: 0 };
  }
}

interface CancelGuestBookingRequest {
  booking_id: string;
  access_token: string;
  cancellation_reason?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get client IP for rate limiting
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() 
      || req.headers.get('cf-connecting-ip') 
      || req.headers.get('x-real-ip')
      || 'unknown';

    // Check rate limit
    const rateLimit = await checkRateLimit(supabaseAdmin, clientIp);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ 
        error: 'Too many requests. Please try again later.',
        retry_after: rateLimit.retryAfter
      }), {
        status: 429,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Retry-After': String(rateLimit.retryAfter)
        },
      });
    }

    const { booking_id, access_token, cancellation_reason }: CancelGuestBookingRequest = await req.json();

    console.log('Cancelling guest booking:', { booking_id });

    if (!booking_id || !access_token) {
      return new Response(JSON.stringify({ error: 'Booking ID and access token are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch booking
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from('bookings')
      .select('*, spots!inner(host_id, title)')
      .eq('id', booking_id)
      .eq('is_guest', true)
      .single();

    if (bookingError || !booking) {
      console.error('Booking not found:', bookingError);
      return new Response(JSON.stringify({ error: 'Booking not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate access token
    if (booking.guest_access_token !== access_token) {
      console.error('Invalid access token for booking:', booking_id);
      return new Response(JSON.stringify({ error: 'Invalid access token' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if booking can be cancelled
    if (!['pending', 'active'].includes(booking.status)) {
      return new Response(JSON.stringify({ 
        error: 'This booking cannot be cancelled' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if booking hasn't started yet for refund eligibility
    const now = new Date();
    const startTime = new Date(booking.start_at);
    const hoursUntilStart = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60);
    const isEligibleForRefund = hoursUntilStart >= 1;

    let refundAmount = 0;

    // Process refund if eligible and payment exists
    if (isEligibleForRefund && booking.stripe_payment_intent_id) {
      const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
        apiVersion: '2025-08-27.basil',
      });

      try {
        const paymentIntent = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id);
        
        if (paymentIntent.status === 'succeeded') {
          const refund = await stripe.refunds.create({
            payment_intent: booking.stripe_payment_intent_id,
          });
          refundAmount = refund.amount / 100;
          console.log('Refund processed:', refund.id);
        }
      } catch (stripeError) {
        console.error('Stripe refund error:', stripeError);
        // Continue with cancellation even if refund fails
      }
    }

    // Update booking status
    const { error: updateError } = await supabaseAdmin
      .from('bookings')
      .update({
        status: 'canceled',
        cancellation_reason: cancellation_reason || 'Cancelled by guest',
        refund_amount: refundAmount,
      })
      .eq('id', booking_id);

    if (updateError) {
      console.error('Failed to update booking:', updateError);
      throw updateError;
    }

    // Notify host
    const spot = booking.spots as any;
    await supabaseAdmin.from('notifications').insert({
      user_id: spot.host_id,
      type: 'booking',
      title: 'Booking Cancelled',
      message: `A guest booking for ${spot.title} has been cancelled`,
      related_id: booking_id,
    });

    console.log('Guest booking cancelled successfully:', booking_id);

    return new Response(JSON.stringify({
      success: true,
      refund_amount: refundAmount,
      message: refundAmount > 0 ? 'Booking cancelled and refund processed' : 'Booking cancelled',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Cancel guest booking error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
