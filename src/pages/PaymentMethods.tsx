import { useNavigate } from "react-router-dom";
import { ArrowLeft, CreditCard, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";

let stripePromise: Promise<any> | null = null;

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

const AddCardForm = ({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);
    try {
      // Get setup intent
      const { data, error } = await supabase.functions.invoke('setup-payment-method');
      
      if (error) throw error;

      const { clientSecret } = data;
      const cardElement = elements.getElement(CardElement);

      if (!cardElement) throw new Error('Card element not found');

      // Confirm card setup
      const { error: confirmError } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: {
          card: cardElement,
        },
      });

      if (confirmError) throw confirmError;

      toast({
        title: "Success",
        description: "Payment method added successfully",
      });
      
      onSuccess();
    } catch (error: any) {
      console.error('Error adding card:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to add payment method",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-4 border rounded-lg">
        <CardElement
          options={{
            style: {
              base: {
                fontSize: '16px',
                color: 'hsl(var(--foreground))',
                '::placeholder': {
                  color: 'hsl(var(--muted-foreground))',
                },
              },
            },
          }}
        />
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
        <Button type="submit" disabled={!stripe || loading} className="flex-1">
          {loading ? "Adding..." : "Add Card"}
        </Button>
      </div>
    </form>
  );
};

const PaymentMethods = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddCard, setShowAddCard] = useState(false);

  const fetchPaymentMethods = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('get-payment-methods');
      
      if (error) throw error;

      setPaymentMethods(data.paymentMethods || []);
    } catch (error: any) {
      console.error('Error fetching payment methods:', error);
      toast({
        title: "Error",
        description: "Failed to load payment methods",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStripePromise = async () => {
    if (!stripePromise) {
      try {
        const { data } = await supabase.functions.invoke('get-stripe-publishable-key');
        stripePromise = loadStripe(data.publishableKey);
      } catch (error) {
        console.error('Failed to get publishable key:', error);
        throw error;
      }
    }
    return stripePromise;
  };

  useEffect(() => {
    fetchPaymentMethods();
  }, []);

  const handleAddSuccess = () => {
    setShowAddCard(false);
    fetchPaymentMethods();
  };

  const getCardBrandColor = (brand: string) => {
    switch (brand.toLowerCase()) {
      case 'visa':
        return 'text-blue-600';
      case 'mastercard':
        return 'text-red-600';
      case 'amex':
        return 'text-blue-500';
      default:
        return 'text-foreground';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-2xl mx-auto p-4 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Payment Methods</h1>
            <p className="text-muted-foreground">Manage your cards and billing</p>
          </div>
          <Button onClick={() => setShowAddCard(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Card
          </Button>
        </div>

        {loading ? (
          <Card className="p-12 text-center">
            <p className="text-muted-foreground">Loading payment methods...</p>
          </Card>
        ) : paymentMethods.length === 0 ? (
          <Card className="p-12 text-center">
            <CreditCard className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No payment methods</h3>
            <p className="text-muted-foreground mb-4">
              Add a payment method to complete bookings
            </p>
            <Button onClick={() => setShowAddCard(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Payment Method
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {paymentMethods.map((pm) => (
              <Card key={pm.id} className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <CreditCard className={`h-8 w-8 ${getCardBrandColor(pm.brand)}`} />
                    <div>
                      <p className="font-semibold capitalize">
                        {pm.brand} •••• {pm.last4}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Expires {pm.expMonth}/{pm.expYear}
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={showAddCard} onOpenChange={setShowAddCard}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Payment Method</DialogTitle>
            </DialogHeader>
            <Elements stripe={getStripePromise()}>
              <AddCardForm 
                onSuccess={handleAddSuccess} 
                onCancel={() => setShowAddCard(false)}
              />
            </Elements>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default PaymentMethods;
