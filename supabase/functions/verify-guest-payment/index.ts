import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { logger } from "../_shared/logger.ts";

const log = logger.scope('verify-guest-payment');

serve(async (req) => {
  // Handle CORS preflight requests
  const preflightResponse = handleCorsPreflight(req);
  if (preflightResponse) return preflightResponse;

  const corsHeaders = getCorsHeaders(req);

  try {
    const { booking_id, access_token } = await req.json();
    log.debug("Request received", { booking_id });

    if (!booking_id || !access_token) {
      return new Response(JSON.stringify({ error: "Missing booking_id or access_token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Fetch booking with expanded fields including spot details for email
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select(`
        id, 
        status, 
        stripe_payment_intent_id, 
        stripe_charge_id, 
        host_earnings, 
        spot_id,
        guest_full_name,
        guest_email,
        guest_phone,
        guest_access_token,
        start_at,
        end_at,
        total_amount,
        will_use_ev_charging,
        spots!inner (
          id,
          title,
          address,
          access_notes,
          ev_charging_instructions,
          has_ev_charging,
          host_id,
          instant_book
        )
      `)
      .eq("id", booking_id)
      .eq("guest_access_token", access_token)
      .eq("is_guest", true)
      .single();

    if (bookingError || !booking) {
      log.warn("Booking not found or invalid token", { bookingError });
      return new Response(JSON.stringify({ error: "Booking not found or invalid token" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const spot = booking.spots;
    const isInstantBook = spot?.instant_book !== false;
    
    log.info("Booking found", { 
      status: booking.status, 
      payment_intent: booking.stripe_payment_intent_id,
      isInstantBook 
    });

    // If already active or completed, no need to verify
    if (booking.status === "active" || booking.status === "completed") {
      log.debug("Booking already active/completed");
      return new Response(JSON.stringify({ 
        verified: true, 
        status: booking.status,
        message: "Booking already confirmed" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If canceled or refunded, can't recover
    if (booking.status === "canceled" || booking.status === "refunded") {
      log.warn("Booking is canceled/refunded");
      return new Response(JSON.stringify({ 
        verified: false, 
        status: booking.status,
        message: "Booking has been canceled" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle held bookings (non-instant book awaiting host approval)
    if (booking.status === "held") {
      log.info("Booking is held, awaiting host approval");
      return new Response(JSON.stringify({ 
        verified: true, 
        status: "held",
        awaiting_approval: true,
        message: "Your booking request is awaiting host approval" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only verify pending bookings
    if (booking.status !== "pending") {
      log.warn("Unexpected status", { status: booking.status });
      return new Response(JSON.stringify({ 
        verified: false, 
        status: booking.status 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if we have a payment intent to verify
    if (!booking.stripe_payment_intent_id) {
      log.warn("No payment intent found");
      return new Response(JSON.stringify({ 
        verified: false, 
        status: "pending",
        message: "Payment not initiated" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Initialize Stripe and check payment status
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      log.error("Stripe key not configured");
      return new Response(JSON.stringify({ error: "Payment verification unavailable" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    const paymentIntent = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id);
    
    log.debug("Stripe PaymentIntent retrieved", { 
      status: paymentIntent.status, 
      charge: paymentIntent.latest_charge,
      captureMethod: paymentIntent.capture_method
    });

    // For non-instant book spots, check if payment was authorized (requires_capture)
    // This means the guest's card was successfully held, now awaiting host approval
    if (!isInstantBook && paymentIntent.status === "requires_capture") {
      log.info("Payment authorized, updating booking to held for host approval");
      
      // Update booking status to 'held' if it's still pending
      await supabaseAdmin
        .from("bookings")
        .update({ status: "held" })
        .eq("id", booking_id)
        .eq("status", "pending");
      
      return new Response(JSON.stringify({ 
        verified: true, 
        status: "held",
        awaiting_approval: true,
        message: "Payment authorized. Awaiting host approval." 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For instant book spots or captured payments, check if payment succeeded
    if (paymentIntent.status !== "succeeded") {
      log.warn("Payment not succeeded", { stripe_status: paymentIntent.status });
      return new Response(JSON.stringify({ 
        verified: false, 
        status: "pending",
        payment_status: paymentIntent.status,
        message: "Payment not yet completed" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Payment succeeded! Update booking to active
    log.info("Payment verified, updating booking to active");

    const chargeId = typeof paymentIntent.latest_charge === 'string' 
      ? paymentIntent.latest_charge 
      : paymentIntent.latest_charge?.id;

    const { error: updateError } = await supabaseAdmin
      .from("bookings")
      .update({ 
        status: "active",
        stripe_charge_id: chargeId || booking.stripe_payment_intent_id
      })
      .eq("id", booking_id);

    if (updateError) {
      log.error("Failed to update booking", { updateError });
      return new Response(JSON.stringify({ error: "Failed to update booking status" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Credit host balance
    if (booking.host_earnings && booking.host_earnings > 0 && spot?.host_id) {
      await supabaseAdmin.rpc("increment_balance", {
        user_id: spot.host_id,
        amount: booking.host_earnings
      });
      log.debug("Host balance credited", { host_id: spot.host_id, amount: booking.host_earnings });
    }

    // Fetch host profile for email
    let hostProfile = null;
    if (spot?.host_id) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("first_name, email")
        .eq("user_id", spot.host_id)
        .single();
      hostProfile = profile;
    }

    // Send confirmation emails via send-guest-booking-confirmation
    try {
      log.info("Sending confirmation emails");
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      
      const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-guest-booking-confirmation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          guestEmail: booking.guest_email,
          guestPhone: booking.guest_phone,
          guestName: booking.guest_full_name,
          hostName: hostProfile?.first_name || 'Host',
          hostEmail: hostProfile?.email,
          spotTitle: spot?.title || 'Parking Spot',
          spotAddress: spot?.address || '',
          startAt: booking.start_at,
          endAt: booking.end_at,
          totalAmount: booking.total_amount,
          bookingId: booking.id,
          guestAccessToken: booking.guest_access_token,
          accessNotes: spot?.access_notes || '',
          evChargingInstructions: spot?.ev_charging_instructions || '',
          hasEvCharging: spot?.has_ev_charging || false,
          willUseEvCharging: booking.will_use_ev_charging || false,
        }),
      });

      if (!emailResponse.ok) {
        const errorText = await emailResponse.text();
        log.warn("Email sending failed", { status: emailResponse.status, error: errorText });
      } else {
        log.info("Confirmation emails sent successfully");
      }
    } catch (emailError) {
      // Log but don't fail - booking is already confirmed
      log.error("Error sending emails", { message: emailError.message });
    }

    // Create host notification
    if (spot?.host_id) {
      try {
        await supabaseAdmin
          .from("notifications")
          .insert({
            user_id: spot.host_id,
            type: "booking_new",
            title: "New Guest Booking",
            message: `${booking.guest_full_name || 'A guest'} has booked ${spot?.title || 'your spot'}`,
            related_id: booking.id,
          });
        log.debug("Host notification created");
      } catch (notifError) {
        log.warn("Failed to create host notification", { error: notifError.message });
      }
    }

    log.info("Booking successfully recovered and activated");

    return new Response(JSON.stringify({
      verified: true, 
      status: "active",
      message: "Payment verified and booking activated",
      recovered: true
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    log.error("Error", { message: error.message });
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
