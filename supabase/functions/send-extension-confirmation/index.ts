import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { logger } from "../_shared/logger.ts";

const log = logger.scope("send-extension-confirmation");

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

interface ExtensionConfirmationRequest {
  bookingId: string;
  driverEmail?: string;
  driverName: string;
  hostEmail?: string;
  hostName: string;
  spotTitle: string;
  spotAddress: string;
  originalEndTime: string;
  newEndTime: string;
  extensionHours: number;
  extensionCost: number;
  newTotalAmount: number;
  hostEarnings: number;
}

// Generate a magic link for the user using recovery type
async function generateMagicLink(email: string, redirectTo: string): Promise<string | null> {
  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: email,
      options: {
        redirectTo: redirectTo,
      },
    });

    if (error) {
      log.error("Error generating magic link:", error);
      return null;
    }

    if (data?.properties?.action_link) {
      log.debug("Generated action_link for:", email);
      return data.properties.action_link;
    }

    return null;
  } catch (error) {
    log.error("Error in generateMagicLink:", error);
    return null;
  }
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  const preflightResponse = handleCorsPreflight(req);
  if (preflightResponse) return preflightResponse;

  try {
    const {
      bookingId,
      driverEmail,
      driverName,
      hostEmail,
      hostName,
      spotTitle,
      spotAddress,
      originalEndTime,
      newEndTime,
      extensionHours,
      extensionCost,
      newTotalAmount,
      hostEarnings,
    }: ExtensionConfirmationRequest = await req.json();

    log.info("Sending extension confirmation emails:", {
      bookingId,
      driverEmail: driverEmail ? "present" : "missing",
      hostEmail: hostEmail ? "present" : "missing",
    });

    // Format times
    const formatTime = (isoString: string) => {
      return new Date(isoString).toLocaleString("en-US", {
        timeZone: "America/Los_Angeles",
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    };

    const originalEndFormatted = formatTime(originalEndTime);
    const newEndFormatted = formatTime(newEndTime);

    // Extension display (e.g., "1h 30m")
    const extensionMinutes = Math.round(extensionHours * 60);
    const extensionDisplay =
      extensionMinutes >= 60
        ? `${Math.floor(extensionMinutes / 60)}h${extensionMinutes % 60 > 0 ? ` ${extensionMinutes % 60}m` : ""}`
        : `${extensionMinutes}m`;

    const encodedAddress = encodeURIComponent(spotAddress);
    const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`;
    const appUrl = Deno.env.get("APP_URL") || "https://parkzy.lovable.app";

    // Base URLs for booking pages
    const bookingPath = `${appUrl}/booking/${bookingId}?magic_login=true`;

    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "Parkzy <onboarding@resend.dev>";

    // Generate magic links
    let driverBookingUrl = `${appUrl}/booking/${bookingId}`;
    let hostBookingUrl = `${appUrl}/booking/${bookingId}`;

    if (driverEmail && driverEmail.includes("@")) {
      const magicLink = await generateMagicLink(driverEmail, bookingPath);
      if (magicLink) {
        driverBookingUrl = magicLink;
        log.debug("Generated magic link for driver");
      }
    }

    if (hostEmail && hostEmail.includes("@")) {
      const magicLink = await generateMagicLink(hostEmail, bookingPath);
      if (magicLink) {
        hostBookingUrl = magicLink;
        log.debug("Generated magic link for host");
      }
    }

    const emailResults: { driver?: string; host?: string } = {};

    // Send driver email
    if (driverEmail && driverEmail.includes("@")) {
      try {
        const driverEmailResponse = await resend.emails.send({
          from: fromEmail,
          to: [driverEmail],
          subject: "⏰ Extension Confirmed!",
          html: `
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Extension Confirmed</title>
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
                            <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">⏰ Extension Confirmed!</h1>
                            <p style="margin: 10px 0 0 0; color: rgba(255, 255, 255, 0.9); font-size: 15px;">Your parking has been extended</p>
                          </td>
                        </tr>
                        
                        <!-- Content -->
                        <tr>
                          <td class="content-cell" style="padding: 32px 24px;">
                            <p style="margin: 0 0 20px 0; color: #1f2937; font-size: 15px; line-height: 1.5;">
                              Hi <strong>${driverName}</strong>,
                            </p>
                            <p style="margin: 0 0 20px 0; color: #1f2937; font-size: 15px; line-height: 1.5;">
                              Great news! Your parking extension has been confirmed. You now have an additional <strong>${extensionDisplay}</strong> at your spot.
                            </p>
                            
                            <!-- Extension Summary Card -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #dcfce7; border-left: 4px solid #22c55e; border-radius: 8px; padding: 16px; margin: 20px 0;">
                              <tr>
                                <td>
                                  <p style="margin: 0; color: #166534; font-size: 14px; font-weight: 600;">✅ Extension Details</p>
                                  <p style="margin: 8px 0 0 0; color: #14532d; font-size: 13px; line-height: 1.6;">
                                    <strong>Extended by:</strong> ${extensionDisplay}<br>
                                    <strong>Previous end:</strong> ${originalEndFormatted}<br>
                                    <strong>New end time:</strong> ${newEndFormatted}
                                  </p>
                                </td>
                              </tr>
                            </table>
                            
                            <!-- Booking Details Card -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-radius: 12px; margin: 20px 0;">
                              <tr>
                                <td style="padding: 20px;">
                                  <h2 style="margin: 0 0 16px 0; color: #6B4EFF; font-size: 16px; font-weight: 600;">Updated Booking Details</h2>
                                  
                                  <table class="detail-table" width="100%" cellpadding="0" cellspacing="0" style="font-size: 14px;">
                                    <tr>
                                      <td style="color: #6b7280; padding: 8px 0; vertical-align: top; width: 110px;">📍 Spot</td>
                                      <td style="color: #1f2937; font-weight: 600; padding: 8px 0; word-break: break-word;">${spotTitle}</td>
                                    </tr>
                                    <tr>
                                      <td style="color: #6b7280; padding: 8px 0; vertical-align: top;">📍 Location</td>
                                      <td style="color: #1f2937; font-weight: 600; padding: 8px 0; word-break: break-word;"><a href="${directionsUrl}" style="color: #6B4EFF; text-decoration: underline;">${spotAddress}</a></td>
                                    </tr>
                                    <tr>
                                      <td style="color: #6b7280; padding: 8px 0; vertical-align: top;">🕐 New End</td>
                                      <td style="color: #22c55e; font-weight: 700; padding: 8px 0;">${newEndFormatted}</td>
                                    </tr>
                                    <tr>
                                      <td colspan="2" style="padding: 12px 0 0 0; border-top: 2px solid #e5e7eb;">
                                        <table width="100%">
                                          <tr>
                                            <td style="color: #6b7280; font-size: 13px;">Extension Cost</td>
                                            <td style="color: #1f2937; font-size: 13px; text-align: right;">$${extensionCost.toFixed(2)}</td>
                                          </tr>
                                          <tr>
                                            <td style="color: #1f2937; font-size: 15px; font-weight: 700; padding-top: 8px;">💳 New Total</td>
                                            <td style="color: #6B4EFF; font-size: 18px; font-weight: 700; text-align: right; padding-top: 8px;">$${newTotalAmount.toFixed(2)}</td>
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
                                  <a class="cta-button" href="${driverBookingUrl}" style="display: inline-block; background: linear-gradient(135deg, #6B4EFF 0%, #5B3EEF 100%); color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; margin: 4px;">View Booking</a>
                                  <a class="cta-button" href="${directionsUrl}" style="display: inline-block; background-color: #f3f4f6; color: #1f2937; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; margin: 4px;">Get Directions</a>
                                </td>
                              </tr>
                            </table>
                            
                            <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 13px; line-height: 1.5;">
                              Enjoy your extended parking! Remember to leave before your new end time to avoid overstay charges.
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

        emailResults.driver = driverEmailResponse.data?.id;
        log.info("Driver extension email sent:", driverEmailResponse.data?.id);
      } catch (emailError) {
        log.error("Error sending driver email:", emailError);
      }
    } else {
      log.debug("Skipping driver email: no valid recipient");
    }

    // Send host email
    if (hostEmail && hostEmail.includes("@")) {
      try {
        const hostEmailResponse = await resend.emails.send({
          from: fromEmail,
          to: [hostEmail],
          subject: "⏰ Booking Extended!",
          html: `
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Booking Extended</title>
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
                            <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">⏰ Booking Extended!</h1>
                            <p style="margin: 10px 0 0 0; color: rgba(255, 255, 255, 0.9); font-size: 15px;">You've earned an extra $${hostEarnings.toFixed(2)}</p>
                          </td>
                        </tr>
                        
                        <!-- Content -->
                        <tr>
                          <td class="content-cell" style="padding: 32px 24px;">
                            <p style="margin: 0 0 20px 0; color: #1f2937; font-size: 15px; line-height: 1.5;">
                              Hi <strong>${hostName}</strong>,
                            </p>
                            <p style="margin: 0 0 20px 0; color: #1f2937; font-size: 15px; line-height: 1.5;">
                              Great news! <strong>${driverName}</strong> has extended their parking by <strong>${extensionDisplay}</strong>. The additional earnings will be added to your balance.
                            </p>
                            
                            <!-- Extension Summary Card -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #dcfce7; border-left: 4px solid #22c55e; border-radius: 8px; padding: 16px; margin: 20px 0;">
                              <tr>
                                <td>
                                  <p style="margin: 0; color: #166534; font-size: 14px; font-weight: 600;">💰 Extension Earnings</p>
                                  <p style="margin: 8px 0 0 0; color: #14532d; font-size: 13px; line-height: 1.6;">
                                    <strong>Extended by:</strong> ${extensionDisplay}<br>
                                    <strong>Additional earnings:</strong> $${hostEarnings.toFixed(2)}<br>
                                    <strong>New end time:</strong> ${newEndFormatted}
                                  </p>
                                </td>
                              </tr>
                            </table>
                            
                            <!-- Booking Details Card -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-radius: 12px; margin: 20px 0;">
                              <tr>
                                <td style="padding: 20px;">
                                  <h2 style="margin: 0 0 16px 0; color: #6B4EFF; font-size: 16px; font-weight: 600;">Updated Booking Details</h2>
                                  
                                  <table class="detail-table" width="100%" cellpadding="0" cellspacing="0" style="font-size: 14px;">
                                    <tr>
                                      <td style="color: #6b7280; padding: 8px 0; vertical-align: top; width: 110px;">📍 Spot</td>
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
                                      <td style="color: #6b7280; padding: 8px 0; vertical-align: top;">🕐 New End</td>
                                      <td style="color: #22c55e; font-weight: 700; padding: 8px 0;">${newEndFormatted}</td>
                                    </tr>
                                    <tr>
                                      <td colspan="2" style="padding: 12px 0 0 0; border-top: 2px solid #e5e7eb;">
                                        <table width="100%">
                                          <tr>
                                            <td style="color: #1f2937; font-size: 15px; font-weight: 700;">💰 Extension Earnings</td>
                                            <td style="color: #6B4EFF; font-size: 18px; font-weight: 700; text-align: right;">+$${hostEarnings.toFixed(2)}</td>
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
                                </td>
                              </tr>
                            </table>
                            
                            <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 13px; line-height: 1.5;">
                              The driver's new departure time is ${newEndFormatted}. You can message them through the Parkzy app if needed.
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

        emailResults.host = hostEmailResponse.data?.id;
        log.info("Host extension email sent:", hostEmailResponse.data?.id);
      } catch (emailError) {
        log.error("Error sending host email:", emailError);
      }
    } else {
      log.debug("Skipping host email: no valid recipient");
    }

    return new Response(JSON.stringify({ success: true, emails: emailResults }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error) {
    log.error("Error in send-extension-confirmation:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
