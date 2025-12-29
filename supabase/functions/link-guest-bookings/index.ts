import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LinkRequest {
  user_id: string;
  email?: string;
  phone?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { user_id, email, phone }: LinkRequest = await req.json();

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: 'user_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!email && !phone) {
      return new Response(
        JSON.stringify({ linked_count: 0, message: 'No email or phone provided' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[link-guest-bookings] Linking bookings for user ${user_id}, email: ${email}, phone: ${phone}`);

    // Find guest bookings matching email or phone
    let query = supabase
      .from('bookings')
      .select('id, guest_email, guest_phone, status')
      .eq('is_guest', true)
      .is('guest_user_id', null); // Only link bookings not already linked

    // Build OR condition for email and phone
    const conditions: string[] = [];
    if (email) {
      conditions.push(`guest_email.ilike.${email}`);
    }
    if (phone) {
      // Normalize phone for matching (remove non-digits)
      const normalizedPhone = phone.replace(/\D/g, '');
      if (normalizedPhone.length >= 10) {
        // Match last 10 digits to handle different country code formats
        const phoneEnd = normalizedPhone.slice(-10);
        conditions.push(`guest_phone.ilike.%${phoneEnd}`);
      }
    }

    if (conditions.length === 0) {
      return new Response(
        JSON.stringify({ linked_count: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch bookings matching email
    let bookingsToLink: any[] = [];
    
    if (email) {
      const { data: emailBookings, error: emailError } = await supabase
        .from('bookings')
        .select('id')
        .eq('is_guest', true)
        .is('guest_user_id', null)
        .ilike('guest_email', email);
      
      if (emailError) {
        console.error('[link-guest-bookings] Error fetching by email:', emailError);
      } else if (emailBookings) {
        bookingsToLink.push(...emailBookings);
      }
    }

    if (phone) {
      const normalizedPhone = phone.replace(/\D/g, '');
      if (normalizedPhone.length >= 10) {
        const phoneEnd = normalizedPhone.slice(-10);
        const { data: phoneBookings, error: phoneError } = await supabase
          .from('bookings')
          .select('id')
          .eq('is_guest', true)
          .is('guest_user_id', null)
          .ilike('guest_phone', `%${phoneEnd}`);
        
        if (phoneError) {
          console.error('[link-guest-bookings] Error fetching by phone:', phoneError);
        } else if (phoneBookings) {
          // Add only unique bookings
          const existingIds = new Set(bookingsToLink.map(b => b.id));
          phoneBookings.forEach(b => {
            if (!existingIds.has(b.id)) {
              bookingsToLink.push(b);
            }
          });
        }
      }
    }

    if (bookingsToLink.length === 0) {
      console.log('[link-guest-bookings] No matching guest bookings found');
      return new Response(
        JSON.stringify({ linked_count: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update bookings to link them to the user
    const bookingIds = bookingsToLink.map(b => b.id);
    console.log(`[link-guest-bookings] Linking ${bookingIds.length} bookings:`, bookingIds);

    const { error: updateError } = await supabase
      .from('bookings')
      .update({ 
        guest_user_id: user_id,
        renter_id: user_id 
      })
      .in('id', bookingIds);

    if (updateError) {
      console.error('[link-guest-bookings] Error updating bookings:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to link bookings' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[link-guest-bookings] Successfully linked ${bookingIds.length} bookings to user ${user_id}`);

    return new Response(
      JSON.stringify({ 
        linked_count: bookingIds.length,
        booking_ids: bookingIds 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[link-guest-bookings] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
