import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { MessageCircle, Clock, AlertTriangle, CarFront, DollarSign, Plus, Navigation } from "lucide-react";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { toast } from "sonner";
import { formatDistanceToNow, addHours, format } from "date-fns";

interface ActiveBooking {
  id: string;
  spot_id: string;
  renter_id: string;
  start_at: string;
  end_at: string;
  status: string;
  total_amount: number;
  overstay_detected_at: string | null;
  overstay_action: 'charging' | 'towing' | null;
  overstay_grace_end: string | null;
  overstay_charge_amount: number;
  spots: {
    title: string;
    address: string;
    host_id: string;
    hourly_rate: number;
  };
  profiles: {
    first_name: string;
    last_name: string;
    avatar_url: string;
  };
}

export const ActiveBookingBanner = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [activeBooking, setActiveBooking] = useState<ActiveBooking | null>(null);
  const [showOverstayDialog, setShowOverstayDialog] = useState(false);
  const [showExtendDialog, setShowExtendDialog] = useState(false);
  const [extensionHours, setExtensionHours] = useState(1);
  const [loading, setLoading] = useState(false);
  const [useNewCard, setUseNewCard] = useState(false);
  const [newPaymentMethodId, setNewPaymentMethodId] = useState<string | null>(null);
  const [setupClientSecret, setSetupClientSecret] = useState<string | null>(null);
  const [stripePublishableKey, setStripePublishableKey] = useState<string | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<any> | null>(null);
  const isHost = activeBooking && profile?.user_id === activeBooking.spots.host_id;

  useEffect(() => {
    if (!user) return;
    
    loadActiveBooking();
    
    // Set up real-time subscription
    const channel = supabase
      .channel('active-bookings')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: isHost 
            ? `spots.host_id=eq.${user.id}`
            : `renter_id=eq.${user.id}`
        },
        () => {
          loadActiveBooking();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, isHost]);

  const loadActiveBooking = async () => {
    if (!user) return;

    const now = new Date().toISOString();
    
    // Check for active bookings (currently happening) - look for active or paid status
    const query = supabase
      .from('bookings')
      .select(`
        id,
        spot_id,
        renter_id,
        start_at,
        end_at,
        status,
        total_amount,
        overstay_detected_at,
        overstay_action,
        overstay_grace_end,
        overstay_charge_amount,
        spots!inner(title, address, host_id, hourly_rate),
        profiles!bookings_renter_id_fkey(first_name, last_name, avatar_url)
      `)
      .in('status', ['active', 'paid'])
      .lte('start_at', now)
      .gte('end_at', now);

    // Check both renter and host bookings
    const { data: renterData } = await query.eq('renter_id', user.id).maybeSingle();
    if (renterData) {
      setActiveBooking(renterData as ActiveBooking);
      return;
    }

    const { data: hostData } = await query.eq('spots.host_id', user.id).maybeSingle();
    setActiveBooking(hostData as ActiveBooking);
  };

  const getStripeKey = async (): Promise<string> => {
    if (stripePublishableKey) return stripePublishableKey;
    const { data, error } = await supabase.functions.invoke('get-stripe-publishable-key');
    if (error) throw error;
    setStripePublishableKey(data.publishableKey);
    return data.publishableKey as string;
  };

  const startNewCardFlow = async () => {
    try {
      setUseNewCard(true);
      const key = await getStripeKey();
      setStripePromise(loadStripe(key));
      const { data, error } = await supabase.functions.invoke('setup-payment-method');
      if (error) throw error;
      setSetupClientSecret(data.clientSecret);
    } catch (e) {
      console.error('Failed to start card setup flow', e);
      toast.error('Unable to start card setup. Please try again.');
    }
  };
  const handleMessage = () => {
    if (!activeBooking) return;
    
    const recipientId = isHost ? activeBooking.renter_id : activeBooking.spots.host_id;
    navigate(`/messages?userId=${recipientId}`);
  };

  const handleGetDirections = () => {
    if (!activeBooking) return;
    
    const address = encodeURIComponent(activeBooking.spots.address);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${address}`, '_blank');
  };

  const handleMarkOverstay = () => {
    setShowOverstayDialog(true);
  };

  const handleOverstayAction = async (action: 'charging' | 'towing') => {
    if (!activeBooking) return;
    
    setLoading(true);
    
    const now = new Date();
    const graceEnd = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes from now

    const { error } = await supabase
      .from('bookings')
      .update({
        overstay_detected_at: now.toISOString(),
        overstay_action: action,
        overstay_grace_end: graceEnd.toISOString(),
      })
      .eq('id', activeBooking.id);

    if (error) {
      console.error('Error updating overstay:', error);
      toast.error('Failed to update overstay status');
    } else {
      toast.success(
        action === 'charging' 
          ? 'Overstay charging activated. $25/hour will apply after 10-minute grace period.' 
          : 'Towing process initiated. Driver will be notified.'
      );
      setShowOverstayDialog(false);
      loadActiveBooking();
    }
    
    setLoading(false);
  };

  const handleExtendBooking = async () => {
    if (!activeBooking) return;
    setLoading(true);

    try {
      // If user chose to add a new card, ensure it's saved first
      if (useNewCard) {
        if (!setupClientSecret) {
          await startNewCardFlow();
          setLoading(false);
          return;
        }
        if (!newPaymentMethodId) {
          toast.error('Please save your new card first.');
          setLoading(false);
          return;
        }
      }

      const body: any = {
        bookingId: activeBooking.id,
        extensionHours,
      };
      if (newPaymentMethodId) body.paymentMethodId = newPaymentMethodId;

      const { data, error } = await supabase.functions.invoke('extend-booking', { body });
      if (error) throw error;

      if (data.requiresAction && data.clientSecret && data.paymentIntentId) {
        const key = await getStripeKey();
        const stripe = await loadStripe(key);
        const result = await stripe!.confirmCardPayment(data.clientSecret);
        if (result.error) {
          throw new Error(result.error.message || 'Payment authentication failed');
        }
        // Finalize the booking update after successful authentication
        const finalize = await supabase.functions.invoke('extend-booking', {
          body: {
            bookingId: activeBooking.id,
            extensionHours,
            paymentIntentId: data.paymentIntentId,
            finalize: true,
          },
        });
        if (finalize.error) throw finalize.error;
        toast.success(finalize.data.message || 'Booking extended successfully!');
        setShowExtendDialog(false);
        setExtensionHours(1);
        setUseNewCard(false);
        setNewPaymentMethodId(null);
        loadActiveBooking();
        setLoading(false);
        return;
      }

      if (data.success) {
        toast.success(data.message || 'Booking extended successfully!');
        setShowExtendDialog(false);
        setExtensionHours(1);
        setUseNewCard(false);
        setNewPaymentMethodId(null);
        loadActiveBooking();
      } else {
        throw new Error(data.error || 'Failed to extend booking');
      }
    } catch (error: any) {
      const msg = error?.message || String(error);
      if (msg.includes('No payment method on file')) {
        await startNewCardFlow();
        toast.message('Add a card to continue', { description: 'Enter your card details below and press Save.' });
      } else {
        console.error('Error extending booking:', error);
        toast.error(msg || 'Failed to extend booking');
      }
    }

    setLoading(false);
  };

  const getNewEndTime = () => {
    if (!activeBooking) return '';
    return format(addHours(new Date(activeBooking.end_at), extensionHours), 'MMM d, h:mm a');
  };
  const getExtensionCost = () => {
    if (!activeBooking) return 0;
    return activeBooking.spots.hourly_rate * extensionHours;
  };

  const AddCardInline = () => {
    const stripe = useStripe();
    const elements = useElements();

    const onSave = async () => {
      if (!stripe || !elements || !setupClientSecret) return;
      const card = elements.getElement(CardElement);
      if (!card) return;
      const { error, setupIntent } = await stripe.confirmCardSetup(setupClientSecret, {
        payment_method: { card },
      });
      if (error) {
        toast.error(error.message || 'Failed to save card');
        return;
      }
      const pmId = setupIntent?.payment_method as string | undefined;
      if (pmId) {
        setNewPaymentMethodId(pmId);
        toast.success('Card saved. You can now confirm the extension.');
      }
    };

    return (
      <div className="space-y-3 border rounded-lg p-3">
        <Label>New card</Label>
        <div className="rounded-md border p-3 bg-background">
          <CardElement options={{ hidePostalCode: true }} />
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={onSave} disabled={loading || !setupClientSecret}>
            {loading ? 'Saving...' : 'Save Card'}
          </Button>
        </div>
      </div>
    );
  };
  if (!activeBooking) return null;

  const endTime = format(new Date(activeBooking.end_at), 'h:mm a');
  const isOverstayed = new Date() > new Date(activeBooking.end_at);
  const hasOverstayCharges = activeBooking.overstay_charge_amount > 0;

  return (
    <>
      <Card className="border-l-4 border-l-primary shadow-md bg-card animate-fade-in">
        <div className="p-3">
          <div className="flex flex-col gap-3">
            {/* Top: Info Section */}
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <CarFront className="h-5 w-5 text-primary" />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="font-semibold text-sm truncate">
                    {activeBooking.spots.title}
                  </h3>
                  {isOverstayed && !activeBooking.overstay_action && (
                    <Badge variant="destructive" className="text-xs flex-shrink-0">Overstayed</Badge>
                  )}
                  {activeBooking.overstay_action === 'charging' && (
                    <Badge variant="destructive" className="text-xs flex-shrink-0">Charging</Badge>
                  )}
                </div>
                
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Clock className="h-3 w-3" />
                    <span className="font-medium whitespace-nowrap">
                      {isOverstayed ? `Ended at ${endTime}` : `Ends at ${endTime}`}
                    </span>
                  </div>
                  {isHost && (
                    <>
                      <span className="opacity-60 flex-shrink-0">•</span>
                      <span className="truncate min-w-0">Driver: {activeBooking.profiles.first_name} {activeBooking.profiles.last_name}</span>
                    </>
                  )}
                </div>
              </div>
              
              {hasOverstayCharges && (
                <div className="px-3 py-1 bg-destructive/10 rounded-md flex-shrink-0">
                  <p className="text-sm font-semibold text-destructive">
                    +${activeBooking.overstay_charge_amount.toFixed(2)}
                  </p>
                </div>
              )}
            </div>

            {/* Bottom: Action Buttons */}
            <div className="flex items-center gap-2 justify-end">
              {!isHost && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleMessage}
                  >
                    <MessageCircle className="h-4 w-4" />
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGetDirections}
                  >
                    <Navigation className="h-4 w-4" />
                  </Button>

                  {!isOverstayed && (
                    <Button
                      size="sm"
                      onClick={() => setShowExtendDialog(true)}
                      disabled={loading}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Extend
                    </Button>
                  )}
                </>
              )}

              {isHost && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleMessage}
                  >
                    <MessageCircle className="h-4 w-4" />
                  </Button>

                  {!activeBooking.overstay_action && isOverstayed && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleMarkOverstay}
                    >
                      <AlertTriangle className="h-4 w-4 mr-1" />
                      Mark Overstay
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Extend Booking Dialog */}
      <Dialog open={showExtendDialog} onOpenChange={setShowExtendDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Extend Your Parking</DialogTitle>
            <DialogDescription>
              Choose how much time to add to your booking
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((hours) => (
                <Button
                  key={hours}
                  variant={extensionHours === hours ? "default" : "outline"}
                  onClick={() => setExtensionHours(hours)}
                  className="h-20 flex flex-col gap-1"
                >
                  <span className="text-3xl font-bold">{hours}</span>
                  <span className="text-xs opacity-80">hr{hours > 1 ? 's' : ''}</span>
                </Button>
              ))}
            </div>

            <div className="space-y-2 p-4 bg-muted/50 rounded-lg border">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Current end</span>
                <span className="text-sm font-medium">
                  {format(new Date(activeBooking?.end_at || ''), 'h:mm a')}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">New end</span>
                <span className="text-sm font-semibold text-primary">
                  {getNewEndTime()}
                </span>
              </div>
              <div className="pt-2 mt-2 border-t flex justify-between items-center">
                <span className="font-semibold">Total cost</span>
                <span className="text-2xl font-bold text-primary">
                  ${getExtensionCost().toFixed(2)}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Payment method</Label>
                {!useNewCard && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={startNewCardFlow}
                    className="h-auto py-1 px-2 text-xs"
                  >
                    Change card
                  </Button>
                )}
              </div>
              
              {!useNewCard && (
                <div className="p-3 bg-muted/50 rounded-md border">
                  <p className="text-sm text-muted-foreground">Using same card from booking</p>
                </div>
              )}

              {useNewCard && stripePromise && setupClientSecret && (
                <Elements stripe={stripePromise} options={{ clientSecret: setupClientSecret }}>
                  <AddCardInline />
                </Elements>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowExtendDialog(false);
              setUseNewCard(false);
              setNewPaymentMethodId(null);
            }}>
              Cancel
            </Button>
            <Button onClick={handleExtendBooking} disabled={loading}>
              {loading ? 'Processing...' : 'Confirm Extension'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showOverstayDialog} onOpenChange={setShowOverstayDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Driver Overstayed Booking</AlertDialogTitle>
            <AlertDialogDescription>
              The driver has exceeded their booking time. Choose how you'd like to proceed:
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-4 my-4">
            <div className="p-4 border rounded-lg">
              <h4 className="font-semibold mb-2">Charge Premium Rate</h4>
              <p className="text-sm text-muted-foreground">
                Charge $25/hour for overstay time after a 10-minute grace period. 
                The driver will be automatically charged.
              </p>
            </div>
            
            <div className="p-4 border rounded-lg">
              <h4 className="font-semibold mb-2">Request Towing</h4>
              <p className="text-sm text-muted-foreground">
                Initiate towing process. The driver will be notified and 
                premium charging will not apply.
              </p>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="default"
              onClick={() => handleOverstayAction('charging')}
              disabled={loading}
            >
              Charge Premium
            </Button>
            <AlertDialogAction
              onClick={() => handleOverstayAction('towing')}
              disabled={loading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Request Towing
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
