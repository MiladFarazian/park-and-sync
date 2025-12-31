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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    // Get authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !userData.user) {
      throw new Error('User not authenticated');
    }

    const user = userData.user;
    const userEmail = user.email;

    if (!userEmail) {
      throw new Error('User email is required to save payment method');
    }

    const { payment_intent_id } = await req.json();

    if (!payment_intent_id) {
      throw new Error('Payment intent ID is required');
    }

    console.log('Attaching payment method from PI:', payment_intent_id, 'to user:', userEmail);

    // Initialize Stripe
    const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecret) {
      throw new Error('Stripe secret key not configured');
    }
    const stripe = new Stripe(stripeSecret, { apiVersion: '2025-08-27.basil' });

    // Get the payment intent to find the payment method
    const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);
    
    if (!paymentIntent.payment_method) {
      console.log('No payment method on payment intent');
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'No payment method found on payment intent' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const paymentMethodId = typeof paymentIntent.payment_method === 'string' 
      ? paymentIntent.payment_method 
      : paymentIntent.payment_method.id;

    // Find or create Stripe customer for this user
    const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
    let customerId: string;

    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      console.log('Found existing customer:', customerId);
    } else {
      // Create new customer
      const firstName = user.user_metadata?.first_name || '';
      const lastName = user.user_metadata?.last_name || '';
      const fullName = `${firstName} ${lastName}`.trim() || userEmail;

      const customer = await stripe.customers.create({
        email: userEmail,
        name: fullName,
        metadata: {
          supabase_user_id: user.id,
        },
      });
      customerId = customer.id;
      console.log('Created new customer:', customerId);
    }

    // Attach the payment method to the customer
    try {
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });
      console.log('Payment method attached:', paymentMethodId);

      // Set as default payment method
      await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });
      console.log('Set as default payment method');
    } catch (attachError: any) {
      // Payment method might already be attached to another customer
      if (attachError.code === 'resource_already_exists') {
        console.log('Payment method already attached to a customer');
      } else {
        throw attachError;
      }
    }

    // Update user profile with stripe_customer_id if not set
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    await supabaseAdmin
      .from('profiles')
      .update({ stripe_customer_id: customerId })
      .eq('user_id', user.id);

    return new Response(JSON.stringify({ 
      success: true, 
      customer_id: customerId,
      payment_method_id: paymentMethodId,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Attach payment method error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
