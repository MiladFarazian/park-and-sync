import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export default function EmbeddedCheckoutPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [stripePromise, setStripePromise] = useState<Promise<any> | null>(null);
  const [clientSecret, setClientSecret] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeCheckout = async () => {
      try {
        // Get Stripe publishable key
        const { data: keyData, error: keyError } = await supabase.functions.invoke(
          'get-stripe-publishable-key'
        );

        if (keyError) throw keyError;

        setStripePromise(loadStripe(keyData.publishableKey));

        // Get the booking details to retrieve the client secret
        const { data: booking, error: bookingError } = await supabase
          .from('bookings')
          .select('stripe_payment_intent_id')
          .eq('id', bookingId)
          .single();

        if (bookingError) throw bookingError;

        if (!booking?.stripe_payment_intent_id) {
          throw new Error('No checkout session found for this booking');
        }

        // The stripe_payment_intent_id actually contains the checkout session ID
        // We need to get the client secret from it
        // Since we already have it from create-booking, we'll fetch it from session storage or state
        const storedClientSecret = sessionStorage.getItem(`checkout_${bookingId}`);
        
        if (storedClientSecret) {
          setClientSecret(storedClientSecret);
        } else {
          throw new Error('Checkout session expired. Please try booking again.');
        }

        setLoading(false);
      } catch (error) {
        console.error('Error initializing checkout:', error);
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to initialize checkout",
          variant: "destructive",
        });
        navigate('/explore');
      }
    };

    if (bookingId) {
      initializeCheckout();
    }
  }, [bookingId, navigate, toast]);

  if (loading || !clientSecret || !stripePromise) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="p-8 text-center max-w-md w-full">
          <Loader2 className="h-16 w-16 animate-spin text-primary mx-auto mb-4" />
          <h2 className="text-2xl font-semibold mb-2">Loading Checkout</h2>
          <p className="text-muted-foreground">
            Please wait while we prepare your secure payment form...
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Complete Your Booking</h1>
          <p className="text-muted-foreground">
            Enter your payment details to confirm your parking reservation
          </p>
        </div>
        
        <div id="checkout">
          <EmbeddedCheckoutProvider
            stripe={stripePromise}
            options={{ clientSecret }}
          >
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        </div>
      </div>
    </div>
  );
}
