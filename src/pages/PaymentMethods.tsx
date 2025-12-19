import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, CreditCard, Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Elements, CardElement, PaymentRequestButtonElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { loadStripe, PaymentRequest } from "@stripe/stripe-js";
import RequireAuth from "@/components/auth/RequireAuth";

let stripePromise: Promise<any> | null = null;

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

const WalletPaymentButton = ({ onSuccess }: { onSuccess: () => void }) => {
  const stripe = useStripe();
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null);
  const [canMakePayment, setCanMakePayment] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!stripe) return;

    const pr = stripe.paymentRequest({
      country: 'US',
      currency: 'usd',
      total: {
        label: 'Add payment method',
        amount: 0, // $0 for setup
      },
      requestPayerName: true,
      requestPayerEmail: true,
    });

    pr.canMakePayment().then(result => {
      if (result) {
        setPaymentRequest(pr);
        setCanMakePayment(true);
      }
    });

    pr.on('paymentmethod', async (ev) => {
      try {
        // Get setup intent
        const { data, error } = await supabase.functions.invoke('setup-payment-method');
        if (error) throw error;

        const { error: confirmError } = await stripe.confirmCardSetup(
          data.clientSecret,
          { payment_method: ev.paymentMethod.id },
          { handleActions: false }
        );

        if (confirmError) {
          ev.complete('fail');
          throw confirmError;
        }

        ev.complete('success');
        toast({
          title: "Success",
          description: "Payment method added successfully",
        });
        onSuccess();
      } catch (error: any) {
        ev.complete('fail');
        toast({
          title: "Error",
          description: error.message || "Failed to add payment method",
          variant: "destructive",
        });
      }
    });
  }, [stripe, onSuccess, toast]);

  if (!canMakePayment || !paymentRequest) return null;

  return (
    <div className="space-y-3">
      <PaymentRequestButtonElement
        options={{
          paymentRequest,
          style: {
            paymentRequestButton: {
              type: 'default',
              theme: 'dark',
              height: '44px',
            },
          },
        }}
      />
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">Or pay with card</span>
        </div>
      </div>
    </div>
  );
};

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
    <div className="space-y-4">
      <WalletPaymentButton onSuccess={onSuccess} />
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
    </div>
  );
};

const PaymentMethodsContent = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddCard, setShowAddCard] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [autoOpenHandled, setAutoOpenHandled] = useState(false);

  const handleBack = () => {
    const returnTo = searchParams.get('returnTo');
    if (returnTo && returnTo.startsWith('/')) {
      navigate(returnTo);
      return;
    }
    // Check if we have history to go back to
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      // Fallback to profile if no history
      navigate('/profile');
    }
  };

  const fetchPaymentMethods = async () => {
    try {
      setLoading(true);
      
      // Check if user has email
      const { data: { user } } = await supabase.auth.getUser();
      setUserEmail(user?.email || null);
      
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

  const handleAddCardClick = () => {
    if (!userEmail) {
      toast({
        title: "Email required",
        description: "Please add an email address to your account first to add payment methods",
      });
      navigate('/manage-account');
      return;
    }
    setShowAddCard(true);
  };

  useEffect(() => {
    if (autoOpenHandled) return;
    if (loading) return;

    const shouldAutoOpen = searchParams.get('add') === '1';
    if (!shouldAutoOpen) return;

    setAutoOpenHandled(true);
    handleAddCardClick();
  }, [autoOpenHandled, loading, searchParams, userEmail]);

  const handleAddSuccess = () => {
    setShowAddCard(false);
    fetchPaymentMethods();
  };

  const handleDeletePaymentMethod = async (paymentMethodId: string) => {
    try {
      setDeletingId(paymentMethodId);
      const { data, error } = await supabase.functions.invoke('delete-payment-method', {
        body: { paymentMethodId }
      });
      
      if (error) throw error;

      toast({
        title: "Success",
        description: "Payment method removed successfully",
      });
      
      fetchPaymentMethods();
    } catch (error: any) {
      console.error('Error deleting payment method:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to remove payment method",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const CardBrandLogo = ({ brand }: { brand: string }) => {
    const brandLower = brand.toLowerCase();
    
    if (brandLower === 'visa') {
      return (
        <svg viewBox="0 0 48 32" className="h-8 w-12">
          <rect width="48" height="32" rx="4" fill="#1A1F71"/>
          <path d="M19.5 21H17L18.9 11H21.4L19.5 21ZM15.3 11L12.9 18L12.6 16.5L11.8 12C11.8 12 11.7 11 10.4 11H6.1L6 11.2C6 11.2 7.5 11.5 9.2 12.5L11.4 21H14L17.8 11H15.3ZM35.4 21H37.5L35.7 11H33.6C32.5 11 32.2 11.8 32.2 11.8L28.3 21H30.9L31.4 19.5H34.6L34.9 21H35.4ZM32.1 17.5L33.5 13.5L34.3 17.5H32.1ZM28.5 13.5L28.8 11.8C28.8 11.8 27.5 11.3 26.1 11.3C24.6 11.3 21.3 12 21.3 14.8C21.3 17.4 24.8 17.4 24.8 18.8C24.8 20.2 21.7 19.8 20.5 18.9L20.1 20.7C20.1 20.7 21.4 21.3 23.3 21.3C25.2 21.3 28 20.2 28 17.6C28 14.9 24.5 14.7 24.5 13.5C24.5 12.3 26.9 12.5 28.5 13.5Z" fill="white"/>
        </svg>
      );
    }
    
    if (brandLower === 'mastercard') {
      return (
        <svg viewBox="0 0 48 32" className="h-8 w-12">
          <rect width="48" height="32" rx="4" fill="#000"/>
          <circle cx="19" cy="16" r="9" fill="#EB001B"/>
          <circle cx="29" cy="16" r="9" fill="#F79E1B"/>
          <path d="M24 9.5C26.1 11.1 27.5 13.4 27.5 16C27.5 18.6 26.1 20.9 24 22.5C21.9 20.9 20.5 18.6 20.5 16C20.5 13.4 21.9 11.1 24 9.5Z" fill="#FF5F00"/>
        </svg>
      );
    }
    
    if (brandLower === 'amex' || brandLower === 'american express') {
      return (
        <svg viewBox="0 0 48 32" className="h-8 w-12">
          <rect width="48" height="32" rx="4" fill="#006FCF"/>
          <path d="M8 16L10 12H12.5L14.5 16L16.5 12H19L15 20H12.5L10.5 16L8.5 20H6L8 16Z" fill="white"/>
          <path d="M20 12H28V14H22V15H27.5V17H22V18H28V20H20V12Z" fill="white"/>
          <path d="M29 12H32L34 15L36 12H39L35.5 16L39 20H36L34 17L32 20H29L32.5 16L29 12Z" fill="white"/>
        </svg>
      );
    }
    
    if (brandLower === 'discover') {
      return (
        <svg viewBox="0 0 48 32" className="h-8 w-12">
          <rect width="48" height="32" rx="4" fill="#FF6600"/>
          <circle cx="30" cy="16" r="8" fill="#FFF"/>
          <path d="M8 14H12C13.7 14 15 15.3 15 17C15 18.7 13.7 20 12 20H8V14Z" fill="white"/>
        </svg>
      );
    }
    
    // Default fallback
    return <CreditCard className="h-8 w-8 text-muted-foreground" />;
  };

  return (
    <div className="bg-background">
      <div className="container max-w-2xl mx-auto p-4 space-y-6">
        <div className="flex items-center gap-3 relative z-10">
          <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0 pointer-events-auto">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold truncate">Payment Methods</h1>
            <p className="text-sm text-muted-foreground">Manage your cards and billing</p>
          </div>
          <Button onClick={handleAddCardClick} size="sm" className="shrink-0">
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Add Card</span>
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
            <Button onClick={handleAddCardClick}>
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
                    <CardBrandLogo brand={pm.brand} />
                    <div>
                      <p className="font-semibold capitalize">
                        {pm.brand} •••• {pm.last4}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Expires {pm.expMonth}/{pm.expYear}
                      </p>
                    </div>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        disabled={deletingId === pm.id}
                      >
                        {deletingId === pm.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove payment method?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will remove your {pm.brand} card ending in {pm.last4} from your account.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={() => handleDeletePaymentMethod(pm.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Remove
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
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

const PaymentMethods = () => {
  return (
    <RequireAuth feature="payments">
      <PaymentMethodsContent />
    </RequireAuth>
  );
};

export default PaymentMethods;
