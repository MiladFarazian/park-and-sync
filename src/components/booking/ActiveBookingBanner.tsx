import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMode } from "@/contexts/ModeContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MessageCircle, Clock, AlertTriangle, CarFront, DollarSign, Plus, Navigation, Edit, AlertCircle, CheckCircle2, TimerReset, MapPin } from "lucide-react";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { toast } from "sonner";
import { formatDistanceToNow, addHours, format } from "date-fns";
import { ReviewModal } from "./ReviewModal";

interface HostProfile {
  user_id: string;
  first_name: string;
  last_name: string;
}

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
    host_profile?: HostProfile;
  };
  profiles: {
    first_name: string;
    last_name: string;
    avatar_url: string;
  };
}

export const ActiveBookingBanner = () => {
  const { user, profile } = useAuth();
  const { mode } = useMode();
  const navigate = useNavigate();
  const [activeBooking, setActiveBooking] = useState<ActiveBooking | null>(null);
  const [showExtendDialog, setShowExtendDialog] = useState(false);
  const [extensionHours, setExtensionHours] = useState(1);
  const [loading, setLoading] = useState(false);
  const [useNewCard, setUseNewCard] = useState(false);
  const [newPaymentMethodId, setNewPaymentMethodId] = useState<string | null>(null);
  const [setupClientSecret, setSetupClientSecret] = useState<string | null>(null);
  const [stripePublishableKey, setStripePublishableKey] = useState<string | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<any> | null>(null);
  const [confirmingDeparture, setConfirmingDeparture] = useState(false);
  const [showDepartureDialog, setShowDepartureDialog] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [hostProfile, setHostProfile] = useState<HostProfile | null>(null);
  const departureDialogShownRef = useRef<string | null>(null);
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
        },
        () => {
          loadActiveBooking();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, mode]);

  const loadActiveBooking = async () => {
    if (!user) return;

    const now = new Date().toISOString();
    
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

    // Show booking based on current mode
    if (mode === 'driver') {
      // Only show bookings where user is the renter
      const { data: renterData } = await query.eq('renter_id', user.id).maybeSingle();
      setActiveBooking(renterData as ActiveBooking);
      
      // Fetch host profile for review modal
      if (renterData) {
        const { data: hostData } = await supabase
          .from('profiles')
          .select('user_id, first_name, last_name')
          .eq('user_id', renterData.spots.host_id)
          .maybeSingle();
        setHostProfile(hostData);
      }
    } else if (mode === 'host') {
      // Only show bookings where user's spot is being rented by someone else
      const { data: hostData } = await query
        .eq('spots.host_id', user.id)
        .neq('renter_id', user.id)
        .maybeSingle();
      setActiveBooking(hostData as ActiveBooking);
    }
  };

  // Show departure dialog when booking end time passes
  useEffect(() => {
    if (!activeBooking || isHost || mode !== 'driver') return;
    
    const endTime = new Date(activeBooking.end_at);
    const now = new Date();
    
    // If already past end time and we haven't shown dialog for this booking yet
    if (now > endTime && departureDialogShownRef.current !== activeBooking.id) {
      departureDialogShownRef.current = activeBooking.id;
      setShowDepartureDialog(true);
    } else if (now <= endTime) {
      // Set a timer to show dialog when end time passes
      const timeUntilEnd = endTime.getTime() - now.getTime();
      if (timeUntilEnd > 0) {
        const timer = setTimeout(() => {
          if (departureDialogShownRef.current !== activeBooking.id) {
            departureDialogShownRef.current = activeBooking.id;
            setShowDepartureDialog(true);
          }
        }, timeUntilEnd);
        return () => clearTimeout(timer);
      }
    }
  }, [activeBooking, isHost, mode]);

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

  const handleConfirmDeparture = async (fromDialog = false) => {
    if (!activeBooking) return;

    setConfirmingDeparture(true);
    try {
      const { data, error } = await supabase.functions.invoke('confirm-departure', {
        body: { bookingId: activeBooking.id },
      });

      if (error) throw error;

      toast.success('Departure confirmed! Thank you.');
      
      // Close departure dialog if it was open
      if (fromDialog) {
        setShowDepartureDialog(false);
      }
      
      // Show review modal after confirming departure
      setShowReviewModal(true);
      
      await loadActiveBooking();
    } catch (error) {
      console.error('Error confirming departure:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to confirm departure');
    } finally {
      setConfirmingDeparture(false);
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

  const handleSendWarning = async () => {
    if (!activeBooking || !inGracePeriod) {
      toast.error('Warning can only be sent during grace period');
      return;
    }
    
    setLoading(true);

    try {
      // Send warning notification to the renter
      const { error: notifError } = await supabase
        .from('notifications')
        .insert({
          user_id: activeBooking.renter_id,
          type: 'overstay_warning',
          title: 'Grace Period Active - Please Vacate',
          message: `Your parking at ${activeBooking.spots.title} has expired and you are in the 10-minute grace period. Please vacate immediately to avoid overtime charges of $25/hour or towing.`,
          related_id: activeBooking.id,
        });

      if (notifError) throw notifError;

      toast.success('Grace period warning sent to driver');
    } catch (error) {
      console.error('Error sending warning:', error);
      toast.error('Failed to send warning');
    }

    setLoading(false);
  };

  const handleOverstayAction = async (action: 'charging' | 'towing') => {
    if (!activeBooking || !gracePeriodEnded) {
      toast.error('This action can only be taken after grace period ends');
      return;
    }
    
    setLoading(true);
    
    try {
      const { error } = await supabase
        .from('bookings')
        .update({
          overstay_action: action,
        })
        .eq('id', activeBooking.id);

      if (error) throw error;

      // Send notification to renter
      await supabase
        .from('notifications')
        .insert({
          user_id: activeBooking.renter_id,
          type: action === 'charging' ? 'overstay_charging' : 'overstay_towing',
          title: action === 'charging' ? 'Overtime Charges Applied' : 'Tow Request Initiated',
          message: action === 'charging' 
            ? `Overtime charges of $25/hour are now being applied at ${activeBooking.spots.title}. Please vacate immediately.`
            : `A tow request has been initiated for your vehicle at ${activeBooking.spots.title}. Please vacate immediately to avoid towing.`,
          related_id: activeBooking.id,
        });

      toast.success(
        action === 'charging' 
          ? 'Overtime charging activated at $25/hour. Driver notified.' 
          : 'Tow request initiated. Driver notified.'
      );
      loadActiveBooking();
    } catch (error) {
      console.error('Error updating overstay:', error);
      toast.error('Failed to update overstay status');
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

  // Check if booking is ending soon (within 15 min) or has just ended (within 15 min past)
  const canConfirmDeparture = () => {
    if (!activeBooking || isHost) return false;
    const now = new Date();
    const endTime = new Date(activeBooking.end_at);
    const fifteenMinBefore = new Date(endTime.getTime() - 15 * 60 * 1000);
    const fifteenMinAfter = new Date(endTime.getTime() + 15 * 60 * 1000);
    return now >= fifteenMinBefore && now <= fifteenMinAfter && !activeBooking.overstay_action;
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

  const now = new Date();
  const endTime = format(new Date(activeBooking.end_at), 'h:mm a');
  const endTimeDate = new Date(activeBooking.end_at);
  const timeLeftMs = endTimeDate.getTime() - now.getTime();
  const minutesLeft = Math.floor(timeLeftMs / (1000 * 60));
  const isEndingSoon = !isHost && minutesLeft > 0 && minutesLeft <= 15;
  const isActuallyOverstayed = now > endTimeDate; // Driver has exceeded their booking time
  const isOverstayed = activeBooking.overstay_detected_at !== null && isActuallyOverstayed;
  const inGracePeriod = isOverstayed && activeBooking.overstay_grace_end && new Date(activeBooking.overstay_grace_end) > now;
  const gracePeriodEnded = isOverstayed && activeBooking.overstay_grace_end && new Date(activeBooking.overstay_grace_end) <= now;
  const hasOverstayCharges = activeBooking.overstay_charge_amount > 0;

  return (
    <>
      {/* Ending Soon Notification Banner */}
      {isEndingSoon && (
        <div 
          onClick={() => setShowExtendDialog(true)}
          className="mb-2 bg-amber-500 text-white rounded-xl p-4 cursor-pointer hover:bg-amber-600 transition-colors animate-pulse-subtle shadow-lg"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold">
                  {minutesLeft} minute{minutesLeft !== 1 ? 's' : ''} left
                </p>
                <p className="text-sm text-white/90">
                  Tap here to extend your parking
                </p>
              </div>
            </div>
            <div className="bg-white/20 rounded-lg px-3 py-1.5">
              <Plus className="h-5 w-5" />
            </div>
          </div>
        </div>
      )}

      {/* Grace Period Warning Banner */}
      {inGracePeriod && !isHost && (
        <div className="mb-2 bg-destructive text-destructive-foreground rounded-xl p-4 shadow-lg animate-pulse-subtle">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="font-semibold">
                Grace Period - Leave Now!
              </p>
              <p className="text-sm opacity-90">
                You'll be charged $25/hr and may be towed if you don't leave
              </p>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="flex-1 bg-white/20 hover:bg-white/30 text-white border-0"
              onClick={() => handleConfirmDeparture()}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" />
              I've Left
            </Button>
          </div>
        </div>
      )}

      <Card 
        className="border-l-4 border-l-primary shadow-md bg-card animate-fade-in cursor-pointer hover:shadow-lg transition-shadow"
        onClick={() => navigate(`/booking/${activeBooking.id}`)}
      >
        <div className="p-3">
          <div className="flex flex-col gap-3">
            {/* Top: Info Section */}
            <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
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
            <TooltipProvider delayDuration={300}>
              <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                {!isHost && (
                  <>
                    {canConfirmDeparture() && (
                      <Button
                        size="sm"
                        onClick={() => handleConfirmDeparture()}
                        disabled={confirmingDeparture}
                        className="flex-1"
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        {confirmingDeparture ? 'Confirming...' : "I've Left"}
                      </Button>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="flex-1 hover:bg-primary/5 hover:text-primary hover:border-primary/30 transition-colors"
                          onClick={handleGetDirections}
                        >
                          <Navigation className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Directions</p>
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="flex-1 hover:bg-primary/5 hover:text-primary hover:border-primary/30 transition-colors"
                          onClick={() => navigate(`/booking/${activeBooking.id}`)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Modify</p>
                      </TooltipContent>
                    </Tooltip>

                    {!isOverstayed && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            className="flex-1 hover:bg-green-50 hover:text-green-600 hover:border-green-300 transition-colors"
                            onClick={() => setShowExtendDialog(true)}
                            disabled={loading}
                          >
                            <TimerReset className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Extend</p>
                        </TooltipContent>
                      </Tooltip>
                    )}

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="flex-1 hover:bg-primary/5 hover:text-primary hover:border-primary/30 transition-colors"
                          onClick={handleMessage}
                        >
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Message</p>
                      </TooltipContent>
                    </Tooltip>
                  </>
                )}

                {isHost && (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="flex-1 hover:bg-primary/5 hover:text-primary hover:border-primary/30 transition-colors"
                          onClick={handleMessage}
                        >
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Message</p>
                      </TooltipContent>
                    </Tooltip>

                  {/* Overstay Actions - Time-Gated Progressive System */}
                  {isOverstayed && !activeBooking.overstay_action && (
                    <>
                      {inGracePeriod && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleSendWarning}
                          disabled={loading}
                          className="border-amber-500 text-amber-600 hover:bg-amber-50 dark:border-amber-600 dark:text-amber-500 dark:hover:bg-amber-950"
                        >
                          <AlertCircle className="h-4 w-4 mr-1" />
                          Send Warning
                        </Button>
                      )}

                      {gracePeriodEnded && (
                        <>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleOverstayAction('charging')}
                            disabled={loading}
                          >
                            <DollarSign className="h-4 w-4 mr-1" />
                            Charge $25/hr
                          </Button>
                          
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOverstayAction('towing')}
                            disabled={loading}
                            className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                          >
                            <AlertTriangle className="h-4 w-4 mr-1" />
                            Request Tow
                          </Button>
                        </>
                      )}
                    </>
                  )}
                  
                  {activeBooking.overstay_action === 'charging' && activeBooking.overstay_charge_amount > 0 && (
                    <div className="text-sm font-semibold text-destructive">
                      Overtime: ${Number(activeBooking.overstay_charge_amount).toFixed(2)}
                    </div>
                  )}
                  
                  {activeBooking.overstay_action === 'towing' && (
                    <div className="text-sm font-semibold text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-4 w-4" />
                      Towing Requested
                    </div>
                  )}

                  {activeBooking.overstay_action === 'charging' && (
                    <Badge variant="destructive" className="px-3 py-1.5">
                      <DollarSign className="h-3 w-3 mr-1" />
                      Charging Active
                    </Badge>
                  )}

                  {activeBooking.overstay_action === 'towing' && (
                    <Badge variant="destructive" className="px-3 py-1.5">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Tow Requested
                    </Badge>
                  )}
                </>
              )}
              </div>
            </TooltipProvider>
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

      {/* Departure Confirmation Dialog */}
      <Dialog open={showDepartureDialog} onOpenChange={setShowDepartureDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Your parking time has ended
            </DialogTitle>
            <DialogDescription>
              Have you left the parking spot at {activeBooking?.spots.address}?
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <div className="p-4 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200 dark:border-amber-800">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                If you haven't left yet, please vacate as soon as possible to avoid overtime charges.
              </p>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setShowDepartureDialog(false)}
              className="w-full sm:w-auto"
            >
              Not yet
            </Button>
            <Button
              onClick={() => handleConfirmDeparture(true)}
              disabled={confirmingDeparture}
              className="w-full sm:w-auto"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              {confirmingDeparture ? 'Confirming...' : "Yes, I've left"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review Modal */}
      {activeBooking && hostProfile && (
        <ReviewModal
          open={showReviewModal}
          onOpenChange={setShowReviewModal}
          bookingId={activeBooking.id}
          revieweeId={hostProfile.user_id}
          revieweeName={`${hostProfile.first_name || ''} ${hostProfile.last_name || ''}`.trim() || 'Host'}
          reviewerRole="driver"
          onReviewSubmitted={() => {
            setShowReviewModal(false);
          }}
        />
      )}
    </>
  );
};
