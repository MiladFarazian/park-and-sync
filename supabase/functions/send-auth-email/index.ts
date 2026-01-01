import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

// Supabase sends hook secrets in format "v1,whsec_<base64>", 
// but standardwebhooks expects only the base64 part after "whsec_"
const rawHookSecret = Deno.env.get("SEND_AUTH_EMAIL_HOOK_SECRET");
const hookSecret = rawHookSecret?.replace(/^v1,whsec_/, "");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AuthEmailPayload {
  user: {
    id: string;
    email: string;
    user_metadata?: {
      first_name?: string;
      last_name?: string;
    };
  };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
  };
}

const getEmailTemplate = (
  type: string,
  firstName: string,
  confirmUrl: string,
  token: string
): { subject: string; html: string } => {
  const appUrl = Deno.env.get('APP_URL') || 'https://parkzy.lovable.app';
  
  const templates: Record<string, { subject: string; heading: string; description: string; buttonText: string }> = {
    signup: {
      subject: "Verify your email for Parkzy",
      heading: "Verify Your Email",
      description: "Thanks for signing up for Parkzy! Please verify your email address to get started finding or listing parking spots.",
      buttonText: "Verify My Email"
    },
    email_change: {
      subject: "Confirm your new email for Parkzy",
      heading: "Confirm Email Change",
      description: "You requested to change your email address. Click the button below to confirm your new email.",
      buttonText: "Confirm Email Change"
    },
    recovery: {
      subject: "Reset your Parkzy password",
      heading: "Reset Your Password",
      description: "We received a request to reset your password. Click the button below to set a new password for your account.",
      buttonText: "Reset Password"
    },
    magiclink: {
      subject: "Your Parkzy login link",
      heading: "Magic Login Link",
      description: "Click the button below to securely sign in to your Parkzy account. This link will expire in 1 hour.",
      buttonText: "Sign In to Parkzy"
    }
  };

  const template = templates[type] || templates.signup;
  const displayName = firstName || 'there';

  const html = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${template.subject}</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: #f8f9fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; padding: 40px 20px;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
            <!-- Header with Logo -->
            <tr>
              <td style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 40px 30px; text-align: center;">
                <div style="margin-bottom: 16px;">
                  <span style="font-size: 40px;">🚗</span>
                </div>
                <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">Parkzy</h1>
              </td>
            </tr>
            
            <!-- Content -->
            <tr>
              <td style="padding: 40px 30px;">
                <h2 style="margin: 0 0 16px 0; color: #1f2937; font-size: 24px; font-weight: 700; text-align: center;">${template.heading}</h2>
                
                <p style="margin: 0 0 24px 0; color: #1f2937; font-size: 16px; line-height: 1.5;">
                  Hi <strong>${displayName}</strong>! 👋
                </p>
                
                <p style="margin: 0 0 32px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                  ${template.description}
                </p>
                
                <!-- CTA Button -->
                <table width="100%" cellpadding="0" cellspacing="0" style="margin: 32px 0;">
                  <tr>
                    <td align="center">
                      <a href="${confirmUrl}" style="display: inline-block; background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 10px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 14px rgba(139, 92, 246, 0.4);">${template.buttonText}</a>
                    </td>
                  </tr>
                </table>
                
                <!-- Alternative Link -->
                <div style="margin: 32px 0; padding: 20px; background-color: #f8f9fa; border-radius: 12px;">
                  <p style="margin: 0 0 12px 0; color: #6b7280; font-size: 14px; text-align: center;">
                    Or copy and paste this link into your browser:
                  </p>
                  <p style="margin: 0; color: #8B5CF6; font-size: 12px; word-break: break-all; text-align: center;">
                    ${confirmUrl}
                  </p>
                </div>
                
                ${type === 'signup' || type === 'magiclink' ? `
                <!-- Verification Code Box -->
                <div style="margin: 24px 0; padding: 20px; background-color: #f3e8ff; border-radius: 12px; text-align: center;">
                  <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px;">
                    Your verification code:
                  </p>
                  <code style="display: inline-block; padding: 12px 24px; background-color: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb; color: #1f2937; font-size: 18px; font-weight: 600; letter-spacing: 2px;">${token}</code>
                </div>
                ` : ''}
                
                <!-- Security Note -->
                <p style="margin: 24px 0 0 0; color: #9ca3af; font-size: 13px; line-height: 1.5; text-align: center;">
                  If you didn't request this email, you can safely ignore it. This link will expire in 24 hours.
                </p>
              </td>
            </tr>
            
            <!-- Footer -->
            <tr>
              <td style="background-color: #f8f9fa; padding: 24px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px;">
                  Happy Parking! 🚗<br><strong style="color: #8B5CF6;">The Parkzy Team</strong>
                </p>
                <p style="margin: 12px 0 0 0; color: #9ca3af; font-size: 12px;">
                  © 2025 Parkzy. All rights reserved.
                </p>
                <p style="margin: 8px 0 0 0;">
                  <a href="${appUrl}" style="color: #8B5CF6; text-decoration: none; font-size: 12px;">Visit Parkzy</a>
                  <span style="color: #d1d5db; margin: 0 8px;">|</span>
                  <a href="mailto:support@parkzy.app" style="color: #8B5CF6; text-decoration: none; font-size: 12px;">Contact Support</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `;

  return { subject: template.subject, html };
};

const handler = async (req: Request): Promise<Response> => {
  // Diagnostic logging
  console.log(`[send-auth-email] Request: ${req.method} ${req.url}`);
  console.log(`[send-auth-email] Headers present:`, [...req.headers.keys()].join(', '));
  console.log(`[send-auth-email] Hook secret configured:`, !!rawHookSecret);
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'Parkzy <onboarding@resend.dev>';

  try {
    const payload = await req.text();
    const headers = Object.fromEntries(req.headers);
    
    // Check for webhook signature headers
    const hasWebhookId = !!headers['webhook-id'];
    const hasWebhookTimestamp = !!headers['webhook-timestamp'];
    const hasWebhookSignature = !!headers['webhook-signature'];
    console.log(`[send-auth-email] Webhook headers: id=${hasWebhookId}, timestamp=${hasWebhookTimestamp}, signature=${hasWebhookSignature}`);
    
    let data: AuthEmailPayload;
    
    // Verify webhook signature if secret is configured
    if (hookSecret) {
      console.log(`[send-auth-email] Verifying webhook signature...`);
      try {
        const wh = new Webhook(hookSecret);
        data = wh.verify(payload, headers) as AuthEmailPayload;
        console.log(`[send-auth-email] Signature verified successfully`);
      } catch (verifyError: any) {
        console.error(`[send-auth-email] Signature verification failed:`, verifyError.message);
        return new Response(
          JSON.stringify({
            error: {
              http_code: 401,
              message: `Webhook signature verification failed: ${verifyError.message}`,
            },
          }),
          {
            status: 401,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );
      }
    } else {
      console.warn(`[send-auth-email] No hook secret configured - skipping signature verification`);
      data = JSON.parse(payload);
    }

    const { user, email_data } = data;
    const { token, token_hash, redirect_to, email_action_type } = email_data;

    console.log(`[send-auth-email] Processing ${email_action_type} for ${user.email}`);

    // Build the confirmation URL
    const confirmUrl = `${supabaseUrl}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${redirect_to}`;

    // Get first name from user metadata
    const firstName = user.user_metadata?.first_name || '';

    // Get email template based on action type
    const { subject, html } = getEmailTemplate(email_action_type, firstName, confirmUrl, token);

    // Send the branded email via Resend
    console.log(`[send-auth-email] Sending email via Resend...`);
    const { data: emailResult, error } = await resend.emails.send({
      from: fromEmail,
      to: [user.email],
      subject: subject,
      html: html,
    });

    if (error) {
      console.error('[send-auth-email] Resend error:', error);
      return new Response(
        JSON.stringify({
          error: {
            http_code: 500,
            message: `Email sending failed: ${error.message}`,
          },
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    console.log(`[send-auth-email] Email sent successfully: ${emailResult?.id}`);

    // Return success to Supabase Auth Hook
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("[send-auth-email] Unexpected error:", error);
    
    // Return error in the format Supabase expects
    return new Response(
      JSON.stringify({
        error: {
          http_code: 500,
          message: error.message || 'Unexpected error processing auth email',
        },
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
