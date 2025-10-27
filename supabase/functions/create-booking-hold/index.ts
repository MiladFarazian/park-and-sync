import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface HoldRequest {
  spot_id: string;
  start_at: string;
  end_at: string;
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

    const { spot_id, start_at, end_at, idempotency_key }: HoldRequest = await req.json();

    console.log('Creating booking hold:', { spot_id, start_at, end_at, user_id: userData.user.id });

    // Clean up expired holds first
    await supabase.rpc('cleanup_expired_holds');

    // Check if spot is available
    const { data: isAvailable, error: availabilityError } = await supabase
      .rpc('check_spot_availability', {
        p_spot_id: spot_id,
        p_start_at: start_at,
        p_end_at: end_at
      });

    if (availabilityError) throw availabilityError;
    
    if (!isAvailable) {
      return new Response(JSON.stringify({ 
        error: 'Spot is not available for the requested time' 
      }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create a 10-minute hold via security definer function to bypass RLS safely
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { data: hold, error: holdError } = await supabase
      .rpc('create_booking_hold', {
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

    console.log('Booking hold created:', hold.id);

    return new Response(JSON.stringify({
      hold_id: hold.id,
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