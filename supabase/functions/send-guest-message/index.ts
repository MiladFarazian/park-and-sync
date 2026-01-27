import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

const RATE_LIMIT_PER_MINUTE = 10;
const RATE_LIMIT_PER_HOUR = 30;

async function checkRateLimit(
  supabase: any,
  clientIp: string
): Promise<{ allowed: boolean; retryAfter: number }> {
  const functionName = 'send-guest-message';
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
      // Rate limit exceeded - don't log in production to avoid noise
      return { allowed: false, retryAfter: 60 };
    }
    
    if (!hourOk) {
      // Rate limit exceeded - don't log in production to avoid noise
      return { allowed: false, retryAfter: 3600 };
    }

    return { allowed: true, retryAfter: 0 };
  } catch (error) {
    // If rate limiting fails, allow the request
    return { allowed: true, retryAfter: 0 };
  }
}

interface SendGuestMessageRequest {
  booking_id: string;
  access_token: string;
  message: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  const preflightResponse = handleCorsPreflight(req);
  if (preflightResponse) return preflightResponse;

  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() 
      || req.headers.get('cf-connecting-ip') 
      || req.headers.get('x-real-ip')
      || 'unknown';

    const rateLimit = await checkRateLimit(supabaseAdmin, clientIp);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ 
        error: 'Too many messages. Please try again later.',
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

    const { booking_id, access_token, message }: SendGuestMessageRequest = await req.json();

    console.log('Guest sending message:', { booking_id, messageLength: message?.length });

    if (!booking_id || !access_token || !message) {
      return new Response(JSON.stringify({ error: 'Booking ID, access token, and message are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (message.length > 2000) {
      return new Response(JSON.stringify({ error: 'Message too long (max 2000 characters)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify booking and token with expiration check
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from('bookings')
      .select(`
        id,
        guest_access_token,
        guest_full_name,
        status,
        end_at,
        spots!inner(host_id, title)
      `)
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

    // Timing-safe token comparison to prevent timing attacks
    const tokenA = new TextEncoder().encode(booking.guest_access_token || '');
    const tokenB = new TextEncoder().encode(access_token || '');
    const timingSafeEqual = (a: Uint8Array, b: Uint8Array): boolean => {
      if (a.length !== b.length) return false;
      let result = 0;
      for (let i = 0; i < a.length; i++) {
        result |= a[i] ^ b[i];
      }
      return result === 0;
    };

    if (!timingSafeEqual(tokenA, tokenB)) {
      console.warn(`[auth] Invalid token attempt for booking: ${booking_id.substring(0, 8)}...`);
      return new Response(JSON.stringify({ error: 'Invalid access token' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check token expiration: valid until 30 days after booking ends
    const bookingEndDate = new Date(booking.end_at);
    const expirationDate = new Date(bookingEndDate.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days after end
    if (new Date() > expirationDate && booking.status !== 'active' && booking.status !== 'paid') {
      console.warn(`[auth] Expired token for booking: ${booking_id.substring(0, 8)}...`);
      return new Response(JSON.stringify({ error: 'Access token has expired' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Insert message
    const { data: newMessage, error: insertError } = await supabaseAdmin
      .from('guest_messages')
      .insert({
        booking_id,
        sender_type: 'guest',
        message: message.trim(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to insert message:', insertError);
      return new Response(JSON.stringify({ error: 'Failed to send message' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Guest message sent:', newMessage.id);

    // Broadcast to channel for real-time updates
    const channel = supabaseAdmin.channel(`guest-messages:${booking_id}`);
    await channel.send({
      type: 'broadcast',
      event: 'new_message',
      payload: newMessage
    });
    await supabaseAdmin.removeChannel(channel);

    // Create notification for host
    const spot = booking.spots as any;
    try {
      await supabaseAdmin
        .from('notifications')
        .insert({
          user_id: spot.host_id,
          type: 'guest_message',
          title: 'New Guest Message',
          message: `${booking.guest_full_name} sent you a message about ${spot.title}`,
          related_id: booking_id,
        });
    } catch (notifError) {
      console.error('Failed to create notification:', notifError);
    }

    return new Response(JSON.stringify({ 
      success: true,
      message: newMessage 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Send guest message error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
