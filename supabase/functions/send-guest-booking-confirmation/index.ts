import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GuestBookingConfirmationRequest {
  type?: 'confirmed' | 'request';  // Default: 'confirmed'
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
  accessNotes?: string;
  evChargingInstructions?: string;
  hasEvCharging?: boolean;
  willUseEvCharging?: boolean;
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
      type = 'confirmed',  // Default to confirmed for backward compatibility
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
      accessNotes,
      evChargingInstructions,
      hasEvCharging,
      willUseEvCharging,
    }: GuestBookingConfirmationRequest = await req.json();

    const isRequest = type === 'request';

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
    const activityUrl = `${appUrl}/activity`;

    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'Parkzy <onboarding@resend.dev>';

    let emailSent = false;
    let smsSent = false;

    // Send SMS to guest if phone provided
    if (guestPhone && guestPhone.length >= 10) {
      const smsBody = isRequest 
        ? `📋 Parkzy Booking Request Submitted!

Hi ${guestName}, your request is pending host approval.

📍 ${spotTitle}
📫 ${spotAddress}
🕐 ${startDate} - ${endDate}
💳 $${totalAmount.toFixed(2)} authorized (not charged yet)

View status: ${guestBookingUrl}

We'll notify you within 1 hour.`
        : `✅ Parkzy Booking Confirmed!

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
      const guestSubject = isRequest 
        ? "📋 Booking Request Submitted" 
        : "✅ Booking Confirmed!";
      
      const guestHeaderTitle = isRequest
        ? "📋 Booking Request Submitted"
        : "✅ Booking Confirmed!";
      
      const guestHeaderSubtitle = isRequest
        ? "Awaiting host approval"
        : "Your parking is secured";
      
      const guestIntroText = isRequest
        ? `Your booking request has been submitted and is <strong>awaiting host approval</strong>. Your payment method has been authorized for $${totalAmount.toFixed(2)} but won't be charged until the host approves. We'll notify you within 1 hour.`
        : `Great news! Your parking spot is confirmed and ready for you. Save the details below and use your personal booking link to manage your reservation.`;
      
      const paymentStatusLabel = isRequest ? "💳 Authorized" : "💳 Total Paid";
      const paymentStatusNote = isRequest ? "(Not charged until approved)" : "";

      const guestEmailResponse = await resend.emails.send({
        from: fromEmail,
        to: [guestEmail],
        subject: guestSubject,
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>${guestSubject}</title>
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
                        <td class="header-cell" style="background: linear-gradient(135deg, ${isRequest ? '#f59e0b' : '#6B4EFF'} 0%, ${isRequest ? '#d97706' : '#5B3EEF'} 100%); padding: 40px 24px; text-align: center;">
                          <img src="https://mqbupmusmciijsjmzbcu.supabase.co/storage/v1/object/public/assets/parkzy-logo-white.png" alt="Parkzy" style="height: 36px; width: auto; margin-bottom: 16px;" />
                          <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">${guestHeaderTitle}</h1>
                          <p style="margin: 10px 0 0 0; color: rgba(255, 255, 255, 0.9); font-size: 15px;">${guestHeaderSubtitle}</p>
                        </td>
                      </tr>
                      
                      <!-- Content -->
                      <tr>
                        <td class="content-cell" style="padding: 32px 24px;">
                          <p style="margin: 0 0 20px 0; color: #1f2937; font-size: 15px; line-height: 1.5;">
                            Hi <strong>${guestName}</strong>,
                          </p>
                          <p style="margin: 0 0 20px 0; color: #1f2937; font-size: 15px; line-height: 1.5;">
                            ${guestIntroText}
                          </p>
                          
                          ${isRequest ? `
                          <!-- Pending Approval Notice -->
                          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 8px; margin: 20px 0;">
                            <tr>
                              <td style="padding: 16px;">
                                <p style="margin: 0; color: #92400e; font-size: 14px; font-weight: 600;">⏳ Awaiting Host Approval</p>
                                <p style="margin: 8px 0 0 0; color: #a16207; font-size: 13px; line-height: 1.5;">
                                  The host has up to 1 hour to approve or decline your request. You'll receive a notification as soon as they respond.
                                </p>
                              </td>
                            </tr>
                          </table>
                          ` : ''}
                          
                          <!-- Booking Details Card -->
                          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-radius: 12px; margin: 20px 0;">
                            <tr>
                              <td style="padding: 20px;">
                                <h2 style="margin: 0 0 16px 0; color: #6B4EFF; font-size: 16px; font-weight: 600;">${isRequest ? 'Request Details' : 'Your Parking Details'}</h2>
                                
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
                                          <td style="color: #1f2937; font-size: 15px; font-weight: 700;">${paymentStatusLabel}</td>
                                          <td style="color: ${isRequest ? '#f59e0b' : '#6B4EFF'}; font-size: 18px; font-weight: 700; text-align: right;">$${totalAmount.toFixed(2)}</td>
                                        </tr>
                                        ${paymentStatusNote ? `
                                        <tr>
                                          <td colspan="2" style="color: #6b7280; font-size: 12px; text-align: right; padding-top: 4px;">${paymentStatusNote}</td>
                                        </tr>
                                        ` : ''}
                                      </table>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>
                          
                          ${!isRequest && accessNotes ? `
                          <!-- Access Notes Section (Blue) -->
                          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #e0f2fe; border-left: 4px solid #0ea5e9; border-radius: 8px; margin: 20px 0;">
                            <tr>
                              <td style="padding: 16px;">
                                <p style="margin: 0; color: #0c4a6e; font-size: 14px; font-weight: 600;">🔑 Access Instructions</p>
                                <p style="margin: 10px 0 0 0; color: #075985; font-size: 13px; line-height: 1.6; white-space: pre-wrap;">${accessNotes}</p>
                              </td>
                            </tr>
                          </table>
                          ` : ''}
                          
                          ${!isRequest && willUseEvCharging && evChargingInstructions ? `
                          <!-- EV Charging Section (Green - opted in) -->
                          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #dcfce7; border-left: 4px solid #22c55e; border-radius: 8px; margin: 20px 0;">
                            <tr>
                              <td style="padding: 16px;">
                                <p style="margin: 0; color: #14532d; font-size: 14px; font-weight: 600;">⚡ EV Charging Instructions</p>
                                <p style="margin: 10px 0 0 0; color: #166534; font-size: 13px; line-height: 1.6; white-space: pre-wrap;">${evChargingInstructions}</p>
                              </td>
                            </tr>
                          </table>
                          ` : !isRequest && hasEvCharging && !willUseEvCharging ? `
                          <!-- EV Charging Available (Gray - not opted in) -->
                          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; border-left: 4px solid #9ca3af; border-radius: 8px; margin: 20px 0;">
                            <tr>
                              <td style="padding: 16px;">
                                <p style="margin: 0; color: #374151; font-size: 14px; font-weight: 600;">⚡ EV Charging Available</p>
                                <p style="margin: 8px 0 0 0; color: #6b7280; font-size: 13px; line-height: 1.5;">This spot has EV charging available. Contact the host if you'd like to use it.</p>
                              </td>
                            </tr>
                          </table>
                          ` : ''}
                          
                          <!-- Booking Link Info Box -->
                          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #dbeafe; border-left: 4px solid #3b82f6; border-radius: 8px; padding: 14px; margin: 20px 0;">
                            <tr>
                              <td>
                                <p style="margin: 0; color: #1e40af; font-size: 13px; font-weight: 600;">🔗 Your Booking Link</p>
                                <p style="margin: 8px 0 0 0; color: #1e3a8a; font-size: 12px; line-height: 1.5;">
                                  Bookmark this link to view${isRequest ? ' status,' : ','} manage, or cancel your booking anytime:<br>
                                  <a href="${guestBookingUrl}" style="color: #3b82f6; word-break: break-all;">${guestBookingUrl}</a>
                                </p>
                              </td>
                            </tr>
                          </table>
                          
                          <!-- CTA Buttons -->
                          <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0 20px 0;">
                            <tr>
                              <td align="center">
                                ${isRequest ? `
                                <a class="cta-button" href="${guestBookingUrl}" style="display: inline-block; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; margin: 4px;">View Request Status</a>
                                ` : `
                                <a class="cta-button" href="${directionsUrl}" style="display: inline-block; background: linear-gradient(135deg, #6B4EFF 0%, #5B3EEF 100%); color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; margin: 4px;">🗺️ Get Directions</a>
                                <a class="cta-button" href="${guestBookingUrl}" style="display: inline-block; background-color: #f3f4f6; color: #1f2937; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; margin: 4px;">View Booking</a>
                                `}
                              </td>
                            </tr>
                          </table>
                          
                          <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 13px; line-height: 1.5;">
                            Want to manage all your bookings in one place? <a href="${appUrl}/auth" style="color: #6B4EFF;">Create a free account</a>
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

      emailSent = !guestEmailResponse.error;
      console.log("Guest email sent:", guestEmailResponse);
    }

    // Send notification email to host
    if (hostEmail && hostEmail.includes('@')) {
      const hostSubject = isRequest 
        ? "🔔 New Booking Request - Action Required" 
        : "🎉 New Guest Booking!";
      
      const hostHeaderTitle = isRequest
        ? "🔔 New Booking Request"
        : "🎉 New Guest Booking!";
      
      const hostHeaderSubtitle = isRequest
        ? "Action required within 1 hour"
        : `You've earned $${totalAmount.toFixed(2)}`;
      
      const hostIntroText = isRequest
        ? `<strong>${guestName}</strong> (a guest user) wants to book your parking spot. Please approve or decline within <strong>1 hour</strong> or the request will expire automatically.`
        : `Great news! <strong>${guestName}</strong> (a guest user) has booked your parking spot.`;
      
      const hostPaymentNote = isRequest 
        ? `<tr><td colspan="2" style="color: #6b7280; font-size: 12px; padding-top: 8px;">Payment is authorized and will be captured upon approval.</td></tr>` 
        : '';

      const hostEmailResponse = await resend.emails.send({
        from: fromEmail,
        to: [hostEmail],
        subject: hostSubject,
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>${hostSubject}</title>
            </head>
            <body style="margin: 0; padding: 0; background-color: #f8f9fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; padding: 40px 20px;">
                <tr>
                  <td align="center">
                    <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                      <!-- Header -->
                      <tr>
                        <td style="background: linear-gradient(135deg, ${isRequest ? '#f59e0b' : '#6B4EFF'} 0%, ${isRequest ? '#d97706' : '#5B3EEF'} 100%); padding: 40px 30px; text-align: center;">
                          <img src="https://mqbupmusmciijsjmzbcu.supabase.co/storage/v1/object/public/assets/parkzy-logo-white.png" alt="Parkzy" style="height: 40px; width: auto; margin-bottom: 16px;" />
                          <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">${hostHeaderTitle}</h1>
                          <p style="margin: 10px 0 0 0; color: rgba(255, 255, 255, 0.9); font-size: 16px;">${hostHeaderSubtitle}</p>
                        </td>
                      </tr>
                      
                      <!-- Content -->
                      <tr>
                        <td style="padding: 40px 30px;">
                          <p style="margin: 0 0 24px 0; color: #1f2937; font-size: 16px; line-height: 1.5;">
                            Hi <strong>${hostName}</strong>,
                          </p>
                          <p style="margin: 0 0 24px 0; color: #1f2937; font-size: 16px; line-height: 1.5;">
                            ${hostIntroText}
                          </p>
                          
                          ${isRequest ? `
                          <!-- Urgent Action Notice -->
                          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 8px; margin: 24px 0;">
                            <tr>
                              <td style="padding: 16px;">
                                <p style="margin: 0; color: #92400e; font-size: 14px; font-weight: 600;">⏰ Time-Sensitive Request</p>
                                <p style="margin: 8px 0 0 0; color: #a16207; font-size: 13px; line-height: 1.5;">
                                  This request will automatically expire in 1 hour if no action is taken. Please respond promptly to secure the booking.
                                </p>
                              </td>
                            </tr>
                          </table>
                          ` : ''}
                          
                          <!-- Booking Details Card -->
                          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-radius: 12px; padding: 24px; margin: 24px 0;">
                            <tr>
                              <td>
                                <h2 style="margin: 0 0 16px 0; color: #6B4EFF; font-size: 18px; font-weight: 600;">${isRequest ? 'Request Details' : 'Booking Details'}</h2>
                                
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
                                          <td style="color: #1f2937; font-size: 16px; font-weight: 700;">💰 ${isRequest ? 'Potential' : 'Your'} Earnings</td>
                                          <td style="color: ${isRequest ? '#f59e0b' : '#6B4EFF'}; font-size: 20px; font-weight: 700; text-align: right;">$${totalAmount.toFixed(2)}</td>
                                        </tr>
                                        ${hostPaymentNote}
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
                                ${isRequest ? `
                                <a href="${activityUrl}" style="display: inline-block; background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 4px;">✓ Review & Approve</a>
                                ` : `
                                <a href="${hostBookingUrl}" style="display: inline-block; background: linear-gradient(135deg, #6B4EFF 0%, #5B3EEF 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">View Booking</a>
                                `}
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      
                      <!-- Footer -->
                      <tr>
                        <td style="background-color: #f8f9fa; padding: 24px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                          <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px;">
                            Best regards,<br><strong style="color: #6B4EFF;">The Parkzy Team</strong>
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
      type,
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
