import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { Resend } from "npm:resend@2.0.0";
import { getCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { logger } from "../_shared/logger.ts";

const log = logger.scope('link-guest-bookings');

interface LinkRequest {
  user_id: string;
  email?: string;
  phone?: string;
  first_name?: string;
}

interface LinkedBooking {
  id: string;
  start_at: string;
  end_at: string;
  total_amount: number;
  status: string;
  spot_title?: string;
  spot_address?: string;
}

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

const sendWelcomeEmail = async (
  email: string, 
  firstName: string, 
  bookings: LinkedBooking[]
): Promise<void> => {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'onboarding@resend.dev';
  
  if (!resendApiKey) {
    log.debug('RESEND_API_KEY not configured, skipping email');
    return;
  }

  const resend = new Resend(resendApiKey);

  const bookingSummaryHtml = bookings.map(booking => `
    <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
      <div style="font-weight: 600; color: #333; margin-bottom: 8px;">
        ${booking.spot_title || 'Parking Spot'}
      </div>
      <div style="font-size: 14px; color: #666; margin-bottom: 4px;">
        📍 ${booking.spot_address || 'Address not available'}
      </div>
      <div style="font-size: 14px; color: #666; margin-bottom: 4px;">
        📅 ${formatDate(booking.start_at)} - ${formatDate(booking.end_at)}
      </div>
      <div style="font-size: 14px; color: #666;">
        💰 $${booking.total_amount.toFixed(2)} • Status: ${booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
      </div>
    </div>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 40px 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <div style="background: linear-gradient(135deg, #6B4EFF 0%, #5B3EEF 100%); padding: 40px 30px; text-align: center;">
          <img src="https://mqbupmusmciijsjmzbcu.supabase.co/storage/v1/object/public/assets/parkzy-logo-white.png" alt="Parkzy" style="height: 40px; width: auto; margin-bottom: 16px;" />
          <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to Parkzy! 🎉</h1>
        </div>
        
        <div style="padding: 30px;">
          <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
            Hi ${firstName || 'there'},
          </p>
          
          <p style="font-size: 16px; color: #555; line-height: 1.6; margin-bottom: 24px;">
            Thanks for creating your Parkzy account! We've automatically linked your previous guest ${bookings.length === 1 ? 'booking' : 'bookings'} to your new account. You can now manage all your bookings in one place.
          </p>
          
          <h2 style="font-size: 18px; color: #333; margin-bottom: 16px;">
            Your Linked Bookings (${bookings.length})
          </h2>
          
          ${bookingSummaryHtml}
          
          <div style="margin-top: 30px; text-align: center;">
            <a href="https://parkzy.lovable.app/activity" style="display: inline-block; background: #6366f1; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
              View All Bookings
            </a>
          </div>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
            <p style="font-size: 14px; color: #888; margin: 0;">
              With your Parkzy account, you can:
            </p>
            <ul style="font-size: 14px; color: #666; line-height: 1.8; margin-top: 12px;">
              <li>Save payment methods for faster checkout</li>
              <li>Track all your bookings in one place</li>
              <li>Get exclusive member discounts</li>
              <li>Become a host and earn money</li>
            </ul>
          </div>
        </div>
        
        <div style="background: #f8f9fa; padding: 20px 30px; text-align: center;">
          <p style="font-size: 12px; color: #888; margin: 0;">
            © 2025 Parkzy. All rights reserved.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const result = await resend.emails.send({
      from: `Parkzy <${fromEmail}>`,
      to: [email],
      subject: `Welcome to Parkzy! ${bookings.length} booking${bookings.length === 1 ? '' : 's'} linked to your account`,
      html,
    });
    console.log('[link-guest-bookings] Welcome email sent:', result);
  } catch (error) {
      log.error('Failed to send welcome email:', error);
  }
};

serve(async (req) => {
  // Handle CORS preflight requests
  const preflightResponse = handleCorsPreflight(req);
  if (preflightResponse) return preflightResponse;

  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify JWT using anon client with getClaims
    const authHeader = req.headers.get('Authorization');
    console.log('[link-guest-bookings] Request received, auth header present:', !!authHeader);

    if (!authHeader?.startsWith('Bearer ')) {
      log.warn('Missing or invalid Authorization header');
      return new Response(
        JSON.stringify({ error: 'Missing session token - user must be signed in to link guest bookings' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '').trim();

    if (!token) {
      console.warn('[link-guest-bookings] Empty bearer token');
      return new Response(
        JSON.stringify({ error: 'Invalid or expired session' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    log.debug('Token present, length:', token.length);

    // Create service-role client for database operations
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Validate JWT using getUser with explicit token - most reliable method
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError) {
      console.warn('[link-guest-bookings] getUser failed:', {
        message: userError.message,
        status: userError.status,
        name: userError.name,
      });
      return new Response(
        JSON.stringify({ error: 'Invalid or expired session' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!userData?.user?.id) {
      log.warn('No user returned from getUser');
      return new Response(
        JSON.stringify({ error: 'Invalid or expired session' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authUserId = userData.user.id;
    console.log('[link-guest-bookings] Authenticated user:', authUserId);

    // Parse request body
    const { user_id, email, phone, first_name }: LinkRequest = await req.json();
    log.debug('Requested user_id:', user_id);

    // CRITICAL: Verify the user_id matches the authenticated user
    if (user_id !== authUserId) {
      log.warn(`User ID mismatch: requested ${user_id}, authenticated ${authUserId}`);
      return new Response(
        JSON.stringify({ error: 'Cannot link bookings for another user' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Reuse the service role client for privileged database operations
    const supabase = supabaseClient;

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
    let bookingsToLink: any[] = [];
    
    if (email) {
      const { data: emailBookings, error: emailError } = await supabase
        .from('bookings')
        .select('id, start_at, end_at, total_amount, status, spot_id')
        .eq('is_guest', true)
        .is('guest_user_id', null)
        .ilike('guest_email', email);
      
      if (emailError) {
        log.error('Error fetching by email:', emailError);
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
          .select('id, start_at, end_at, total_amount, status, spot_id')
          .eq('is_guest', true)
          .is('guest_user_id', null)
          .ilike('guest_phone', `%${phoneEnd}`);
        
        if (phoneError) {
          log.error('Error fetching by phone:', phoneError);
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

    // Fetch spot details for email
    const spotIds = [...new Set(bookingsToLink.map(b => b.spot_id))];
    const { data: spots } = await supabase
      .from('spots')
      .select('id, title, address')
      .in('id', spotIds);
    
    const spotMap = new Map(spots?.map(s => [s.id, s]) || []);

    // Update bookings to link them to the user
    const bookingIds = bookingsToLink.map(b => b.id);
    log.debug(`Linking ${bookingIds.length} bookings:`, bookingIds);

    const { error: updateError } = await supabase
      .from('bookings')
      .update({ 
        guest_user_id: user_id,
        renter_id: user_id 
      })
      .in('id', bookingIds);

    if (updateError) {
      log.error('Error updating bookings:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to link bookings' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[link-guest-bookings] Successfully linked ${bookingIds.length} bookings to user ${user_id}`);

    // Send welcome email with booking summary
    if (email) {
      const linkedBookingsForEmail: LinkedBooking[] = bookingsToLink.map(b => {
        const spot = spotMap.get(b.spot_id);
        return {
          id: b.id,
          start_at: b.start_at,
          end_at: b.end_at,
          total_amount: b.total_amount,
          status: b.status,
          spot_title: spot?.title,
          spot_address: spot?.address,
        };
      });
      
      await sendWelcomeEmail(email, first_name || '', linkedBookingsForEmail);
    }

    return new Response(
      JSON.stringify({ 
        linked_count: bookingIds.length,
        booking_ids: bookingIds 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    log.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
