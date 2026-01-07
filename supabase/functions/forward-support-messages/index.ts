import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const SUPPORT_USER_ID = "00000000-0000-0000-0000-000000000001";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate internal secret - this is called by Supabase webhook/trigger
    const authHeader = req.headers.get('Authorization');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    // Allow both service role key and Supabase webhook signatures
    if (!authHeader || (!authHeader.includes(serviceRoleKey || '') && !authHeader.includes('Bearer '))) {
      console.warn('[forward-support-messages] Unauthorized access attempt');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Parse the webhook payload
    const { record } = await req.json();
    
    console.log("Received message for forwarding:", record);

    // Only forward messages sent TO support (not FROM support)
    if (record.recipient_id !== SUPPORT_USER_ID) {
      console.log("Message not for support, skipping");
      return new Response(JSON.stringify({ message: "Not a support message" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get sender's profile and auth email
    const { data: senderProfile } = await supabase
      .from('profiles')
      .select('first_name, last_name, email')
      .eq('user_id', record.sender_id)
      .single();

    const { data: { user: senderUser } } = await supabase.auth.admin.getUserById(record.sender_id);
    
    const senderEmail = senderUser?.email || senderProfile?.email || 'unknown@user.com';
    const senderName = senderProfile 
      ? `${senderProfile.first_name || ''} ${senderProfile.last_name || ''}`.trim() || 'User'
      : 'User';

    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'Parkway <support@useparkway.com>';
    
    // Send email to support inbox
    const emailResponse = await resend.emails.send({
      from: fromEmail,
      to: ['miladfarazian@gmail.com'],
      replyTo: senderEmail,
      subject: `Support Message from ${senderName}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Support Message</title>
          </head>
          <body style="margin: 0; padding: 0; background-color: #f8f9fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; padding: 40px 20px;">
              <tr>
                <td align="center">
                  <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                      <td style="background: linear-gradient(135deg, #6B4EFF 0%, #5B3EEF 100%); padding: 30px; text-align: center;">
                        <img src="https://mqbupmusmciijsjmzbcu.supabase.co/storage/v1/object/public/assets/parkzy-logo-white.png" alt="Parkzy" style="height: 36px; width: auto; margin-bottom: 12px;" />
                        <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">💬 New Support Message</h1>
                      </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                      <td style="padding: 30px;">
                        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
                          <tr>
                            <td>
                              <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px; font-weight: 600;">From:</p>
                              <p style="margin: 0 0 16px 0; color: #1f2937; font-size: 16px; font-weight: 600;">${senderName}</p>
                              
                              <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px; font-weight: 600;">Email:</p>
                              <p style="margin: 0 0 16px 0; color: #1f2937; font-size: 14px;">${senderEmail}</p>
                              
                              <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px; font-weight: 600;">User ID:</p>
                              <p style="margin: 0 0 16px 0; color: #1f2937; font-size: 12px; font-family: monospace;">${record.sender_id}</p>
                              
                              <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px; font-weight: 600;">Message:</p>
                              <div style="background-color: #ffffff; border-left: 4px solid #6B4EFF; padding: 16px; border-radius: 8px; margin-top: 8px;">
                                <p style="margin: 0; color: #1f2937; font-size: 15px; line-height: 1.6; white-space: pre-wrap;">${record.message || '(No text - media only)'}</p>
                              </div>
                              
                              ${record.media_url ? `
                                <p style="margin: 16px 0 8px 0; color: #6b7280; font-size: 14px; font-weight: 600;">Attachment:</p>
                                <p style="margin: 0;">
                                  <a href="${record.media_url}" style="color: #6B4EFF; text-decoration: underline;">View attachment</a>
                                </p>
                              ` : ''}
                            </td>
                          </tr>
                        </table>
                        
                        <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 8px; padding: 16px; margin: 20px 0;">
                          <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.5;">
                            <strong>💡 Quick tip:</strong> Reply directly to this email to respond to ${senderName}. Your reply will be sent to ${senderEmail}.
                          </p>
                        </div>
                        
                        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
                          <tr>
                            <td align="center">
                              <a href="https://mqbupmusmciijsjmzbcu.supabase.co/messages?userId=${record.sender_id}" style="display: inline-block; background: linear-gradient(135deg, #6B4EFF 0%, #5B3EEF 100%); color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">View in App</a>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                      <td style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
                        <p style="margin: 0; color: #6b7280; font-size: 12px;">
                          Sent at ${new Date(record.created_at).toLocaleString()}<br>
                          Message ID: ${record.id}
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

    console.log("Support email sent:", emailResponse);

    return new Response(
      JSON.stringify({ success: true, emailId: emailResponse.data?.id }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  } catch (error: any) {
    console.error("Error forwarding support message:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
