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

    console.log('[setup-payment-method] Processing for user:', user.id, 'auth email:', user.email, 'phone:', user.phone);

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2025-08-27.basil',
    });

    let customerId: string | undefined;

    // Fetch profile to get stripe_customer_id and profile email/name (for phone-auth users)
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('stripe_customer_id, email, first_name, last_name')
      .eq('user_id', user.id)
      .single();

    // Use profile email if auth email is not available (phone-auth users)
    const customerEmail = user.email || profile?.email;
    const customerName = profile?.first_name 
      ? `${profile.first_name} ${profile.last_name || ''}`.trim()
      : (user.email || user.phone);

    console.log('[setup-payment-method] Customer email:', customerEmail, 'name:', customerName);

    if (profile?.stripe_customer_id) {
      // Verify the customer still exists in Stripe
      try {
        await stripe.customers.retrieve(profile.stripe_customer_id);
        customerId = profile.stripe_customer_id;
        console.log('[setup-payment-method] Found existing customer from profile:', customerId);
      } catch (err: any) {
        if (err.code === 'resource_missing') {
          console.log('[setup-payment-method] Customer in profile no longer exists in Stripe');
        } else {
          throw err;
        }
      }
    }

    // Try to find existing customer by email if not found in profile
    if (!customerId && customerEmail) {
      const customers = await stripe.customers.list({
        email: customerEmail,
        limit: 1,
      });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
        console.log('[setup-payment-method] Found existing customer by email:', customerId);
      }
    }

    // If no customer found by email, search by user_id in metadata
    if (!customerId) {
      try {
        const searchResult = await stripe.customers.search({
          query: `metadata['supabase_user_id']:'${user.id}'`,
        });
        if (searchResult.data.length > 0) {
          customerId = searchResult.data[0].id;
          console.log('[setup-payment-method] Found existing customer by metadata:', customerId);
        }
      } catch (searchError) {
        console.log('[setup-payment-method] Customer search failed, will create new:', searchError);
      }
    }

    // Create new customer if none found
    if (!customerId) {
      console.log('[setup-payment-method] Creating new customer with email:', customerEmail, 'name:', customerName);
      const customer = await stripe.customers.create({
        email: customerEmail || undefined,
        phone: user.phone || undefined,
        name: customerName || undefined,
        metadata: {
          supabase_user_id: user.id,
        },
      });
      customerId = customer.id;
      console.log('[setup-payment-method] Created new customer:', customerId);
    }

    // Always update the profile with the stripe_customer_id to ensure consistency
    const { error: updateError } = await supabaseClient
      .from('profiles')
      .update({ stripe_customer_id: customerId })
      .eq('user_id', user.id);
    
    if (updateError) {
      console.error('[setup-payment-method] Failed to update profile with customer ID:', updateError);
      // Don't throw - continue with setup intent creation
    } else {
      console.log('[setup-payment-method] Updated profile with stripe_customer_id:', customerId);
    }

    // Create setup intent for adding payment method
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
    });

    return new Response(
      JSON.stringify({
        clientSecret: setupIntent.client_secret,
        customerId,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Setup payment method error:', error);
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
