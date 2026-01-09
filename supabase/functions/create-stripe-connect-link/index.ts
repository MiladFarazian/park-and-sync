import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const parts = authHeader?.trim().split(/\s+/) ?? [];
    const token = parts.length >= 2 ? parts[1] : undefined;

    console.log("[create-stripe-connect-link] auth header present:", !!authHeader);
    console.log("[create-stripe-connect-link] token present:", !!token);
    if (token) console.log("[create-stripe-connect-link] token prefix:", token.slice(0, 16));

    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";

    // Validate token by asking Supabase Auth (do NOT try to JWKS-verify: projects using HS256 have empty JWKS)
    const supabaseAuth = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { auth: { persistSession: false }, global: { headers: { Authorization: authHeader! } } }
    );

    console.log("[create-stripe-connect-link] validating token via supabaseAuth.auth.getUser(token)");
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser(token);
    const user = userData?.user;

    if (userError || !user) {
      console.error("[create-stripe-connect-link] Invalid token:", userError);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile) {
      console.error("[create-stripe-connect-link] Profile not found:", profileError?.message);
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
    if (!stripeKey) {
      return new Response(JSON.stringify({ error: "Stripe not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    let accountId = (profile.stripe_account_id as string | null) ?? null;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: profile.email ?? undefined,
        capabilities: {
          transfers: { requested: true },
        },
        business_type: "individual",
      });

      accountId = account.id;

      await supabaseAdmin
        .from("profiles")
        .update({ stripe_account_id: accountId })
        .eq("user_id", user.id);
    }

    const origin = req.headers.get("origin") || "http://localhost:5173";

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/profile`,
      return_url: `${origin}/profile`,
      type: "account_onboarding",
    });

    return new Response(JSON.stringify({ url: accountLink.url }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[create-stripe-connect-link] Error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
