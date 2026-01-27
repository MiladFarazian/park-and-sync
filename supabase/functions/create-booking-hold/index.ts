import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { logger } from "../_shared/logger.ts";

const log = logger.scope('create-booking-hold');

// Rate limit configuration (generous for holds since users browse multiple spots)
const RATE_LIMIT_PER_MINUTE = 10;
const RATE_LIMIT_PER_HOUR = 60;

// Check rate limit using database
async function checkRateLimit(
  supabase: any,
  userId: string
): Promise<{ allowed: boolean; retryAfter: number }> {
  const functionName = 'create-booking-hold';
  const minuteKey = `user:${userId}:${functionName}:min`;
  const hourKey = `user:${userId}:${functionName}:hour`;

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

interface HoldRequest {
  spot_id: string;
  start_at: string;
  end_at: string;
  idempotency_key?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  const preflightResponse = handleCorsPreflight(req);
  if (preflightResponse) return preflightResponse;

  const corsHeaders = getCorsHeaders(req);

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

    // Create admin client for rate limiting (needs service role to access rate_limits table)
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

    // Check rate limit
    const rateLimit = await checkRateLimit(supabaseAdmin, userData.user.id);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({
        error: 'Too many hold requests. Please slow down.',
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

    const { spot_id, start_at, end_at, idempotency_key }: HoldRequest = await req.json();

    console.log('Creating booking hold:', { spot_id, start_at, end_at, user_id: userData.user.id });

    // Create a 10-minute hold atomically (includes availability check with row locking)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    console.log('Creating atomic booking hold with row locking');

    const { data: holdResult, error: holdError } = await supabase
      .rpc('create_booking_hold_atomic', {
        p_spot_id: spot_id,
        p_user_id: userData.user.id,
        p_start_at: start_at,
        p_end_at: end_at,
        p_expires_at: expiresAt,
        p_idempotency_key: idempotency_key || crypto.randomUUID(),
      });

    if (holdError) {
      console.error('Hold creation error:', holdError);
      throw holdError;
    }

    // The atomic function returns an array with one row
    const result = holdResult?.[0] || holdResult;

    if (!result?.success) {
      const errorMessage = result?.error_message || 'Spot is not available for the requested time';
      console.log('Hold creation failed:', errorMessage);
      return new Response(JSON.stringify({
        error: errorMessage
      }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Booking hold created:', result.hold_id);

    return new Response(JSON.stringify({
      hold_id: result.hold_id,
      expires_at: expiresAt,
      message: 'Booking hold created for 10 minutes'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Booking hold error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});