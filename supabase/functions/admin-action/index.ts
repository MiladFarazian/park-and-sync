import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

interface AdminActionRequest {
  action: "dismiss" | "warn" | "deactivate";
  reportId: string;
  spotId: string;
  hostId: string;
  hostEmail?: string;
  spotTitle: string;
  reportReason: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user is admin
    const supabaseClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    // Check if user has admin role
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (roleError || !roleData) {
      console.log("User is not admin:", user.id);
      throw new Error("Forbidden: Admin access required");
    }

    const { action, reportId, spotId, hostId, hostEmail, spotTitle, reportReason }: AdminActionRequest = await req.json();
    console.log(`Admin action: ${action} for report ${reportId}, spot ${spotId}`);

    let newStatus = "pending";
    let notificationTitle = "";
    let notificationMessage = "";

    switch (action) {
      case "dismiss":
        newStatus = "dismissed";
        // No notification needed for dismiss
        break;

      case "warn":
        newStatus = "warned";
        notificationTitle = "Warning: Your Listing Has Been Reported";
        notificationMessage = `Your listing "${spotTitle}" has been reported for: ${reportReason}. Please review and update your listing to comply with our guidelines. Continued violations may result in listing deactivation.`;

        // Increment strikes on host profile
        const { error: strikeError } = await supabaseAdmin
          .from("profiles")
          .update({ strikes: supabaseAdmin.rpc("increment_strikes", { user_id: hostId }) })
          .eq("user_id", hostId);

        // Actually increment strikes properly
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("strikes")
          .eq("user_id", hostId)
          .single();

        await supabaseAdmin
          .from("profiles")
          .update({ strikes: (profile?.strikes || 0) + 1 })
          .eq("user_id", hostId);

        // Send email warning if email available
        if (hostEmail) {
          try {
            await resend.emails.send({
              from: "Parkzy <noreply@useparkzy.com>",
              to: [hostEmail],
              subject: "Warning: Your Parkzy Listing Has Been Reported",
              html: `
                <h1>Your Listing Has Been Reported</h1>
                <p>Your listing <strong>"${spotTitle}"</strong> has been reported by a user.</p>
                <p><strong>Reason:</strong> ${reportReason}</p>
                <p>Please review your listing and make any necessary updates to ensure it complies with Parkzy's community guidelines.</p>
                <p>Continued violations may result in your listing being deactivated.</p>
                <p>If you believe this report was made in error, please contact support.</p>
                <br>
                <p>Best regards,<br>The Parkzy Team</p>
              `,
            });
            console.log("Warning email sent to host:", hostEmail);
          } catch (emailError) {
            console.error("Failed to send warning email:", emailError);
          }
        }

        // Create in-app notification for host
        await supabaseAdmin.from("notifications").insert({
          user_id: hostId,
          type: "admin_warning",
          title: notificationTitle,
          message: notificationMessage,
          related_id: spotId,
        });
        break;

      case "deactivate":
        newStatus = "resolved";
        notificationTitle = "Listing Deactivated";
        notificationMessage = `Your listing "${spotTitle}" has been deactivated due to reports. Please contact support if you believe this was in error.`;

        // Deactivate the spot
        const { error: deactivateError } = await supabaseAdmin
          .from("spots")
          .update({ status: "inactive" })
          .eq("id", spotId);

        if (deactivateError) {
          console.error("Failed to deactivate spot:", deactivateError);
          throw new Error("Failed to deactivate spot");
        }

        // Send email notification if email available
        if (hostEmail) {
          try {
            await resend.emails.send({
              from: "Parkzy <noreply@useparkzy.com>",
              to: [hostEmail],
              subject: "Your Parkzy Listing Has Been Deactivated",
              html: `
                <h1>Listing Deactivated</h1>
                <p>Your listing <strong>"${spotTitle}"</strong> has been deactivated due to multiple reports.</p>
                <p><strong>Reason:</strong> ${reportReason}</p>
                <p>Your listing is no longer visible to drivers and cannot receive new bookings.</p>
                <p>If you believe this was done in error or would like to appeal, please contact our support team.</p>
                <br>
                <p>Best regards,<br>The Parkzy Team</p>
              `,
            });
            console.log("Deactivation email sent to host:", hostEmail);
          } catch (emailError) {
            console.error("Failed to send deactivation email:", emailError);
          }
        }

        // Create in-app notification for host
        await supabaseAdmin.from("notifications").insert({
          user_id: hostId,
          type: "spot_deactivated",
          title: notificationTitle,
          message: notificationMessage,
          related_id: spotId,
        });
        break;
    }

    // Update report status
    const { error: updateError } = await supabaseAdmin
      .from("spot_reports")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", reportId);

    if (updateError) {
      console.error("Failed to update report status:", updateError);
      throw new Error("Failed to update report status");
    }

    console.log(`Report ${reportId} updated to status: ${newStatus}`);

    return new Response(
      JSON.stringify({ success: true, newStatus }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Admin action error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: error.message.includes("Forbidden") ? 403 : 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
