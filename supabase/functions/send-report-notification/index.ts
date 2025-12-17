import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReportNotificationRequest {
  reportId: string;
  spotId: string;
  spotTitle: string;
  spotAddress: string;
  reporterName: string;
  reporterEmail: string | null;
  reason: string;
  details: string | null;
}

const reasonLabels: Record<string, string> = {
  inaccurate_info: "Inaccurate information",
  misleading_photos: "Misleading photos",
  scam: "Suspected scam or fraud",
  unsafe: "Unsafe location",
  unavailable: "Spot doesn't exist or unavailable",
  other: "Other",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      reportId,
      spotId,
      spotTitle,
      spotAddress,
      reporterName,
      reporterEmail,
      reason,
      details,
    }: ReportNotificationRequest = await req.json();

    const adminEmail = Deno.env.get("ADMIN_EMAIL");
    
    if (!adminEmail) {
      console.log("No ADMIN_EMAIL configured, skipping report notification");
      return new Response(
        JSON.stringify({ success: true, message: "No admin email configured" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "Parkzy <onboarding@resend.dev>";
    const appUrl = Deno.env.get("APP_URL") || "https://parkzy.lovable.app";
    const spotUrl = `${appUrl}/spot/${spotId}`;
    const reasonLabel = reasonLabels[reason] || reason;
    const reportDate = new Date().toLocaleString();

    console.log(`Sending report notification to ${adminEmail} for spot ${spotId}`);

    const emailResponse = await resend.emails.send({
      from: fromEmail,
      to: [adminEmail],
      subject: `🚨 Spot Report: ${reasonLabel}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Spot Report Notification</title>
          </head>
          <body style="margin: 0; padding: 0; background-color: #f8f9fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; padding: 40px 20px;">
              <tr>
                <td align="center">
                  <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                      <td style="background: linear-gradient(135deg, #DC2626 0%, #B91C1C 100%); padding: 40px 30px; text-align: center;">
                        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">🚨 New Spot Report</h1>
                        <p style="margin: 10px 0 0 0; color: rgba(255, 255, 255, 0.9); font-size: 16px;">Action may be required</p>
                      </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                      <td style="padding: 40px 30px;">
                        <p style="margin: 0 0 24px 0; color: #1f2937; font-size: 16px; line-height: 1.5;">
                          A user has reported a parking spot listing. Please review the details below and take appropriate action.
                        </p>
                        
                        <!-- Report Details Card -->
                        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fef2f2; border-left: 4px solid #dc2626; border-radius: 8px; padding: 20px; margin: 24px 0;">
                          <tr>
                            <td>
                              <h2 style="margin: 0 0 16px 0; color: #dc2626; font-size: 18px; font-weight: 600;">Report Details</h2>
                              
                              <table width="100%" cellpadding="8" cellspacing="0">
                                <tr>
                                  <td style="color: #6b7280; font-size: 14px; padding: 8px 0; width: 120px;">Reason</td>
                                  <td style="color: #1f2937; font-size: 14px; font-weight: 600; padding: 8px 0;">${reasonLabel}</td>
                                </tr>
                                ${details ? `
                                <tr>
                                  <td style="color: #6b7280; font-size: 14px; padding: 8px 0; vertical-align: top;">Details</td>
                                  <td style="color: #1f2937; font-size: 14px; padding: 8px 0;">${details}</td>
                                </tr>
                                ` : ''}
                                <tr>
                                  <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">Report ID</td>
                                  <td style="color: #1f2937; font-size: 12px; font-family: monospace; padding: 8px 0;">${reportId}</td>
                                </tr>
                                <tr>
                                  <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">Reported At</td>
                                  <td style="color: #1f2937; font-size: 14px; padding: 8px 0;">${reportDate}</td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>

                        <!-- Spot Details Card -->
                        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-radius: 12px; padding: 20px; margin: 24px 0;">
                          <tr>
                            <td>
                              <h2 style="margin: 0 0 16px 0; color: #8B5CF6; font-size: 18px; font-weight: 600;">Reported Spot</h2>
                              
                              <table width="100%" cellpadding="8" cellspacing="0">
                                <tr>
                                  <td style="color: #6b7280; font-size: 14px; padding: 8px 0; width: 120px;">Category</td>
                                  <td style="color: #1f2937; font-size: 14px; font-weight: 600; padding: 8px 0;">${spotTitle}</td>
                                </tr>
                                <tr>
                                  <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">Address</td>
                                  <td style="color: #1f2937; font-size: 14px; padding: 8px 0;">${spotAddress}</td>
                                </tr>
                                <tr>
                                  <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">Spot ID</td>
                                  <td style="color: #1f2937; font-size: 12px; font-family: monospace; padding: 8px 0;">${spotId}</td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>

                        <!-- Reporter Details Card -->
                        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-radius: 12px; padding: 20px; margin: 24px 0;">
                          <tr>
                            <td>
                              <h2 style="margin: 0 0 16px 0; color: #6b7280; font-size: 18px; font-weight: 600;">Reporter</h2>
                              
                              <table width="100%" cellpadding="8" cellspacing="0">
                                <tr>
                                  <td style="color: #6b7280; font-size: 14px; padding: 8px 0; width: 120px;">Name</td>
                                  <td style="color: #1f2937; font-size: 14px; font-weight: 600; padding: 8px 0;">${reporterName}</td>
                                </tr>
                                ${reporterEmail ? `
                                <tr>
                                  <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">Email</td>
                                  <td style="color: #1f2937; font-size: 14px; padding: 8px 0;">${reporterEmail}</td>
                                </tr>
                                ` : ''}
                              </table>
                            </td>
                          </tr>
                        </table>
                        
                        <!-- CTA Button -->
                        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 32px 0 24px 0;">
                          <tr>
                            <td align="center">
                              <a href="${spotUrl}" style="display: inline-block; background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">View Reported Spot</a>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                      <td style="background-color: #f8f9fa; padding: 24px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                        <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px;">
                          <strong style="color: #8B5CF6;">Parkzy Admin Notification</strong>
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

    console.log("Report notification email sent:", emailResponse);

    return new Response(
      JSON.stringify({ success: true, emailId: emailResponse.data?.id }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error sending report notification:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
