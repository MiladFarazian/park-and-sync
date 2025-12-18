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
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ connected: false, charges_enabled: false, details_submitted: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ connected: false, charges_enabled: false, details_submitted: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("stripe_account_id, stripe_account_enabled")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile) {
      throw new Error("Profile not found");
    }

    if (!profile.stripe_account_id) {
      return new Response(
        JSON.stringify({ 
          connected: false, 
          charges_enabled: false,
          details_submitted: false 
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Check Stripe account status
    let account;
    try {
      account = await stripe.accounts.retrieve(profile.stripe_account_id);
    } catch (stripeError: any) {
      // Handle case where the Stripe Connect account was deleted/revoked
      if (stripeError.code === 'account_invalid' || stripeError.statusCode === 403) {
        console.log(`Stripe account ${profile.stripe_account_id} is invalid or revoked. Clearing from profile.`);
        
        // Clear the invalid Stripe account from the user's profile
        await supabaseClient
          .from("profiles")
          .update({ 
            stripe_account_id: null, 
            stripe_account_enabled: false 
          })
          .eq("user_id", user.id);

        return new Response(
          JSON.stringify({ 
            connected: false, 
            charges_enabled: false,
            details_submitted: false 
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          }
        );
      }
      throw stripeError;
    }

    const charges_enabled = account.charges_enabled || false;
    const details_submitted = account.details_submitted || false;

    // Update profile if status changed
    if (profile.stripe_account_enabled !== charges_enabled) {
      await supabaseClient
        .from("profiles")
        .update({ stripe_account_enabled: charges_enabled })
        .eq("user_id", user.id);
    }

    return new Response(
      JSON.stringify({ 
        connected: true,
        charges_enabled,
        details_submitted,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error checking Stripe Connect status:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
