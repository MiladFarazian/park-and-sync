import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BookingConfirmationRequest {
  hostEmail: string;
  hostName: string;
  driverEmail: string;
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

    // Send email to host
    const hostEmailResponse = await resend.emails.send({
      from: "Parkway <onboarding@resend.dev>",
      to: [hostEmail],
      subject: "New Booking Received!",
      html: `
        <h1>You have a new booking, ${hostName}!</h1>
        <p><strong>${driverName}</strong> has booked your parking spot.</p>
        <h2>Booking Details:</h2>
        <ul>
          <li><strong>Spot:</strong> ${spotTitle}</li>
          <li><strong>Location:</strong> ${spotAddress}</li>
          <li><strong>Start:</strong> ${startDate}</li>
          <li><strong>End:</strong> ${endDate}</li>
          <li><strong>Total:</strong> $${totalAmount.toFixed(2)}</li>
        </ul>
        <p>You can view the booking details in your Parkway dashboard.</p>
        <p>Best regards,<br>The Parkway Team</p>
      `,
    });

    console.log("Host email sent:", hostEmailResponse);

    // Send email to driver
    const driverEmailResponse = await resend.emails.send({
      from: "Parkway <onboarding@resend.dev>",
      to: [driverEmail],
      subject: "Booking Confirmed!",
      html: `
        <h1>Your booking is confirmed, ${driverName}!</h1>
        <p>You've successfully booked a parking spot.</p>
        <h2>Booking Details:</h2>
        <ul>
          <li><strong>Spot:</strong> ${spotTitle}</li>
          <li><strong>Location:</strong> ${spotAddress}</li>
          <li><strong>Start:</strong> ${startDate}</li>
          <li><strong>End:</strong> ${endDate}</li>
          <li><strong>Total:</strong> $${totalAmount.toFixed(2)}</li>
        </ul>
        <p>Your host is ${hostName}. You can view the booking details and contact them in your Parkway dashboard.</p>
        <p>Best regards,<br>The Parkway Team</p>
      `,
    });

    console.log("Driver email sent:", driverEmailResponse);

    return new Response(
      JSON.stringify({
        success: true,
        hostEmailId: hostEmailResponse.data?.id,
        driverEmailId: driverEmailResponse.data?.id,
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
