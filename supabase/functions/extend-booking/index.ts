import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExtendBookingRequest {
  bookingId: string;
  extensionHours: number;
  paymentMethodId?: string;
  finalize?: boolean;
  paymentIntentId?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const userSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const { data: userData, error: authError } = await userSupabase.auth.getUser();
    
    if (authError || !userData.user) {
      throw new Error('User not authenticated');
    }

    const { bookingId, extensionHours, paymentMethodId, finalize, paymentIntentId }: ExtendBookingRequest = await req.json();

    console.log('Extending booking:', { bookingId, extensionHours, userId: userData.user.id });

    // Validate extension hours
    if (!extensionHours || extensionHours < 0.25 || extensionHours > 24) {
      throw new Error('Extension must be between 15 minutes and 24 hours');
    }

    // Get booking details
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        *,
        spots!inner(
          id,
          title,
          address,
          hourly_rate,
          host_id,
          has_ev_charging,
          ev_charging_premium_per_hour
        )
      `)
      .eq('id', bookingId)
      .eq('renter_id', userData.user.id)
      .single();

    if (bookingError || !booking) {
      throw new Error('Booking not found or access denied');
    }

    // Check if booking is active
    if (booking.status !== 'active' && booking.status !== 'paid') {
      throw new Error('Only active bookings can be extended');
    }

    // Calculate new end time
    const currentEndTime = new Date(booking.end_at);
    const newEndTime = new Date(currentEndTime.getTime() + extensionHours * 60 * 60 * 1000);
    
    // Check for conflicts with other bookings (including held bookings)
    const { data: conflictingBookings, error: conflictError } = await supabase
      .from('bookings')
      .select('id, start_at')
      .eq('spot_id', booking.spot_id)
      .neq('id', bookingId)
      .in('status', ['active', 'paid', 'pending', 'held'])
      .lte('start_at', newEndTime.toISOString())
      .gte('end_at', currentEndTime.toISOString());

    if (conflictError) {
      console.error('Error checking conflicts:', conflictError);
      throw new Error('Failed to check booking availability');
    }

    // Also check booking_holds table for any active holds
    const { data: conflictingHolds, error: holdsError } = await supabase
      .from('booking_holds')
      .select('id, start_at')
      .eq('spot_id', booking.spot_id)
      .neq('user_id', userData.user.id)
      .gt('expires_at', new Date().toISOString())
      .lte('start_at', newEndTime.toISOString())
      .gte('end_at', currentEndTime.toISOString());

    if (holdsError) {
      console.error('Error checking holds:', holdsError);
    }

    const hasConflict = (conflictingBookings && conflictingBookings.length > 0) || 
                        (conflictingHolds && conflictingHolds.length > 0);

    if (hasConflict) {
      // Find the earliest conflicting start time to give a helpful message
      const conflictStartTimes = [
        ...(conflictingBookings || []).map(b => new Date(b.start_at)),
        ...(conflictingHolds || []).map(h => new Date(h.start_at))
      ].sort((a, b) => a.getTime() - b.getTime());
      
      const nextBookingStart = conflictStartTimes[0];
      const maxExtensionMinutes = Math.floor((nextBookingStart.getTime() - currentEndTime.getTime()) / (1000 * 60));
      
      if (maxExtensionMinutes <= 0) {
        throw new Error('Another guest has already booked this spot starting at your current end time. Extension is not available.');
      }
      
      const maxHours = Math.floor(maxExtensionMinutes / 60);
      const maxMins = maxExtensionMinutes % 60;
      const maxExtensionText = maxHours > 0 
        ? `${maxHours} hour${maxHours > 1 ? 's' : ''}${maxMins > 0 ? ` ${maxMins} min` : ''}`
        : `${maxMins} minutes`;
      
      throw new Error(`Another guest has booked this spot soon. You can extend by up to ${maxExtensionText}.`);
    }

    // Calculate extension cost with invisible upcharge + visible service fee + EV charging
    const hostHourlyRate = booking.spots.hourly_rate;
    const hostEarnings = hostHourlyRate * extensionHours;
    const upcharge = Math.max(hostHourlyRate * 0.20, 1.00);
    const driverHourlyRate = hostHourlyRate + upcharge;
    const driverSubtotal = Math.round(driverHourlyRate * extensionHours * 100) / 100;
    const serviceFee = Math.round(Math.max(hostEarnings * 0.20, 1.00) * 100) / 100;
    
    // Calculate EV charging fee for extension if booking has EV charging enabled
    const evChargingFeeExtension = booking.will_use_ev_charging && booking.spots.ev_charging_premium_per_hour
      ? Math.round(booking.spots.ev_charging_premium_per_hour * extensionHours * 100) / 100
      : 0;
    
    const extensionCost = Math.round((driverSubtotal + serviceFee + evChargingFeeExtension) * 100) / 100;
    
    console.log('Extension pricing:', { 
      hostHourlyRate, 
      extensionHours, 
      driverSubtotal, 
      serviceFee, 
      evChargingFeeExtension,
      extensionCost,
      willUseEvCharging: booking.will_use_ev_charging
    });

    // Initialize Stripe
    const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecret) {
      throw new Error('Stripe secret key not configured');
    }
    const stripe = new Stripe(stripeSecret, {
      apiVersion: '2025-08-27.basil',
    });

    // Get customer ID
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('user_id', userData.user.id)
      .single();

    let customerId = profile?.stripe_customer_id as string | undefined;

    // Create or get customer
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userData.user.email!,
        metadata: { supabase_user_id: userData.user.id },
      });
      customerId = customer.id;
      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('user_id', userData.user.id);
    }

    // Finalize path: called after client handles 3DS
    if (finalize && paymentIntentId) {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (pi.status !== 'succeeded') {
        throw new Error('Payment not completed');
      }

      // Update the booking with new end time and track extension charges
      const currentExtensionCharges = booking.extension_charges || 0;
      const originalTotal = booking.original_total_amount || booking.total_amount;
      
      const { error: updateError } = await supabase
        .from('bookings')
        .update({
          end_at: newEndTime.toISOString(),
          total_amount: booking.total_amount + extensionCost,
          original_total_amount: originalTotal,
          extension_charges: currentExtensionCharges + extensionCost,
          updated_at: new Date().toISOString(),
        })
        .eq('id', bookingId);
      if (updateError) {
        console.error('Error updating booking:', updateError);
        throw new Error('Payment succeeded but failed to update booking. Please contact support.');
      }

      // Credit the host
      const { error: balanceError } = await supabase.rpc('increment_balance', {
        user_id: booking.spots.host_id,
        amount: hostEarnings,
      });
      if (balanceError) console.error('Error updating host balance:', balanceError);

      // Notify the host about the extension
      const extensionMinutes = Math.round(extensionHours * 60);
      const extensionDisplay = extensionMinutes >= 60 
        ? `${Math.floor(extensionMinutes / 60)}h ${extensionMinutes % 60 > 0 ? `${extensionMinutes % 60}m` : ''}`
        : `${extensionMinutes}m`;
      
      const notificationMessage = `A driver extended their parking at ${booking.spots.address} by ${extensionDisplay.trim()}. New end time: ${newEndTime.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', hour12: true })}`;
      
      const { error: notifError } = await supabase
        .from('notifications')
        .insert({
          user_id: booking.spots.host_id,
          type: 'booking_host',
          title: 'Booking Extended',
          message: notificationMessage,
          related_id: bookingId,
        });
      if (notifError) console.error('Error creating host notification:', notifError);

      // Send push notification to host
      try {
        const pushResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({
            userId: booking.spots.host_id,
            title: 'Booking Extended',
            body: notificationMessage,
            tag: `extension-${bookingId}`,
            url: `/host-booking-confirmation/${bookingId}`,
          }),
        });
        if (!pushResponse.ok) {
          console.error('Push notification failed:', await pushResponse.text());
        }
      } catch (pushError) {
        console.error('Error sending push notification:', pushError);
      }

      // Notify driver of successful extension
      const driverMessage = `Your parking has been extended by ${extensionDisplay.trim()}. New end time: ${newEndTime.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', hour12: true })}`;
      
      try {
        const driverPushResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({
            userId: userData.user.id,
            title: 'Extension Confirmed',
            body: driverMessage,
            tag: `extension-confirmed-${bookingId}`,
            url: `/booking/${bookingId}`,
          }),
        });
        if (!driverPushResponse.ok) {
          console.error('Driver push notification failed:', await driverPushResponse.text());
        }
      } catch (pushError) {
        console.error('Error sending driver push notification:', pushError);
      }

      return new Response(JSON.stringify({
        success: true,
        message: `Booking extended by ${extensionHours} hour${extensionHours > 1 ? 's' : ''}`,
        newEndTime: newEndTime.toISOString(),
        extensionCost,
        paymentIntentId,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Resolve payment method
    let resolvedPaymentMethodId = paymentMethodId as string | undefined;

    if (resolvedPaymentMethodId) {
      try {
        const pm = await stripe.paymentMethods.retrieve(resolvedPaymentMethodId);
        if (!pm.customer) {
          await stripe.paymentMethods.attach(resolvedPaymentMethodId, { customer: customerId! });
        }
      } catch (e) {
        console.error('Provided payment method invalid or cannot be attached', e);
        throw new Error('Invalid payment method');
      }
    } else {
      // Try to reuse the original booking's payment method first
      let pmFromBooking: string | undefined;
      try {
        if (booking.stripe_payment_intent_id) {
          const originalPi = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id);
          const pmId = typeof originalPi.payment_method === 'string'
            ? originalPi.payment_method
            : originalPi.payment_method?.id;
          if (pmId) {
            try {
              const pmObj = await stripe.paymentMethods.retrieve(pmId);
              if (!pmObj.customer) {
                await stripe.paymentMethods.attach(pmId, { customer: customerId! });
              }
              pmFromBooking = pmId;
            } catch (err) {
              console.error('Failed to reuse payment method from original booking', err);
            }
          }
        }
      } catch (err) {
        console.error('Error retrieving original booking payment method', err);
      }

      if (pmFromBooking) {
        resolvedPaymentMethodId = pmFromBooking;
      } else {
        const response = await stripe.paymentMethods.list({ customer: customerId!, type: 'card' });
        if (!response.data || response.data.length === 0) {
          throw new Error('No payment method on file. Please add a payment method in your profile.');
        }
        resolvedPaymentMethodId = response.data[0].id;
      }
    }

    // Create and confirm PaymentIntent (on-session)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(extensionCost * 100),
      currency: 'usd',
      customer: customerId!,
      payment_method: resolvedPaymentMethodId,
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      description: `Parking Extension - ${booking.spots.title}`,
      metadata: {
        booking_id: bookingId,
        extension_hours: extensionHours.toString(),
        host_id: booking.spots.host_id,
        renter_id: userData.user.id,
        type: 'extension',
        new_end_time: newEndTime.toISOString(),
        host_earnings: hostEarnings.toString(),
        platform_fee: serviceFee.toString(),
      },
    });

    if (paymentIntent.status === 'requires_action') {
      return new Response(JSON.stringify({
        requiresAction: true,
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        message: 'Additional authentication required',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (paymentIntent.status !== 'succeeded') {
      throw new Error('Payment failed. Please try again or update your payment method.');
    }

    // Update booking on success and track extension charges
    const currentExtensionCharges = booking.extension_charges || 0;
    const originalTotal = booking.original_total_amount || booking.total_amount;
    
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        end_at: newEndTime.toISOString(),
        total_amount: booking.total_amount + extensionCost,
        original_total_amount: originalTotal,
        extension_charges: currentExtensionCharges + extensionCost,
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId);

    if (updateError) {
      console.error('Error updating booking:', updateError);
      throw new Error('Payment succeeded but failed to update booking. Please contact support.');
    }

    const { error: balanceError } = await supabase.rpc('increment_balance', {
      user_id: booking.spots.host_id,
      amount: hostEarnings,
    });
    if (balanceError) console.error('Error updating host balance:', balanceError);

    // Notify the host about the extension
    const extensionMinutes = Math.round(extensionHours * 60);
    const extensionDisplay = extensionMinutes >= 60 
      ? `${Math.floor(extensionMinutes / 60)}h ${extensionMinutes % 60 > 0 ? `${extensionMinutes % 60}m` : ''}`
      : `${extensionMinutes}m`;
    
    const notificationMessage = `A driver extended their parking at ${booking.spots.address} by ${extensionDisplay.trim()}. New end time: ${newEndTime.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', hour12: true })}`;
    
    const { error: notifError } = await supabase
      .from('notifications')
      .insert({
        user_id: booking.spots.host_id,
        type: 'booking_host',
        title: 'Booking Extended',
        message: notificationMessage,
        related_id: bookingId,
      });
    if (notifError) console.error('Error creating host notification:', notifError);

    // Send push notification to host
    try {
      const pushResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          userId: booking.spots.host_id,
          title: 'Booking Extended',
          body: notificationMessage,
          tag: `extension-${bookingId}`,
          url: `/host-booking-confirmation/${bookingId}`,
        }),
      });
      if (!pushResponse.ok) {
        console.error('Push notification failed:', await pushResponse.text());
      }
    } catch (pushError) {
      console.error('Error sending push notification:', pushError);
    }

    // Notify driver of successful extension
    const driverMessage = `Your parking has been extended by ${extensionDisplay.trim()}. New end time: ${newEndTime.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', hour12: true })}`;
    
    try {
      const driverPushResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          userId: userData.user.id,
          title: 'Extension Confirmed',
          body: driverMessage,
          tag: `extension-confirmed-${bookingId}`,
          url: `/booking/${bookingId}`,
        }),
      });
      if (!driverPushResponse.ok) {
        console.error('Driver push notification failed:', await driverPushResponse.text());
      }
    } catch (pushError) {
      console.error('Error sending driver push notification:', pushError);
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Booking extended by ${extensionHours} hour${extensionHours > 1 ? 's' : ''}`,
      newEndTime: newEndTime.toISOString(),
      extensionCost,
      paymentIntentId: paymentIntent.id,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Extension error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
