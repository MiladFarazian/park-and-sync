import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

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

    const { booking_id } = await req.json();

    if (!booking_id) {
      throw new Error('Missing booking_id');
    }

    console.log('Approving booking:', booking_id);

    // Get booking with spot info and host info
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
      throw new Error('Only the host can approve this booking');
    }

    // Verify booking is in 'held' status (awaiting approval)
    if (booking.status !== 'held') {
      throw new Error(`Booking cannot be approved - current status: ${booking.status}`);
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

    // Capture the held payment
    if (!booking.stripe_payment_intent_id) {
      throw new Error('No payment intent found for this booking');
    }

    console.log('Capturing payment intent:', booking.stripe_payment_intent_id);
    
    const paymentIntent = await stripe.paymentIntents.capture(booking.stripe_payment_intent_id);
    
    console.log('Payment captured successfully:', paymentIntent.id);

    // Update booking to active
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ 
        status: 'active',
        stripe_charge_id: paymentIntent.latest_charge as string
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
        type: 'booking',
        title: 'Booking Approved!',
        message: `Your booking at ${booking.spots.address} has been approved by the host`,
        related_id: booking_id,
      });

    // Send approval email to driver
    const driverEmail = renterUser?.email || booking.profiles?.email || '';
    const driverName = booking.profiles?.first_name || 'Driver';
    const hostName = hostProfile?.first_name || 'Host';
    const spotTitle = booking.spots.category || booking.spots.title || 'Parking Spot';
    const spotAddress = booking.spots.address;
    const startDate = new Date(booking.start_at).toLocaleString();
    const endDate = new Date(booking.end_at).toLocaleString();
    const totalAmount = booking.total_amount;
    const appUrl = Deno.env.get('APP_URL') || 'https://parkzy.lovable.app';
    const bookingUrl = `${appUrl}/booking-confirmation/${booking_id}`;
    const encodedAddress = encodeURIComponent(spotAddress);
    const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`;
    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'Parkzy <onboarding@resend.dev>';

    if (driverEmail && driverEmail.includes('@')) {
      try {
        const emailResponse = await resend.emails.send({
          from: fromEmail,
          to: [driverEmail],
          subject: "✅ Your Booking Has Been Approved!",
          html: `
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Booking Approved</title>
              </head>
              <body style="margin: 0; padding: 0; background-color: #f8f9fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; padding: 40px 20px;">
                  <tr>
                    <td align="center">
                      <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                        <!-- Header -->
                        <tr>
                          <td style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); padding: 40px 30px; text-align: center;">
                            <img src="https://mqbupmusmciijsjmzbcu.supabase.co/storage/v1/object/public/assets/parkzy-logo-white.png" alt="Parkzy" style="height: 40px; width: auto; margin-bottom: 16px;" />
                            <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">✅ Booking Approved!</h1>
                            <p style="margin: 10px 0 0 0; color: rgba(255, 255, 255, 0.9); font-size: 16px;">Your parking is confirmed</p>
                          </td>
                        </tr>
                        
                        <!-- Content -->
                        <tr>
                          <td style="padding: 40px 30px;">
                            <p style="margin: 0 0 24px 0; color: #1f2937; font-size: 16px; line-height: 1.5;">
                              Hi <strong>${driverName}</strong>,
                            </p>
                            <p style="margin: 0 0 24px 0; color: #1f2937; font-size: 16px; line-height: 1.5;">
                              Great news! <strong>${hostName}</strong> has approved your booking request. Your payment has been processed and your parking spot is now confirmed.
                            </p>
                            
                            <!-- Booking Details Card -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0fdf4; border-radius: 12px; padding: 24px; margin: 24px 0; border: 1px solid #bbf7d0;">
                              <tr>
                                <td>
                                  <h2 style="margin: 0 0 16px 0; color: #10B981; font-size: 18px; font-weight: 600;">Your Parking Details</h2>
                                  
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
                                      <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">🏠 Host</td>
                                      <td style="color: #1f2937; font-size: 14px; font-weight: 600; text-align: right; padding: 8px 0;">${hostName}</td>
                                    </tr>
                                    <tr>
                                      <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">🕐 Check-in</td>
                                      <td style="color: #1f2937; font-size: 14px; font-weight: 600; text-align: right; padding: 8px 0;">${startDate}</td>
                                    </tr>
                                    <tr>
                                      <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">🕐 Check-out</td>
                                      <td style="color: #1f2937; font-size: 14px; font-weight: 600; text-align: right; padding: 8px 0;">${endDate}</td>
                                    </tr>
                                    <tr>
                                      <td colspan="2" style="padding: 12px 0 8px 0; border-top: 2px solid #bbf7d0;">
                                        <table width="100%">
                                          <tr>
                                            <td style="color: #1f2937; font-size: 16px; font-weight: 700;">💳 Total Charged</td>
                                            <td style="color: #10B981; font-size: 20px; font-weight: 700; text-align: right;">$${totalAmount.toFixed(2)}</td>
                                          </tr>
                                        </table>
                                      </td>
                                    </tr>
                                  </table>
                                </td>
                              </tr>
                            </table>
                            
                            <!-- CTA Buttons -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="margin: 32px 0 24px 0;">
                              <tr>
                                <td align="center">
                                  <a href="${directionsUrl}" style="display: inline-block; background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 0 8px 8px 8px;">🗺️ Get Directions</a>
                                  <a href="${bookingUrl}" style="display: inline-block; background-color: #f3f4f6; color: #1f2937; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 0 8px 8px 8px;">View Booking</a>
                                </td>
                              </tr>
                            </table>
                            
                            <p style="margin: 24px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                              Make sure to arrive on time and follow any instructions from your host. You can message them through the Parkzy app if needed.
                            </p>
                          </td>
                        </tr>
                        
                        <!-- Footer -->
                        <tr>
                          <td style="background-color: #f8f9fa; padding: 24px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                            <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px;">
                              Best regards,<br><strong style="color: #8B5CF6;">The Parkzy Team</strong>
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
        console.log("Approval email sent to driver:", emailResponse);
      } catch (emailError) {
        console.error('Failed to send approval email:', emailError);
      }
    }

    console.log('Booking approved successfully');

    return new Response(JSON.stringify({
      success: true,
      message: 'Booking approved successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Approve booking error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
