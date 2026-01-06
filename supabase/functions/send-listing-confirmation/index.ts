import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "Parkzy <noreply@useparkzy.com>";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ListingConfirmationRequest {
  hostEmail: string;
  hostName: string;
  spotCategory: string;
  spotAddress: string;
  hourlyRate: number;
  spotId: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { hostEmail, hostName, spotCategory, spotAddress, hourlyRate, spotId }: ListingConfirmationRequest = await req.json();

    console.log("Sending listing confirmation email to:", hostEmail);

    if (!hostEmail) {
      console.log("No host email provided, skipping email notification");
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const appUrl = Deno.env.get("APP_URL") || "https://parkzy.lovable.app";
    const dashboardUrl = `${appUrl}/dashboard`;

    const emailResponse = await resend.emails.send({
      from: fromEmail,
      to: [hostEmail],
      subject: "🎉 Your parking spot is now live on Parkzy!",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                  <!-- Header -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); padding: 32px; text-align: center;">
                      <img src="https://mqbupmusmciijsjmzbcu.supabase.co/storage/v1/object/public/assets/parkzy-logo-white.png" alt="Parkzy" style="height: 40px; width: auto;" />
                    </td>
                  </tr>
                  
                  <!-- Content -->
                  <tr>
                    <td style="padding: 40px 32px;">
                      <h2 style="color: #18181b; margin: 0 0 16px 0; font-size: 24px; font-weight: 600;">
                        Congratulations${hostName ? `, ${hostName}` : ''}! 🎉
                      </h2>
                      <p style="color: #52525b; margin: 0 0 24px 0; font-size: 16px; line-height: 1.6;">
                        Your parking spot is now live and ready to accept bookings on Parkzy!
                      </p>
                      
                      <!-- Spot Details Card -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fafafa; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
                        <tr>
                          <td>
                            <p style="color: #71717a; margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px;">Listing Details</p>
                            <p style="color: #18181b; margin: 0 0 12px 0; font-size: 18px; font-weight: 600;">${spotCategory}</p>
                            <p style="color: #52525b; margin: 0 0 12px 0; font-size: 14px;">${spotAddress}</p>
                            <p style="color: #8b5cf6; margin: 0; font-size: 20px; font-weight: 700;">$${hourlyRate.toFixed(2)}/hour</p>
                          </td>
                        </tr>
                      </table>
                      
                      <p style="color: #52525b; margin: 0 0 24px 0; font-size: 16px; line-height: 1.6;">
                        Drivers in your area can now find and book your spot. You'll receive notifications when someone makes a booking.
                      </p>
                      
                      <!-- CTA Button -->
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td align="center">
                            <a href="${dashboardUrl}" style="display: inline-block; background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                              View Your Dashboard
                            </a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #fafafa; padding: 24px 32px; text-align: center; border-top: 1px solid #e4e4e7;">
                      <p style="color: #71717a; margin: 0 0 8px 0; font-size: 14px;">
                        Need help? Contact us at <a href="mailto:support@useparkzy.com" style="color: #8b5cf6; text-decoration: none;">support@useparkzy.com</a>
                      </p>
                      <p style="color: #a1a1aa; margin: 0; font-size: 12px;">
                        © ${new Date().getFullYear()} Parkzy. All rights reserved.
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

    console.log("Listing confirmation email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error sending listing confirmation email:", error);
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
