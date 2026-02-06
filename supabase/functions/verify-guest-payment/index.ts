import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { logger } from "../_shared/logger.ts";

const log = logger.scope('verify-guest-payment');

serve(async (req) => {
  // Handle CORS preflight requests
  const preflightResponse = handleCorsPreflight(req);
  if (preflightResponse) return preflightResponse;

  const corsHeaders = getCorsHeaders(req);

  try {
    const { payment_intent_id } = await req.json();
    log.debug("Request received", { payment_intent_id });

    if (!payment_intent_id) {
      return new Response(JSON.stringify({ error: "Missing payment_intent_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Initialize Stripe and get payment intent
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      log.error("Stripe key not configured");
      return new Response(JSON.stringify({ error: "Payment verification unavailable" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);
    
    log.debug("Stripe PaymentIntent retrieved", { 
      status: paymentIntent.status, 
      captureMethod: paymentIntent.capture_method
    });

    const metadata = paymentIntent.metadata;
    
    // Validate required metadata
    if (!metadata.spot_id || !metadata.guest_access_token) {
      log.error("Missing required metadata in PaymentIntent");
      return new Response(JSON.stringify({ error: "Invalid payment intent" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if booking already exists (idempotency - prevents duplicate bookings)
    const { data: existingBooking } = await supabaseAdmin
      .from("bookings")
      .select("id, status, guest_access_token")
      .eq("stripe_payment_intent_id", payment_intent_id)
      .maybeSingle();

    if (existingBooking) {
      log.info("Booking already exists for this payment", { bookingId: existingBooking.id, status: existingBooking.status });
      return new Response(JSON.stringify({
        verified: true,
        booking_id: existingBooking.id,
        guest_access_token: existingBooking.guest_access_token,
        status: existingBooking.status,
        message: "Booking already exists"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check payment status
    const isInstantBook = metadata.instant_book === 'true';
    
    // For non-instant book: requires_capture means authorized (good)
    // For instant book: succeeded means paid (good)
    const isPaymentValid = 
      paymentIntent.status === 'succeeded' || 
      paymentIntent.status === 'requires_capture';

    if (!isPaymentValid) {
      log.warn("Payment not valid", { status: paymentIntent.status });
      return new Response(JSON.stringify({
        verified: false,
        error: "Payment not completed",
        payment_status: paymentIntent.status
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Re-check availability (critical - prevents race conditions)
    log.info("Re-checking availability before creating booking");
    const { data: isAvailable, error: availError } = await supabaseAdmin.rpc('check_spot_availability', {
      p_spot_id: metadata.spot_id,
      p_start_at: metadata.start_at,
      p_end_at: metadata.end_at,
    });

    if (availError) {
      log.error("Availability check failed", { error: availError.message });
      throw new Error("Failed to verify availability");
    }

    if (!isAvailable) {
      log.warn("Spot no longer available - canceling payment");
      
      // Refund/cancel the payment
      try {
        if (paymentIntent.status === 'requires_capture') {
          await stripe.paymentIntents.cancel(payment_intent_id);
        } else if (paymentIntent.status === 'succeeded') {
          await stripe.refunds.create({ payment_intent: payment_intent_id });
        }
      } catch (refundErr) {
        log.error("Failed to refund/cancel payment", { error: (refundErr as Error).message });
      }

      return new Response(JSON.stringify({
        verified: false,
        error: "Spot is no longer available for the requested time. Your payment has been refunded.",
        refunded: true
      }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine initial status
    // For non-instant book: 'held' (awaiting host approval)
    // For instant book: 'active' (if paid) or 'pending' (shouldn't happen)
    let initialStatus: string;
    if (!isInstantBook) {
      initialStatus = 'held';
    } else {
      initialStatus = paymentIntent.status === 'succeeded' ? 'active' : 'pending';
    }

    const bookingId = crypto.randomUUID();
    const chargeId = typeof paymentIntent.latest_charge === 'string' 
      ? paymentIntent.latest_charge 
      : paymentIntent.latest_charge?.id;

    // Create the booking NOW (after payment is confirmed)
    log.info("Creating booking after payment verification", { bookingId, initialStatus });
    
    const { error: insertError } = await supabaseAdmin
      .from("bookings")
      .insert({
        id: bookingId,
        spot_id: metadata.spot_id,
        renter_id: metadata.host_id, // Use host_id as placeholder for guest bookings (required field)
        start_at: metadata.start_at,
        end_at: metadata.end_at,
        status: initialStatus,
        hourly_rate: parseFloat(metadata.hourly_rate),
        total_hours: parseFloat(metadata.total_hours),
        subtotal: parseFloat(metadata.subtotal),
        platform_fee: parseFloat(metadata.platform_fee),
        total_amount: parseFloat(metadata.total_amount),
        host_earnings: parseFloat(metadata.host_earnings),
        will_use_ev_charging: metadata.will_use_ev_charging === 'true',
        ev_charging_fee: parseFloat(metadata.ev_charging_fee || '0'),
        is_guest: true,
        guest_full_name: metadata.guest_full_name,
        guest_email: metadata.guest_email || null,
        guest_phone: metadata.guest_phone || null,
        guest_car_model: metadata.guest_car_model,
        guest_license_plate: metadata.guest_license_plate || null,
        guest_access_token: metadata.guest_access_token,
        stripe_payment_intent_id: payment_intent_id,
        stripe_charge_id: chargeId || null,
      });

    if (insertError) {
      log.error("Failed to create booking", { error: insertError.message });
      throw new Error("Failed to create booking: " + insertError.message);
    }

    log.info("Booking created successfully", { bookingId, status: initialStatus });

    // Fetch spot details for notifications
    const { data: spot } = await supabaseAdmin
      .from("spots")
      .select("id, title, address, access_notes, ev_charging_instructions, has_ev_charging, host_id")
      .eq("id", metadata.spot_id)
      .single();

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    // Handle based on booking status
    if (initialStatus === 'held') {
      // Non-instant book: Send notification to host for approval
      log.info("Sending host notification for booking request", { hostId: spot?.host_id });
      
      // Create in-app notification for host
      if (spot?.host_id) {
        await supabaseAdmin
          .from("notifications")
          .insert({
            user_id: spot.host_id,
            type: "booking_approval_required",
            title: "New Booking Request",
            message: `${metadata.guest_full_name} has requested to book ${spot.title}. You have 1 hour to respond.`,
            related_id: bookingId,
          });

        // Send push notification to host
        try {
          await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceRoleKey}`,
              'X-Internal-Secret': serviceRoleKey || '',
            },
            body: JSON.stringify({
              userId: spot.host_id,
              title: 'New Booking Request',
              body: `${metadata.guest_full_name} wants to book ${spot.title}. Respond within 1 hour.`,
              url: `/activity`,
            }),
          });
          log.debug('Push notification sent to host');
        } catch (pushError) {
          log.warn('Failed to send push notification to host', { error: (pushError as Error).message });
        }

        // Send email notifications to both guest and host for request
        try {
          await fetch(`${supabaseUrl}/functions/v1/send-guest-booking-confirmation`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({
              type: 'request',  // Indicates this is a pending request
              guestEmail: metadata.guest_email || null,
              guestPhone: metadata.guest_phone || null,
              guestName: metadata.guest_full_name,
              hostName: hostProfile?.first_name || 'Host',
              hostEmail: hostProfile?.email,
              spotTitle: spot?.title || 'Parking Spot',
              spotAddress: spot?.address || '',
              startAt: metadata.start_at,
              endAt: metadata.end_at,
              totalAmount: parseFloat(metadata.total_amount),
              hostEarnings: parseFloat(metadata.host_earnings),
              bookingId,
              guestAccessToken: metadata.guest_access_token,
            }),
          });
          log.debug('Request notification emails sent to guest and host');
        } catch (emailError) {
          log.warn('Failed to send request notification emails', { error: (emailError as Error).message });
        }
      }
    } else if (initialStatus === 'active') {
      // Instant book with payment succeeded: Credit host and send confirmations
      log.info("Payment verified, booking is active");

      // Credit host balance
      const hostEarnings = parseFloat(metadata.host_earnings);
      if (hostEarnings > 0 && spot?.host_id) {
        await supabaseAdmin.rpc("increment_balance", {
          user_id: spot.host_id,
          amount: hostEarnings
        });
        log.debug("Host balance credited", { host_id: spot.host_id, amount: hostEarnings });
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
              message: `${metadata.guest_full_name || 'A guest'} has booked ${spot.title || 'your spot'}`,
              related_id: bookingId,
            });
          log.debug("Host notification created");
        } catch (notifError) {
          log.warn("Failed to create host notification", { error: (notifError as Error).message });
        }
      }

      // Send confirmation emails
      try {
        log.info("Sending confirmation emails");
        
        await fetch(`${supabaseUrl}/functions/v1/send-guest-booking-confirmation`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            guestEmail: metadata.guest_email || null,
            guestPhone: metadata.guest_phone || null,
            guestName: metadata.guest_full_name,
            hostName: hostProfile?.first_name || 'Host',
            hostEmail: hostProfile?.email,
            spotTitle: spot?.title || 'Parking Spot',
            spotAddress: spot?.address || '',
            startAt: metadata.start_at,
            endAt: metadata.end_at,
              totalAmount: parseFloat(metadata.total_amount),
              hostEarnings: parseFloat(metadata.host_earnings),
              bookingId,
              guestAccessToken: metadata.guest_access_token,
              accessNotes: spot?.access_notes || '',
            evChargingInstructions: spot?.ev_charging_instructions || '',
            hasEvCharging: spot?.has_ev_charging || false,
            willUseEvCharging: metadata.will_use_ev_charging === 'true',
          }),
        });

        log.info("Confirmation emails sent successfully");
      } catch (emailError) {
        log.error("Error sending emails", { message: (emailError as Error).message });
      }
    }

    return new Response(JSON.stringify({
      verified: true,
      booking_id: bookingId,
      guest_access_token: metadata.guest_access_token,
      status: initialStatus,
      awaiting_approval: initialStatus === 'held',
      message: initialStatus === 'held' 
        ? "Payment authorized. Awaiting host approval."
        : "Payment verified and booking confirmed."
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    log.error("Error", { message: (error as Error).message });
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
