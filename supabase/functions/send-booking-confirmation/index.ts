import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BookingConfirmationRequest {
  hostEmail?: string;
  hostName: string;
  driverEmail?: string;
  driverName: string;
  spotTitle: string;
  spotAddress: string;
  startAt: string;
  endAt: string;
  totalAmount: number;
  bookingId: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      hostEmail,
      hostName,
      driverEmail,
      driverName,
      spotTitle,
      spotAddress,
      startAt,
      endAt,
      totalAmount,
      bookingId,
    }: BookingConfirmationRequest = await req.json();

    const startDate = new Date(startAt).toLocaleString();
    const endDate = new Date(endAt).toLocaleString();

    const encodedAddress = encodeURIComponent(spotAddress);
    const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`;
    const hostBookingUrl = `https://mqbupmusmciijsjmzbcu.supabase.co/host-booking-confirmation/${bookingId}`;
    const driverBookingUrl = `https://mqbupmusmciijsjmzbcu.supabase.co/booking-confirmation/${bookingId}`;

    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'Parkzy <onboarding@resend.dev>';
    let hostEmailId: string | undefined;
    let driverEmailId: string | undefined;

    // Send email to host only if valid email exists
    if (hostEmail && hostEmail.includes('@')) {
      const hostEmailResponse = await resend.emails.send({
        from: fromEmail,
        to: [hostEmail],
      subject: "🎉 New Booking Received!",
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>New Booking Received</title>
          </head>
          <body style="margin: 0; padding: 0; background-color: #f8f9fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; padding: 40px 20px;">
              <tr>
                <td align="center">
                  <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                      <td style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 40px 30px; text-align: center;">
                        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">🎉 New Booking!</h1>
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
                          Great news! <strong>${driverName}</strong> has booked your parking spot. Your earnings will be available after the booking is completed.
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
                                  <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">📍 Location</td>
                                  <td style="color: #1f2937; font-size: 14px; font-weight: 600; text-align: right; padding: 8px 0;">${spotAddress}</td>
                                </tr>
                                <tr>
                                  <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">🚗 Driver</td>
                                  <td style="color: #1f2937; font-size: 14px; font-weight: 600; text-align: right; padding: 8px 0;">${driverName}</td>
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
                                        <td style="color: #1f2937; font-size: 16px; font-weight: 700;">💰 Total Earnings</td>
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
                              <a href="${hostBookingUrl}" style="display: inline-block; background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 0 8px 8px 8px;">View Booking</a>
                              <a href="${directionsUrl}" style="display: inline-block; background-color: #f3f4f6; color: #1f2937; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 0 8px 8px 8px;">Get Directions</a>
                            </td>
                          </tr>
                        </table>
                        
                        <p style="margin: 24px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                          Make sure your spot is ready for the driver's arrival. You can message them through the Parkzy app if needed.
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

      hostEmailId = hostEmailResponse.data?.id;
      console.log("Host email sent:", hostEmailResponse);
    } else {
      console.log("Skipping host email: no valid recipient. Email provided:", hostEmail);
    }

    // Send email to driver only if valid email exists
    if (driverEmail && driverEmail.includes('@')) {
      const driverEmailResponse = await resend.emails.send({
        from: fromEmail,
        to: [driverEmail],
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
                          Hi <strong>${driverName}</strong>,
                        </p>
                        <p style="margin: 0 0 24px 0; color: #1f2937; font-size: 16px; line-height: 1.5;">
                          Great news! Your parking spot is confirmed and ready for you. Save the details below and get directions when it's time to park.
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
                        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 8px; padding: 16px; margin: 24px 0;">
                          <tr>
                            <td>
                              <p style="margin: 0; color: #92400e; font-size: 14px; font-weight: 600;">⚠️ Important Reminders</p>
                              <p style="margin: 8px 0 0 0; color: #78350f; font-size: 13px; line-height: 1.5;">
                                • Arrive on time to maximize your parking duration<br>
                                • Follow any special instructions from your host<br>
                                • Contact your host through the app if you need assistance
                              </p>
                            </td>
                          </tr>
                        </table>
                        
                        <!-- CTA Buttons -->
                        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 32px 0 24px 0;">
                          <tr>
                            <td align="center">
                              <a href="${directionsUrl}" style="display: inline-block; background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 0 8px 8px 8px;">🗺️ Get Directions</a>
                              <a href="${driverBookingUrl}" style="display: inline-block; background-color: #f3f4f6; color: #1f2937; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 0 8px 8px 8px;">View Booking</a>
                            </td>
                          </tr>
                        </table>
                        
                        <p style="margin: 24px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                          Need help? Reply to this email or contact your host <strong>${hostName}</strong> through the Parkzy app.
                        </p>
                      </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                      <td style="background-color: #f8f9fa; padding: 24px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                        <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px;">
                          Happy parking!<br><strong style="color: #8B5CF6;">The Parkzy Team</strong>
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

      driverEmailId = driverEmailResponse.data?.id;
      console.log("Driver email sent:", driverEmailResponse);
    } else {
      console.log("Skipping driver email: no valid recipient. Email provided:", driverEmail);
    }

    return new Response(
      JSON.stringify({
        success: true,
        hostEmailId,
        driverEmailId,
        emailsSent: {
          host: !!hostEmailId,
          driver: !!driverEmailId
        }
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  } catch (error: any) {
    console.error("Error sending booking confirmation emails:", error);
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
