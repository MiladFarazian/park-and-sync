import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { getCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { logger } from "../_shared/logger.ts";

const log = logger.scope('reject-booking');

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

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

    const { booking_id, reason } = await req.json();

    if (!booking_id) {
      throw new Error('Missing booking_id');
    }

    log.debug('Rejecting booking:', booking_id);

    // Get booking with spot info
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        *,
        spots (host_id, title, address, category),
        profiles!bookings_renter_id_fkey (first_name, email, user_id)
      `)
      .eq('id', booking_id)
      .single();

    if (bookingError || !booking) {
      throw new Error('Booking not found');
    }

    // Verify user is the host
    if (booking.spots.host_id !== userData.user.id) {
      throw new Error('Only the host can reject this booking');
    }

    // Verify booking is in 'held' status (awaiting approval)
    if (booking.status !== 'held') {
      throw new Error(`Booking cannot be rejected - current status: ${booking.status}`);
    }

    // Get host profile
    const { data: hostProfile } = await supabase
      .from('profiles')
      .select('first_name, email')
      .eq('user_id', userData.user.id)
      .single();

    // Initialize Stripe
    const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecret) {
      throw new Error('Stripe secret key not configured');
    }
    const stripe = new Stripe(stripeSecret, { apiVersion: '2023-10-16' });

    // Cancel the held payment intent
    if (booking.stripe_payment_intent_id) {
      console.log('Canceling payment intent:', booking.stripe_payment_intent_id);
      await stripe.paymentIntents.cancel(booking.stripe_payment_intent_id);
      console.log('Payment intent canceled');
    }

    const cancellationReason = reason || 'Host declined the booking request';

    // Update booking to canceled
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ 
        status: 'canceled',
        cancellation_reason: cancellationReason
      })
      .eq('id', booking_id);

    if (updateError) {
      console.error('Failed to update booking status:', updateError);
      throw updateError;
    }

    // Delete the booking hold if it exists
    await supabase
      .from('booking_holds')
      .delete()
      .eq('spot_id', booking.spot_id)
      .eq('user_id', booking.renter_id);

    // Get renter's auth email
    const { data: { user: renterUser } } = await supabaseAdmin.auth.admin.getUserById(booking.renter_id);

    // Create notification for driver
    await supabaseAdmin
      .from('notifications')
      .insert({
        user_id: booking.renter_id,
        type: 'booking_declined',
        title: 'Booking Request Declined',
        message: `Your booking request at ${booking.spots.address} was declined by the host. Your card was not charged.`,
        related_id: booking_id,
      });

    // Send push notification to driver (high-urgency alert)
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
      
      const pushResponse = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          userId: booking.renter_id,
          title: '❌ Booking Declined',
          body: `Your booking request at ${booking.spots.address} was declined. Your card was not charged.`,
          url: `/booking-declined/${booking_id}`,
          type: 'booking_declined',
          bookingId: booking_id,
          requireInteraction: true,
        }),
      });
      
      if (pushResponse.ok) {
        const pushResult = await pushResponse.json();
        console.log('Push notification sent to driver', { sent: pushResult.sent });
      } else {
        const errorText = await pushResponse.text();
        console.warn('Push notification failed', { status: pushResponse.status, error: errorText });
      }
    } catch (pushError) {
      console.error('Failed to send push notification to driver', { error: pushError instanceof Error ? pushError.message : pushError });
    }

    // Send rejection email to driver
    const driverEmail = renterUser?.email || booking.profiles?.email || '';
    const driverName = booking.profiles?.first_name || 'Driver';
    const hostName = hostProfile?.first_name || 'Host';
    const spotTitle = booking.spots.category || booking.spots.title || 'Parking Spot';
    const spotAddress = booking.spots.address;
    const startDate = new Date(booking.start_at).toLocaleString();
    const endDate = new Date(booking.end_at).toLocaleString();
    const appUrl = Deno.env.get('APP_URL') || 'https://parkzy.lovable.app';
    const searchUrl = `${appUrl}/explore`;
    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'Parkzy <onboarding@resend.dev>';

    if (driverEmail && driverEmail.includes('@')) {
      try {
        const emailResponse = await resend.emails.send({
          from: fromEmail,
          to: [driverEmail],
          subject: "❌ Booking Request Declined",
          html: `
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Booking Declined</title>
              </head>
              <body style="margin: 0; padding: 0; background-color: #f8f9fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; padding: 40px 20px;">
                  <tr>
                    <td align="center">
                      <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                        <!-- Header -->
                        <tr>
                          <td style="background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%); padding: 40px 30px; text-align: center;">
                            <img src="https://mqbupmusmciijsjmzbcu.supabase.co/storage/v1/object/public/assets/parkzy-logo-white.png" alt="Parkzy" style="height: 40px; width: auto; margin-bottom: 16px;" />
                            <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">❌ Booking Declined</h1>
                            <p style="margin: 10px 0 0 0; color: rgba(255, 255, 255, 0.9); font-size: 16px;">Your card was not charged</p>
                          </td>
                        </tr>
                        
                        <!-- Content -->
                        <tr>
                          <td style="padding: 40px 30px;">
                            <p style="margin: 0 0 24px 0; color: #1f2937; font-size: 16px; line-height: 1.5;">
                              Hi <strong>${driverName}</strong>,
                            </p>
                            <p style="margin: 0 0 24px 0; color: #1f2937; font-size: 16px; line-height: 1.5;">
                              Unfortunately, <strong>${hostName}</strong> was unable to accommodate your booking request. Don't worry – your card was not charged and you can search for other available parking spots nearby.
                            </p>
                            
                            <!-- Booking Details Card -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fef2f2; border-radius: 12px; padding: 24px; margin: 24px 0; border: 1px solid #fecaca;">
                              <tr>
                                <td>
                                  <h2 style="margin: 0 0 16px 0; color: #EF4444; font-size: 18px; font-weight: 600;">Declined Booking Details</h2>
                                  
                                  <table width="100%" cellpadding="8" cellspacing="0">
                                    <tr>
                                      <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">📍 Spot</td>
                                      <td style="color: #1f2937; font-size: 14px; font-weight: 600; text-align: right; padding: 8px 0;">${spotTitle}</td>
                                    </tr>
                                    <tr>
                                      <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">📍 Address</td>
                                      <td style="color: #1f2937; font-size: 14px; font-weight: 600; text-align: right; padding: 8px 0;">${spotAddress}</td>
                                    </tr>
                                    <tr>
                                      <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">🕐 Requested Times</td>
                                      <td style="color: #1f2937; font-size: 14px; font-weight: 600; text-align: right; padding: 8px 0;">${startDate} - ${endDate}</td>
                                    </tr>
                                    ${reason ? `
                                    <tr>
                                      <td colspan="2" style="padding: 12px 0 8px 0; border-top: 1px solid #fecaca;">
                                        <p style="margin: 0; color: #6b7280; font-size: 14px;"><strong>Reason:</strong> ${reason}</p>
                                      </td>
                                    </tr>
                                    ` : ''}
                                  </table>
                                </td>
                              </tr>
                            </table>
                            
                            <!-- Reassurance Box -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0fdf4; border-left: 4px solid #10B981; border-radius: 8px; padding: 16px; margin: 24px 0;">
                              <tr>
                                <td>
                                  <p style="margin: 0; color: #065f46; font-size: 14px; font-weight: 600;">💳 No Charge</p>
                                  <p style="margin: 8px 0 0 0; color: #047857; font-size: 13px; line-height: 1.5;">
                                    Your payment method was not charged. The authorization hold on your card will be released automatically within a few business days.
                                  </p>
                                </td>
                              </tr>
                            </table>
                            
                            <!-- CTA Button -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="margin: 32px 0 24px 0;">
                              <tr>
                                <td align="center">
                                  <a href="${searchUrl}" style="display: inline-block; background: linear-gradient(135deg, #6B4EFF 0%, #5B3EEF 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">🔍 Find Other Parking</a>
                                </td>
                              </tr>
                            </table>
                            
                            <p style="margin: 24px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                              There are plenty of other parking spots available in your area. Try searching again to find the perfect spot for your needs.
                            </p>
                          </td>
                        </tr>
                        
                        <!-- Footer -->
                        <tr>
                          <td style="background-color: #f8f9fa; padding: 24px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                            <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px;">
                              Best regards,<br><strong style="color: #6B4EFF;">The Parkzy Team</strong>
                            </p>
                            <p style="margin: 8px 0 0 0; color: #9ca3af; font-size: 12px;">
                              © 2025 Parkzy. All rights reserved.
                            </p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </body>
            </html>
          `,
        });
        console.log("Rejection email sent to driver:", emailResponse);
      } catch (emailError) {
        console.error('Failed to send rejection email:', emailError);
      }
    }

    console.log('Booking rejected successfully');

    return new Response(JSON.stringify({
      success: true,
      message: 'Booking rejected successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Reject booking error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
