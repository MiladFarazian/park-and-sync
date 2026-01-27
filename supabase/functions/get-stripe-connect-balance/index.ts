import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

serve(async (req) => {
  // Handle CORS preflight requests
  const preflightResponse = handleCorsPreflight(req);
  if (preflightResponse) return preflightResponse;

  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    // Get user profile with Stripe account ID
    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("stripe_account_id, stripe_account_enabled")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: "Profile not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    if (!profile.stripe_account_id || !profile.stripe_account_enabled) {
      return new Response(
        JSON.stringify({
          connected: false,
          available_balance: 0,
          pending_balance: 0,
          next_payout_date: null,
          next_payout_amount: null,
          last_payout_status: null,
          last_payout_amount: null,
          last_payout_date: null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Get balance for connected account
    const balance = await stripe.balance.retrieve({
      stripeAccount: profile.stripe_account_id,
    });

    // Calculate available and pending balances (in cents, convert to dollars)
    const availableBalance = balance.available.reduce((sum, b) => sum + b.amount, 0) / 100;
    const pendingBalance = balance.pending.reduce((sum, b) => sum + b.amount, 0) / 100;

    // Get recent payouts to determine last payout status and next payout
    const payouts = await stripe.payouts.list({
      limit: 5,
      stripeAccount: profile.stripe_account_id,
    });

    let lastPayoutStatus: string | null = null;
    let lastPayoutAmount: number | null = null;
    let lastPayoutDate: string | null = null;
    let nextPayoutDate: string | null = null;
    let nextPayoutAmount: number | null = null;

    if (payouts.data.length > 0) {
      // Find completed/failed payouts for "last payout" info
      const completedPayout = payouts.data.find(p =>
        p.status === 'paid' || p.status === 'failed' || p.status === 'canceled'
      );

      if (completedPayout) {
        lastPayoutStatus = completedPayout.status;
        lastPayoutAmount = completedPayout.amount / 100;
        lastPayoutDate = new Date(completedPayout.arrival_date * 1000).toISOString();
      }

      // Find pending/in_transit payouts for "next payout" info
      const pendingPayout = payouts.data.find(p =>
        p.status === 'pending' || p.status === 'in_transit'
      );

      if (pendingPayout) {
        nextPayoutDate = new Date(pendingPayout.arrival_date * 1000).toISOString();
        nextPayoutAmount = pendingPayout.amount / 100;
      }
    }

    // If no scheduled payout but there's a balance, estimate next payout date
    // Stripe Express accounts typically pay out on a rolling basis (2-day schedule)
    if (!nextPayoutDate && availableBalance > 0) {
      const now = new Date();
      // Add 2 business days (simplified - actual depends on account settings)
      let daysToAdd = 2;
      const dayOfWeek = now.getDay();
      if (dayOfWeek === 5) daysToAdd = 4; // Friday -> Tuesday
      if (dayOfWeek === 6) daysToAdd = 3; // Saturday -> Tuesday

      const estimatedDate = new Date(now);
      estimatedDate.setDate(estimatedDate.getDate() + daysToAdd);
      nextPayoutDate = estimatedDate.toISOString();
      nextPayoutAmount = availableBalance;
    }

    return new Response(
      JSON.stringify({
        connected: true,
        available_balance: availableBalance,
        pending_balance: pendingBalance,
        next_payout_date: nextPayoutDate,
        next_payout_amount: nextPayoutAmount,
        last_payout_status: lastPayoutStatus,
        last_payout_amount: lastPayoutAmount,
        last_payout_date: lastPayoutDate,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("Error getting Stripe Connect balance:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
