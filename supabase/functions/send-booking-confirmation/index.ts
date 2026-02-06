import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  hostEarnings?: number;
  bookingId: string;
  accessNotes?: string;
  evChargingInstructions?: string;
  willUseEvCharging?: boolean;
  hasEvCharging?: boolean;
}

// Generate a magic link for the user using recovery type (more reliable for email links)
async function generateMagicLink(email: string, redirectTo: string): Promise<string | null> {
  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Use recovery type which is more reliable for email login links
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: {
        redirectTo: redirectTo,
      }
    });

    if (error) {
      console.error('Error generating magic link:', error);
      return null;
    }

    // Use the action_link directly - it's a complete, working URL
    if (data?.properties?.action_link) {
      console.log('Generated action_link for:', email);
      return data.properties.action_link;
    }

    return null;
  } catch (error) {
    console.error('Error in generateMagicLink:', error);
    return null;
  }
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
      hostEarnings,
      bookingId,
      accessNotes,
      evChargingInstructions,
      willUseEvCharging,
      hasEvCharging,
    }: BookingConfirmationRequest = await req.json();

    console.log('Booking confirmation data:', { 
      accessNotes, 
      evChargingInstructions, 
      willUseEvCharging, 
      hasEvCharging 
    });

    const startDate = new Date(startAt).toLocaleString();
    const endDate = new Date(endAt).toLocaleString();

    const encodedAddress = encodeURIComponent(spotAddress);
    const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`;
    const appUrl = Deno.env.get('APP_URL') || 'https://parkzy.lovable.app';
    
    // Base URLs for booking pages (with magic login flag)
    const hostBookingPath = `${appUrl}/host-booking-confirmation/${bookingId}?magic_login=true`;
    const driverBookingPath = `${appUrl}/booking-confirmation/${bookingId}?magic_login=true`;

    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'Parkzy <onboarding@resend.dev>';
    let hostEmailId: string | undefined;
    let driverEmailId: string | undefined;

    // Generate magic links for authenticated access
    let hostBookingUrl = `${appUrl}/host-booking-confirmation/${bookingId}`;
    let driverBookingUrl = `${appUrl}/booking-confirmation/${bookingId}`;

    // Try to generate magic links for email users
    if (hostEmail && hostEmail.includes('@')) {
      const magicLink = await generateMagicLink(hostEmail, hostBookingPath);
      if (magicLink) {
        hostBookingUrl = magicLink;
        console.log('Generated magic link for host');
      }
    }

    if (driverEmail && driverEmail.includes('@')) {
      const magicLink = await generateMagicLink(driverEmail, driverBookingPath);
      if (magicLink) {
        driverBookingUrl = magicLink;
        console.log('Generated magic link for driver');
      }
    }

    // Build access notes section for driver email
    const accessNotesSection = accessNotes ? `
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #e0f2fe; border-left: 4px solid #0ea5e9; border-radius: 8px; padding: 16px; margin: 24px 0;">
        <tr>
          <td>
            <p style="margin: 0; color: #0369a1; font-size: 14px; font-weight: 600;">🔑 Access Instructions</p>
            <p style="margin: 8px 0 0 0; color: #0c4a6e; font-size: 13px; line-height: 1.5;">
              ${accessNotes.replace(/\n/g, '<br>')}
            </p>
          </td>
        </tr>
      </table>
    ` : '';

    // Build EV charging section for driver email
    const evChargingSection = (willUseEvCharging && evChargingInstructions) ? `
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #dcfce7; border-left: 4px solid #22c55e; border-radius: 8px; padding: 16px; margin: 24px 0;">
        <tr>
          <td>
            <p style="margin: 0; color: #166534; font-size: 14px; font-weight: 600;">⚡ EV Charging Instructions</p>
            <p style="margin: 8px 0 0 0; color: #14532d; font-size: 13px; line-height: 1.5;">
              ${evChargingInstructions.replace(/\n/g, '<br>')}
            </p>
          </td>
        </tr>
      </table>
    ` : (hasEvCharging && !willUseEvCharging) ? `
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; border-left: 4px solid #9ca3af; border-radius: 8px; padding: 16px; margin: 24px 0;">
        <tr>
          <td>
            <p style="margin: 0; color: #374151; font-size: 14px; font-weight: 600;">⚡ EV Charging Available</p>
            <p style="margin: 8px 0 0 0; color: #4b5563; font-size: 13px; line-height: 1.5;">
              This spot offers EV charging. Contact your host if you'd like to use it.
            </p>
          </td>
        </tr>
      </table>
    ` : '';

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
            <style>
              @media only screen and (max-width: 600px) {
                .email-container { width: 100% !important; }
                .content-cell { padding: 24px 16px !important; }
                .header-cell { padding: 32px 16px !important; }
                .detail-table { font-size: 13px !important; }
                .cta-button { display: block !important; width: 100% !important; margin: 8px 0 !important; text-align: center !important; box-sizing: border-box !important; }
              }
            </style>
          </head>
          <body style="margin: 0; padding: 0; background-color: #f8f9fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; padding: 20px 8px;">
              <tr>
                <td align="center">
                  <table class="email-container" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                      <td class="header-cell" style="background: linear-gradient(135deg, #6B4EFF 0%, #5B3EEF 100%); padding: 40px 24px; text-align: center;">
                        <img src="https://mqbupmusmciijsjmzbcu.supabase.co/storage/v1/object/public/assets/parkzy-logo-white.png" alt="Parkzy" style="height: 36px; width: auto; margin-bottom: 16px;" />
                        <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">🎉 New Booking!</h1>
                        <p style="margin: 10px 0 0 0; color: rgba(255, 255, 255, 0.9); font-size: 15px;">You've earned $${(hostEarnings ?? totalAmount).toFixed(2)}</p>
                      </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                      <td class="content-cell" style="padding: 32px 24px;">
                        <p style="margin: 0 0 20px 0; color: #1f2937; font-size: 15px; line-height: 1.5;">
                          Hi <strong>${hostName}</strong>,
                        </p>
                        <p style="margin: 0 0 20px 0; color: #1f2937; font-size: 15px; line-height: 1.5;">
                          Great news! <strong>${driverName}</strong> has booked your parking spot. Your earnings will be available after the booking is completed.
                        </p>
                        
                        <!-- Booking Details Card -->
                        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-radius: 12px; margin: 20px 0;">
                          <tr>
                            <td style="padding: 20px;">
                              <h2 style="margin: 0 0 16px 0; color: #6B4EFF; font-size: 16px; font-weight: 600;">Booking Details</h2>
                              
                              <table class="detail-table" width="100%" cellpadding="0" cellspacing="0" style="font-size: 14px;">
                                <tr>
                                  <td style="color: #6b7280; padding: 8px 0; vertical-align: top; width: 90px;">📍 Spot</td>
                                  <td style="color: #1f2937; font-weight: 600; padding: 8px 0; word-break: break-word;">${spotTitle}</td>
                                </tr>
                                <tr>
                                  <td style="color: #6b7280; padding: 8px 0; vertical-align: top;">📍 Location</td>
                                  <td style="color: #1f2937; font-weight: 600; padding: 8px 0; word-break: break-word;"><a href="${directionsUrl}" style="color: #6B4EFF; text-decoration: underline;">${spotAddress}</a></td>
                                </tr>
                                <tr>
                                  <td style="color: #6b7280; padding: 8px 0; vertical-align: top;">🚗 Driver</td>
                                  <td style="color: #1f2937; font-weight: 600; padding: 8px 0;">${driverName}</td>
                                </tr>
                                <tr>
                                  <td style="color: #6b7280; padding: 8px 0; vertical-align: top;">🕐 Start</td>
                                  <td style="color: #1f2937; font-weight: 600; padding: 8px 0;">${startDate}</td>
                                </tr>
                                <tr>
                                  <td style="color: #6b7280; padding: 8px 0; vertical-align: top;">🕐 End</td>
                                  <td style="color: #1f2937; font-weight: 600; padding: 8px 0;">${endDate}</td>
                                </tr>
                                <tr>
                                  <td colspan="2" style="padding: 12px 0 0 0; border-top: 2px solid #e5e7eb;">
                                    <table width="100%">
                                      <tr>
                                        <td style="color: #1f2937; font-size: 15px; font-weight: 700;">💰 Total Earnings</td>
                                        <td style="color: #6B4EFF; font-size: 18px; font-weight: 700; text-align: right;">$${(hostEarnings ?? totalAmount).toFixed(2)}</td>
                                      </tr>
                                    </table>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                        
                        <!-- CTA Buttons -->
                        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0 20px 0;">
                          <tr>
                            <td align="center">
                              <a class="cta-button" href="${hostBookingUrl}" style="display: inline-block; background: linear-gradient(135deg, #6B4EFF 0%, #5B3EEF 100%); color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; margin: 4px;">View Booking</a>
                              <a class="cta-button" href="${directionsUrl}" style="display: inline-block; background-color: #f3f4f6; color: #1f2937; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; margin: 4px;">Get Directions</a>
                            </td>
                          </tr>
                        </table>
                        
                        <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 13px; line-height: 1.5;">
                          Make sure your spot is ready for the driver's arrival. You can message them through the Parkzy app if needed.
                        </p>
                      </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                      <td style="background-color: #f8f9fa; padding: 20px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
                        <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 13px;">
                          Best regards,<br><strong style="color: #6B4EFF;">The Parkzy Team</strong>
                        </p>
                        <p style="margin: 8px 0 0 0; color: #9ca3af; font-size: 11px;">
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
            <style>
              @media only screen and (max-width: 600px) {
                .email-container { width: 100% !important; }
                .content-cell { padding: 24px 16px !important; }
                .header-cell { padding: 32px 16px !important; }
                .detail-table { font-size: 13px !important; }
                .cta-button { display: block !important; width: 100% !important; margin: 8px 0 !important; text-align: center !important; box-sizing: border-box !important; }
                .info-box { padding: 14px !important; }
              }
            </style>
          </head>
          <body style="margin: 0; padding: 0; background-color: #f8f9fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; padding: 20px 8px;">
              <tr>
                <td align="center">
                  <table class="email-container" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                      <td class="header-cell" style="background: linear-gradient(135deg, #6B4EFF 0%, #5B3EEF 100%); padding: 40px 24px; text-align: center;">
                        <img src="https://mqbupmusmciijsjmzbcu.supabase.co/storage/v1/object/public/assets/parkzy-logo-white.png" alt="Parkzy" style="height: 36px; width: auto; margin-bottom: 16px;" />
                        <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">✅ Booking Confirmed!</h1>
                        <p style="margin: 10px 0 0 0; color: rgba(255, 255, 255, 0.9); font-size: 15px;">Your parking is secured</p>
                      </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                      <td class="content-cell" style="padding: 32px 24px;">
                        <p style="margin: 0 0 20px 0; color: #1f2937; font-size: 15px; line-height: 1.5;">
                          Hi <strong>${driverName}</strong>,
                        </p>
                        <p style="margin: 0 0 20px 0; color: #1f2937; font-size: 15px; line-height: 1.5;">
                          Great news! Your parking spot is confirmed and ready for you. Save the details below and get directions when it's time to park.
                        </p>
                        
                        <!-- Booking Details Card -->
                        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-radius: 12px; margin: 20px 0;">
                          <tr>
                            <td style="padding: 20px;">
                              <h2 style="margin: 0 0 16px 0; color: #6B4EFF; font-size: 16px; font-weight: 600;">Your Parking Details</h2>
                              
                              <table class="detail-table" width="100%" cellpadding="0" cellspacing="0" style="font-size: 14px;">
                                <tr>
                                  <td style="color: #6b7280; padding: 8px 0; vertical-align: top; width: 90px;">📍 Spot</td>
                                  <td style="color: #1f2937; font-weight: 600; padding: 8px 0; word-break: break-word;">${spotTitle}</td>
                                </tr>
                                <tr>
                                  <td style="color: #6b7280; padding: 8px 0; vertical-align: top;">📍 Address</td>
                                  <td style="color: #1f2937; font-weight: 600; padding: 8px 0; word-break: break-word;"><a href="${directionsUrl}" style="color: #6B4EFF; text-decoration: underline;">${spotAddress}</a></td>
                                </tr>
                                <tr>
                                  <td style="color: #6b7280; padding: 8px 0; vertical-align: top;">🏠 Host</td>
                                  <td style="color: #1f2937; font-weight: 600; padding: 8px 0;">${hostName}</td>
                                </tr>
                                <tr>
                                  <td style="color: #6b7280; padding: 8px 0; vertical-align: top;">🕐 Check-in</td>
                                  <td style="color: #1f2937; font-weight: 600; padding: 8px 0;">${startDate}</td>
                                </tr>
                                <tr>
                                  <td style="color: #6b7280; padding: 8px 0; vertical-align: top;">🕐 Check-out</td>
                                  <td style="color: #1f2937; font-weight: 600; padding: 8px 0;">${endDate}</td>
                                </tr>
                                <tr>
                                  <td colspan="2" style="padding: 12px 0 0 0; border-top: 2px solid #e5e7eb;">
                                    <table width="100%">
                                      <tr>
                                        <td style="color: #1f2937; font-size: 15px; font-weight: 700;">💳 Total Paid</td>
                                        <td style="color: #6B4EFF; font-size: 18px; font-weight: 700; text-align: right;">$${totalAmount.toFixed(2)}</td>
                                      </tr>
                                    </table>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                        
                        <!-- Access Notes Section -->
                        ${accessNotesSection}
                        
                        <!-- EV Charging Section -->
                        ${evChargingSection}
                        
                        <!-- Important Info Box -->
                        <table class="info-box" width="100%" cellpadding="0" cellspacing="0" style="background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 8px; padding: 16px; margin: 20px 0;">
                          <tr>
                            <td>
                              <p style="margin: 0; color: #92400e; font-size: 13px; font-weight: 600;">⚠️ Important Reminders</p>
                              <p style="margin: 8px 0 0 0; color: #78350f; font-size: 12px; line-height: 1.5;">
                                • Arrive on time to maximize your parking duration<br>
                                • Follow any special instructions from your host<br>
                                • Contact your host through the app if you need assistance
                              </p>
                            </td>
                          </tr>
                        </table>
                        
                        <!-- CTA Buttons -->
                        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0 20px 0;">
                          <tr>
                            <td align="center">
                              <a class="cta-button" href="${directionsUrl}" style="display: inline-block; background: linear-gradient(135deg, #6B4EFF 0%, #5B3EEF 100%); color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; margin: 4px;">🗺️ Get Directions</a>
                              <a class="cta-button" href="${driverBookingUrl}" style="display: inline-block; background-color: #f3f4f6; color: #1f2937; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; margin: 4px;">View Booking</a>
                            </td>
                          </tr>
                        </table>
                        
                        <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 13px; line-height: 1.5;">
                          Need help? Reply to this email or contact your host <strong>${hostName}</strong> through the Parkzy app.
                        </p>
                      </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                      <td style="background-color: #f8f9fa; padding: 20px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
                        <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 13px;">
                          Happy parking!<br><strong style="color: #6B4EFF;">The Parkzy Team</strong>
                        </p>
                        <p style="margin: 8px 0 0 0; color: #9ca3af; font-size: 11px;">
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
