import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WelcomeEmailRequest {
  userId: string;
  email: string;
  firstName?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate internal secret - this is called internally
    const authHeader = req.headers.get('Authorization');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!authHeader || !authHeader.includes(serviceRoleKey || '')) {
      console.warn('[send-welcome-email] Unauthorized access attempt');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { userId, email, firstName }: WelcomeEmailRequest = await req.json();

    if (!email || !email.includes('@')) {
      console.log("No valid email provided, skipping welcome email");
      return new Response(JSON.stringify({ success: false, reason: "No valid email" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const appUrl = Deno.env.get('APP_URL') || 'https://parkzy.lovable.app';
    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'Parkzy <onboarding@resend.dev>';
    const displayName = firstName || 'there';

    const emailResponse = await resend.emails.send({
      from: fromEmail,
      to: [email],
      subject: "🎉 Welcome to Parkzy!",
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Welcome to Parkzy</title>
          </head>
          <body style="margin: 0; padding: 0; background-color: #f8f9fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; padding: 40px 20px;">
              <tr>
                <td align="center">
                  <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                      <td style="background: linear-gradient(135deg, #6B4EFF 0%, #5B3EEF 100%); padding: 50px 30px; text-align: center;">
                        <img src="https://mqbupmusmciijsjmzbcu.supabase.co/storage/v1/object/public/assets/parkzy-logo-white.png" alt="Parkzy" style="height: 48px; width: auto; margin-bottom: 20px;" />
                        <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700;">Welcome to Parkzy! 🚗</h1>
                        <p style="margin: 16px 0 0 0; color: rgba(255, 255, 255, 0.9); font-size: 18px;">Your parking journey starts here</p>
                      </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                      <td style="padding: 40px 30px;">
                        <p style="margin: 0 0 24px 0; color: #1f2937; font-size: 18px; line-height: 1.5;">
                          Hi <strong>${displayName}</strong>! 👋
                        </p>
                        <p style="margin: 0 0 24px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                          We're thrilled to have you join the Parkzy community. Whether you're looking for a convenient parking spot or want to earn money by sharing your space, we've got you covered.
                        </p>
                        
                        <!-- Features Grid -->
                        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 32px 0;">
                          <tr>
                            <td style="padding: 16px; background-color: #f3e8ff; border-radius: 12px; margin-bottom: 12px;">
                              <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td width="50" valign="top">
                                    <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #6B4EFF 0%, #5B3EEF 100%); border-radius: 10px; text-align: center; line-height: 40px; font-size: 20px;">🔍</div>
                                  </td>
                                  <td style="padding-left: 12px;">
                                    <h3 style="margin: 0 0 6px 0; color: #1f2937; font-size: 16px; font-weight: 600;">Find Parking Instantly</h3>
                                    <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.4;">Search nearby spots and book in seconds with real-time availability.</p>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                          <tr><td height="12"></td></tr>
                          <tr>
                            <td style="padding: 16px; background-color: #ecfdf5; border-radius: 12px;">
                              <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td width="50" valign="top">
                                    <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #10B981 0%, #059669 100%); border-radius: 10px; text-align: center; line-height: 40px; font-size: 20px;">💰</div>
                                  </td>
                                  <td style="padding-left: 12px;">
                                    <h3 style="margin: 0 0 6px 0; color: #1f2937; font-size: 16px; font-weight: 600;">Earn Money Hosting</h3>
                                    <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.4;">Have a driveway or garage? List it and start earning passive income.</p>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                          <tr><td height="12"></td></tr>
                          <tr>
                            <td style="padding: 16px; background-color: #fef3c7; border-radius: 12px;">
                              <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td width="50" valign="top">
                                    <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%); border-radius: 10px; text-align: center; line-height: 40px; font-size: 20px;">⚡</div>
                                  </td>
                                  <td style="padding-left: 12px;">
                                    <h3 style="margin: 0 0 6px 0; color: #1f2937; font-size: 16px; font-weight: 600;">EV Charging Available</h3>
                                    <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.4;">Find spots with EV charging to power up while you park.</p>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                        
                        <!-- CTA Button -->
                        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 32px 0;">
                          <tr>
                            <td align="center">
                              <a href="${appUrl}/explore" style="display: inline-block; background: linear-gradient(135deg, #6B4EFF 0%, #5B3EEF 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 10px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 14px rgba(107, 78, 255, 0.4);">Start Exploring →</a>
                            </td>
                          </tr>
                        </table>
                        
                        <!-- Tips Box -->
                        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-radius: 12px; padding: 20px; margin: 24px 0;">
                          <tr>
                            <td>
                              <p style="margin: 0 0 12px 0; color: #1f2937; font-size: 15px; font-weight: 600;">💡 Quick Tips to Get Started:</p>
                              <ul style="margin: 0; padding-left: 20px; color: #4b5563; font-size: 14px; line-height: 1.8;">
                                <li>Add your vehicle to speed up bookings</li>
                                <li>Enable notifications to never miss a deal</li>
                                <li>Save your favorite locations for quick access</li>
                                <li>Got a parking space? Switch to host mode anytime!</li>
                              </ul>
                            </td>
                          </tr>
                        </table>
                        
                        <p style="margin: 24px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.5; text-align: center;">
                          Questions? Just reply to this email — we're here to help!
                        </p>
                      </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                      <td style="background-color: #f8f9fa; padding: 24px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                        <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px;">
                          Happy Parking! 🚗<br><strong style="color: #6B4EFF;">The Parkzy Team</strong>
                        </p>
                        <p style="margin: 12px 0 0 0; color: #9ca3af; font-size: 12px;">
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

    console.log("Welcome email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, emailId: emailResponse.data?.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in send-welcome-email function:", error);
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
