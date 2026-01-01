import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GuestBookingConfirmationRequest {
  guestEmail: string;
  guestPhone: string;
  guestName: string;
  hostName: string;
  hostEmail?: string;
  spotTitle: string;
  spotAddress: string;
  startAt: string;
  endAt: string;
  totalAmount: number;
  bookingId: string;
  guestAccessToken: string;
}

// Helper function to send SMS via Twilio
async function sendTwilioSMS(to: string, body: string): Promise<{ success: boolean; error?: string }> {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const fromNumber = Deno.env.get("TWILIO_PHONE_NUMBER");

  if (!accountSid || !authToken || !fromNumber) {
    console.error("Twilio credentials not configured");
    return { success: false, error: "Twilio not configured" };
  }

  // Format phone number - ensure it has country code
  let formattedPhone = to.replace(/\D/g, ''); // Remove non-digits
  if (formattedPhone.length === 10) {
    formattedPhone = `+1${formattedPhone}`; // Assume US if 10 digits
  } else if (!formattedPhone.startsWith('+')) {
    formattedPhone = `+${formattedPhone}`;
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const credentials = btoa(`${accountSid}:${authToken}`);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: formattedPhone,
        From: fromNumber,
        Body: body,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("Twilio SMS error:", result);
      return { success: false, error: result.message || "Failed to send SMS" };
    }

    console.log("Twilio SMS sent successfully:", result.sid);
    return { success: true };
  } catch (error) {
    console.error("Twilio SMS exception:", error);
    return { success: false, error: error.message };
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate internal secret - this is called internally after payment
    const authHeader = req.headers.get('Authorization');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!authHeader || !authHeader.includes(serviceRoleKey || '')) {
      console.warn('[send-guest-booking-confirmation] Unauthorized access attempt');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const {
      guestEmail,
      guestPhone,
      guestName,
      hostName,
      hostEmail,
      spotTitle,
      spotAddress,
      startAt,
      endAt,
      totalAmount,
      bookingId,
      guestAccessToken,
    }: GuestBookingConfirmationRequest = await req.json();

    const startDate = new Date(startAt).toLocaleString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true 
    });
    const endDate = new Date(endAt).toLocaleString('en-US', { 
      hour: 'numeric',
      minute: '2-digit',
      hour12: true 
    });

    const encodedAddress = encodeURIComponent(spotAddress);
    const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`;
    const appUrl = Deno.env.get('APP_URL') || 'https://parkzy.lovable.app';
    
    // Guest booking URL with access token
    const guestBookingUrl = `${appUrl}/guest-booking/${bookingId}?token=${guestAccessToken}`;
    const hostBookingUrl = `${appUrl}/host-booking-confirmation/${bookingId}`;

    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'Parkzy <onboarding@resend.dev>';

    let emailSent = false;
    let smsSent = false;

    // Send SMS to guest if phone provided
    if (guestPhone && guestPhone.length >= 10) {
      const smsBody = `✅ Parkzy Booking Confirmed!

Hi ${guestName}, your parking is secured!

📍 ${spotTitle}
📫 ${spotAddress}
🕐 ${startDate} - ${endDate}
💳 $${totalAmount.toFixed(2)} paid

View booking: ${guestBookingUrl}

Get directions: ${directionsUrl}`;

      const smsResult = await sendTwilioSMS(guestPhone, smsBody);
      smsSent = smsResult.success;
      if (!smsResult.success) {
        console.error("Failed to send SMS:", smsResult.error);
      }
    }

    // Send email to guest
    if (guestEmail && guestEmail.includes('@')) {
      const guestEmailResponse = await resend.emails.send({
        from: fromEmail,
        to: [guestEmail],
        subject: "✅ Booking Confirmed!",
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Booking Confirmed</title>
            </head>
            <body style="margin: 0; padding: 0; background-color: #f8f9fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; padding: 40px 20px;">
                <tr>
                  <td align="center">
                    <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                      <!-- Header -->
                      <tr>
                        <td style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 40px 30px; text-align: center;">
                          <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">✅ Booking Confirmed!</h1>
                          <p style="margin: 10px 0 0 0; color: rgba(255, 255, 255, 0.9); font-size: 16px;">Your parking is secured</p>
                        </td>
                      </tr>
                      
                      <!-- Content -->
                      <tr>
                        <td style="padding: 40px 30px;">
                          <p style="margin: 0 0 24px 0; color: #1f2937; font-size: 16px; line-height: 1.5;">
                            Hi <strong>${guestName}</strong>,
                          </p>
                          <p style="margin: 0 0 24px 0; color: #1f2937; font-size: 16px; line-height: 1.5;">
                            Great news! Your parking spot is confirmed and ready for you. Save the details below and use your personal booking link to manage your reservation.
                          </p>
                          
                          <!-- Booking Details Card -->
                          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-radius: 12px; padding: 24px; margin: 24px 0;">
                            <tr>
                              <td>
                                <h2 style="margin: 0 0 16px 0; color: #8B5CF6; font-size: 18px; font-weight: 600;">Your Parking Details</h2>
                                
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
                                    <td colspan="2" style="padding: 12px 0 8px 0; border-top: 2px solid #e5e7eb;">
                                      <table width="100%">
                                        <tr>
                                          <td style="color: #1f2937; font-size: 16px; font-weight: 700;">💳 Total Paid</td>
                                          <td style="color: #8B5CF6; font-size: 20px; font-weight: 700; text-align: right;">$${totalAmount.toFixed(2)}</td>
                                        </tr>
                                      </table>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>
                          
                          <!-- Important Info Box -->
                          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #dbeafe; border-left: 4px solid #3b82f6; border-radius: 8px; padding: 16px; margin: 24px 0;">
                            <tr>
                              <td>
                                <p style="margin: 0; color: #1e40af; font-size: 14px; font-weight: 600;">🔗 Your Booking Link</p>
                                <p style="margin: 8px 0 0 0; color: #1e3a8a; font-size: 13px; line-height: 1.5;">
                                  Bookmark this link to view, manage, or cancel your booking anytime:<br>
                                  <a href="${guestBookingUrl}" style="color: #3b82f6;">${guestBookingUrl}</a>
                                </p>
                              </td>
                            </tr>
                          </table>
                          
                          <!-- CTA Buttons -->
                          <table width="100%" cellpadding="0" cellspacing="0" style="margin: 32px 0 24px 0;">
                            <tr>
                              <td align="center">
                                <a href="${directionsUrl}" style="display: inline-block; background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 0 8px 8px 8px;">🗺️ Get Directions</a>
                                <a href="${guestBookingUrl}" style="display: inline-block; background-color: #f3f4f6; color: #1f2937; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 0 8px 8px 8px;">View Booking</a>
                              </td>
                            </tr>
                          </table>
                          
                          <p style="margin: 24px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                            Want to manage all your bookings in one place? <a href="${appUrl}/auth" style="color: #8B5CF6;">Create a free account</a>
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

      emailSent = !guestEmailResponse.error;
      console.log("Guest confirmation email sent:", guestEmailResponse);
    }

    // Send notification email to host
    if (hostEmail && hostEmail.includes('@')) {
      const hostEmailResponse = await resend.emails.send({
        from: fromEmail,
        to: [hostEmail],
        subject: "🎉 New Guest Booking!",
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>New Guest Booking</title>
            </head>
            <body style="margin: 0; padding: 0; background-color: #f8f9fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; padding: 40px 20px;">
                <tr>
                  <td align="center">
                    <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                      <!-- Header -->
                      <tr>
                        <td style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 40px 30px; text-align: center;">
                          <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">🎉 New Guest Booking!</h1>
                          <p style="margin: 10px 0 0 0; color: rgba(255, 255, 255, 0.9); font-size: 16px;">You've earned $${totalAmount.toFixed(2)}</p>
                        </td>
                      </tr>
                      
                      <!-- Content -->
                      <tr>
                        <td style="padding: 40px 30px;">
                          <p style="margin: 0 0 24px 0; color: #1f2937; font-size: 16px; line-height: 1.5;">
                            Hi <strong>${hostName}</strong>,
                          </p>
                          <p style="margin: 0 0 24px 0; color: #1f2937; font-size: 16px; line-height: 1.5;">
                            Great news! <strong>${guestName}</strong> (a guest user) has booked your parking spot.
                          </p>
                          
                          <!-- Booking Details Card -->
                          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-radius: 12px; padding: 24px; margin: 24px 0;">
                            <tr>
                              <td>
                                <h2 style="margin: 0 0 16px 0; color: #8B5CF6; font-size: 18px; font-weight: 600;">Booking Details</h2>
                                
                                <table width="100%" cellpadding="8" cellspacing="0">
                                  <tr>
                                    <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">📍 Spot</td>
                                    <td style="color: #1f2937; font-size: 14px; font-weight: 600; text-align: right; padding: 8px 0;">${spotTitle}</td>
                                  </tr>
                                  <tr>
                                    <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">🚗 Guest</td>
                                    <td style="color: #1f2937; font-size: 14px; font-weight: 600; text-align: right; padding: 8px 0;">${guestName}</td>
                                  </tr>
                                  <tr>
                                    <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">🕐 Start</td>
                                    <td style="color: #1f2937; font-size: 14px; font-weight: 600; text-align: right; padding: 8px 0;">${startDate}</td>
                                  </tr>
                                  <tr>
                                    <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">🕐 End</td>
                                    <td style="color: #1f2937; font-size: 14px; font-weight: 600; text-align: right; padding: 8px 0;">${endDate}</td>
                                  </tr>
                                  <tr>
                                    <td colspan="2" style="padding: 12px 0 8px 0; border-top: 2px solid #e5e7eb;">
                                      <table width="100%">
                                        <tr>
                                          <td style="color: #1f2937; font-size: 16px; font-weight: 700;">💰 Your Earnings</td>
                                          <td style="color: #8B5CF6; font-size: 20px; font-weight: 700; text-align: right;">$${totalAmount.toFixed(2)}</td>
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
                                <a href="${hostBookingUrl}" style="display: inline-block; background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">View Booking</a>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      
                      <!-- Footer -->
                      <tr>
                        <td style="background-color: #f8f9fa; padding: 24px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                          <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px;">
                            Best regards,<br><strong style="color: #8B5CF6;">The Parkzy Team</strong>
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

      console.log("Host notification email sent:", hostEmailResponse);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      emailSent, 
      smsSent,
      message: smsSent ? 'SMS confirmation sent' : emailSent ? 'Email confirmation sent' : 'No confirmation sent'
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-guest-booking-confirmation function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
