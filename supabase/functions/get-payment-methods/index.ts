import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header provided');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Authenticate user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      throw new Error('User not authenticated');
    }

    console.log('[get-payment-methods] Processing for user:', user.id, 'auth email:', user.email);

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2025-08-27.basil',
    });

    // Fetch profile to get stripe_customer_id and profile email (for phone-auth users)
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('stripe_customer_id, email')
      .eq('user_id', user.id)
      .single();

    console.log('[get-payment-methods] Profile:', profile?.stripe_customer_id, 'profile email:', profile?.email);

    let customerId = profile?.stripe_customer_id;

    // If no customer ID in profile, try email lookup (auth email or profile email)
    const lookupEmail = user.email || profile?.email;
    if (!customerId && lookupEmail) {
      console.log('[get-payment-methods] Looking up customer by email:', lookupEmail);
      const customers = await stripe.customers.list({
        email: lookupEmail,
        limit: 1,
      });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
        console.log('[get-payment-methods] Found customer by email:', customerId);
        // Update profile with the found customer ID for future consistency
        await supabaseClient
          .from('profiles')
          .update({ stripe_customer_id: customerId })
          .eq('user_id', user.id);
      }
    }

    // If still no customer ID and no email anywhere, return empty
    if (!customerId) {
      console.log('[get-payment-methods] No customer found, returning empty');
      return new Response(
        JSON.stringify({ paymentMethods: [] }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    console.log('[get-payment-methods] Using customer:', customerId);

    // Get all payment methods for the customer
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
    });

    return new Response(
      JSON.stringify({
        paymentMethods: paymentMethods.data.map((pm) => ({
          id: pm.id,
          brand: pm.card?.brand,
          last4: pm.card?.last4,
          expMonth: pm.card?.exp_month,
          expYear: pm.card?.exp_year,
        })),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Get payment methods error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
