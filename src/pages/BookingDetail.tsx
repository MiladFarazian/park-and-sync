import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MobileTimePicker } from '@/components/booking/MobileTimePicker';
import { ArrowLeft, MapPin, Clock, Calendar, DollarSign, AlertCircle, Navigation, MessageCircle, XCircle, Loader2, Plus } from 'lucide-react';
import { format, differenceInMinutes } from 'date-fns';
import { toast } from 'sonner';
import { loadStripe } from '@stripe/stripe-js';

interface BookingDetails {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  total_amount: number;
  subtotal: number;
  platform_fee: number;
  hourly_rate: number;
  total_hours: number;
  created_at: string;
  overstay_charge_amount: number;
  overstay_detected_at: string | null;
  overstay_grace_end: string | null;
  overstay_action: string | null;
  cancellation_reason: string | null;
  renter_id: string;
  spots: {
    id: string;
    title: string;
    address: string;
    host_id: string;
  };
  profiles: {
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  };
}

const BookingDetail = () => {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [booking, setBooking] = useState<BookingDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showExtendDialog, setShowExtendDialog] = useState(false);
  const [showExtendTimePicker, setShowExtendTimePicker] = useState(false);
  const [newEndTime, setNewEndTime] = useState<Date | null>(null);
  const [extending, setExtending] = useState(false);
  const [cancellingTow, setCancellingTow] = useState(false);

  useEffect(() => {
    if (!bookingId || !user) return;
    loadBookingDetails();
  }, [bookingId, user]);

  const loadBookingDetails = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id,
          start_at,
          end_at,
          status,
          total_amount,
          subtotal,
          platform_fee,
          hourly_rate,
          total_hours,
          created_at,
          overstay_charge_amount,
          overstay_detected_at,
          overstay_grace_end,
          overstay_action,
          renter_id,
          cancellation_reason,
          spots!inner(id, title, address, host_id),
          profiles!bookings_renter_id_fkey(first_name, last_name, avatar_url)
        `)
        .eq('id', bookingId)
        .single();

      if (error) throw error;

      // Check if user has access to this booking
      if (data.spots.host_id !== user?.id && data.profiles) {
        // User must be the renter - verify via another check if needed
      }

      setBooking(data as unknown as BookingDetails);
    } catch (error) {
      console.error('Error loading booking:', error);
      toast.error('Failed to load booking details');
      navigate('/activity');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!booking) return;

    setCancelling(true);
    try {
      const { error } = await supabase.functions.invoke('cancel-booking', {
        body: { bookingId: booking.id }
      });

      if (error) throw error;

      toast.success('Booking cancelled successfully');
      setShowCancelDialog(false);
      navigate('/activity');
    } catch (error: any) {
      console.error('Error cancelling booking:', error);
      toast.error(error.message || 'Failed to cancel booking');
    } finally {
      setCancelling(false);
    }
  };

  const handleGetDirections = () => {
    if (!booking) return;
    const address = encodeURIComponent(booking.spots.address);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${address}`, '_blank');
  };

  const handleMessage = () => {
    if (!booking) return;
    const otherUserId = user?.id === booking.spots.host_id ? booking.renter_id : booking.spots.host_id;
    navigate(`/messages?userId=${otherUserId}`);
  };

  const handleCancelTowRequest = async () => {
    if (!booking) return;

    setCancellingTow(true);
    try {
      const { error } = await supabase.functions.invoke('cancel-tow-request', {
        body: { bookingId: booking.id }
      });

      if (error) throw error;

      toast.success('Tow request cancelled successfully');
      loadBookingDetails(); // Reload to show updated status
    } catch (error: any) {
      console.error('Error cancelling tow request:', error);
      toast.error(error.message || 'Failed to cancel tow request');
    } finally {
      setCancellingTow(false);
    }
  };

  const handleExtendBooking = async () => {
    if (!booking || !newEndTime) return;

    // Calculate extension hours from the new end time
    const extensionMinutes = differenceInMinutes(newEndTime, new Date(booking.end_at));
    const extensionHours = extensionMinutes / 60;

    if (extensionHours < 0.25) {
      toast.error('Extension must be at least 15 minutes');
      return;
    }

    if (extensionHours > 24) {
      toast.error('Extension cannot exceed 24 hours');
      return;
    }

    setExtending(true);
    try {
      // Get Stripe publishable key
      const { data: keyData, error: keyError } = await supabase.functions.invoke('get-stripe-publishable-key');
      if (keyError) throw keyError;

      const stripe = await loadStripe(keyData.publishableKey);
      if (!stripe) throw new Error('Failed to load Stripe');

      // Call extend-booking function
      const { data, error } = await supabase.functions.invoke('extend-booking', {
        body: {
          bookingId: booking.id,
          extensionHours
        }
      });

      if (error) throw error;

      // If payment requires action (3D Secure)
      if (data.requiresAction && data.clientSecret) {
        const { error: confirmError } = await stripe.confirmCardPayment(data.clientSecret);
        if (confirmError) throw confirmError;

        // Finalize the payment
        const { error: finalizeError } = await supabase.functions.invoke('extend-booking', {
          body: {
            bookingId: booking.id,
            extensionHours,
            paymentIntentId: data.paymentIntentId,
            finalize: true
          }
        });

        if (finalizeError) throw finalizeError;
      }

      toast.success('Booking extended successfully!');
      setShowExtendDialog(false);
      setNewEndTime(null);
      loadBookingDetails(); // Reload to show updated times
    } catch (error: any) {
      console.error('Error extending booking:', error);
      toast.error(error.message || 'Failed to extend booking');
    } finally {
      setExtending(false);
    }
  };

  const calculateExtensionCost = () => {
    if (!booking || !newEndTime) return { subtotal: 0, platformFee: 0, total: 0, hours: 0 };
    
    const extensionMinutes = differenceInMinutes(newEndTime, new Date(booking.end_at));
    const hours = extensionMinutes / 60;
    
    if (hours <= 0) return { subtotal: 0, platformFee: 0, total: 0, hours: 0 };
    
    const subtotal = booking.hourly_rate * hours;
    const platformFee = subtotal * 0.15; // 15% platform fee
    const total = subtotal + platformFee;
    return { subtotal, platformFee, total, hours };
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">Booking not found</p>
          <Button onClick={() => navigate('/activity')}>Back to Activity</Button>
        </div>
      </div>
    );
  }

  const isActive = booking.status === 'active' || booking.status === 'paid';
  const isCancelled = booking.status === 'canceled';
  const isCompleted = booking.status === 'completed';
  const canCancel = isActive && new Date() < new Date(booking.start_at);
  const canExtend = (booking.status === 'pending' || booking.status === 'active' || booking.status === 'paid') && new Date() < new Date(booking.end_at);
  const isHost = user?.id === booking.spots.host_id;
  const hasOverstay = booking.overstay_detected_at !== null;
  const hasTowRequest = booking.overstay_action === 'towing';

  const extensionCost = calculateExtensionCost();

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="container max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/activity')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold">Booking Details</h1>
              <p className="text-xs text-muted-foreground">Confirmation #{booking.id.slice(0, 8)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Status Badge */}
        <div className="flex justify-center">
          {isActive && <Badge className="text-sm px-4 py-1">Active</Badge>}
          {isCancelled && <Badge variant="destructive" className="text-sm px-4 py-1">Cancelled</Badge>}
          {isCompleted && <Badge variant="secondary" className="text-sm px-4 py-1">Completed</Badge>}
        </div>

        {/* Location Card */}
        <Card className="p-4 space-y-4">
          <div>
            <h2 className="font-semibold text-lg mb-1">{booking.spots.title}</h2>
            <div className="flex items-start gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <p className="text-sm">{booking.spots.address}</p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={handleGetDirections}>
              <Navigation className="h-4 w-4 mr-2" />
              Directions
            </Button>
            <Button variant="outline" className="flex-1" onClick={handleMessage}>
              <MessageCircle className="h-4 w-4 mr-2" />
              Message Host
            </Button>
          </div>
        </Card>

        {/* Time Details */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Parking Time</h3>
            {canExtend && (
              <Button size="sm" variant="outline" onClick={() => setShowExtendTimePicker(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Extend
              </Button>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">Start</p>
                <p className="text-sm text-muted-foreground">{format(new Date(booking.start_at), 'EEE, MMM d, yyyy • h:mm a')}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">End</p>
                <p className="text-sm text-muted-foreground">{format(new Date(booking.end_at), 'EEE, MMM d, yyyy • h:mm a')}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">Duration</p>
                <p className="text-sm text-muted-foreground">{booking.total_hours} hour{booking.total_hours !== 1 ? 's' : ''}</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Payment Details */}
        <Card className="p-4 space-y-3">
          <h3 className="font-semibold">Payment Details</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal ({booking.total_hours}h × ${booking.hourly_rate}/hr)</span>
              <span className="font-medium">${booking.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Platform Fee</span>
              <span className="font-medium">${booking.platform_fee.toFixed(2)}</span>
            </div>
            {booking.overstay_charge_amount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Overstay Charges
                </span>
                <span className="font-medium text-destructive">${booking.overstay_charge_amount.toFixed(2)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between text-base font-semibold">
              <span>Total</span>
              <span>${(booking.total_amount + booking.overstay_charge_amount).toFixed(2)}</span>
            </div>
          </div>
        </Card>

        {/* Host Info */}
        <Card className="p-4">
          <h3 className="font-semibold mb-3">Host</h3>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              {booking.profiles.avatar_url ? (
                <img src={booking.profiles.avatar_url} alt="Host" className="h-12 w-12 rounded-full object-cover" />
              ) : (
                <span className="text-lg font-semibold text-primary">
                  {booking.profiles.first_name.charAt(0)}
                </span>
              )}
            </div>
            <div>
              <p className="font-medium">{booking.profiles.first_name} {booking.profiles.last_name.charAt(0)}.</p>
              <p className="text-sm text-muted-foreground">Spot Host</p>
            </div>
          </div>
        </Card>

        {/* Overstay Status (Host Only) */}
        {isHost && hasOverstay && (
          <Card className="p-4 border-destructive bg-destructive/5">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
              <div className="flex-1 space-y-3">
                <div>
                  <p className="font-semibold text-destructive mb-1">Overstay Detected</p>
                  <p className="text-sm text-muted-foreground">
                    Guest has exceeded their booking time.
                    {booking.overstay_grace_end && new Date() < new Date(booking.overstay_grace_end) && (
                      <> Grace period ends at {format(new Date(booking.overstay_grace_end), 'h:mm a')}.</>
                    )}
                  </p>
                </div>
                
                {hasTowRequest && (
                  <div className="bg-background p-3 rounded-md border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="destructive" className="text-xs">Tow Request Active</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">
                      A towing service request has been initiated for this vehicle.
                    </p>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={handleCancelTowRequest}
                      disabled={cancellingTow}
                      className="w-full"
                    >
                      {cancellingTow ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Cancelling...
                        </>
                      ) : (
                        <>
                          <XCircle className="h-4 w-4 mr-2" />
                          Cancel Tow Request
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Additional Info */}
        <Card className="p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Booked on</span>
            <span className="font-medium">{format(new Date(booking.created_at), 'MMM d, yyyy')}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Booking ID</span>
            <span className="font-medium font-mono text-xs">{booking.id}</span>
          </div>
          {booking.cancellation_reason && (
            <div className="pt-2 border-t">
              <p className="text-sm text-muted-foreground mb-1">Cancellation Reason</p>
              <p className="text-sm">{booking.cancellation_reason}</p>
            </div>
          )}
        </Card>

        {/* Cancel Button (Renter Only) */}
        {!isHost && canCancel && (
          <Card className="p-4 bg-muted/50">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium mb-1">Need to cancel?</p>
                <p className="text-xs text-muted-foreground mb-3">Free cancellation up to your start time</p>
                <Button variant="destructive" size="sm" onClick={() => setShowCancelDialog(true)}>
                  <XCircle className="h-4 w-4 mr-2" />
                  Cancel Booking
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Mobile Time Picker for Extension */}
      {booking && (
        <MobileTimePicker
          isOpen={showExtendTimePicker}
          onClose={() => setShowExtendTimePicker(false)}
          onConfirm={(date) => {
            setNewEndTime(date);
            setShowExtendTimePicker(false);
            setShowExtendDialog(true);
          }}
          mode="end"
          startTime={new Date(booking.end_at)}
          initialValue={newEndTime || new Date(booking.end_at)}
        />
      )}

      {/* Extend Duration Dialog */}
      <Dialog 
        open={showExtendDialog} 
        onOpenChange={setShowExtendDialog}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Extend Parking Duration</DialogTitle>
            <DialogDescription>
              Confirm your extension. Payment will be charged immediately.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Current Booking Time */}
            <div className="bg-muted/50 p-3 rounded-md space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Current end time</span>
                <span className="font-medium">{booking && format(new Date(booking.end_at), 'h:mm a, MMM d')}</span>
              </div>
              {newEndTime && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">New end time</span>
                  <span className="font-medium text-primary">{format(newEndTime, 'h:mm a, MMM d')}</span>
                </div>
              )}
            </div>

            {/* Change Time Button */}
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => {
                setShowExtendDialog(false);
                setShowExtendTimePicker(true);
              }}
            >
              <Clock className="h-4 w-4 mr-2" />
              {newEndTime ? 'Change time' : 'Select new end time'}
            </Button>

            {newEndTime && extensionCost.hours > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Extension ({extensionCost.hours.toFixed(1)}h × ${booking?.hourly_rate}/hr)</span>
                    <span className="font-medium">${extensionCost.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Platform Fee (15%)</span>
                    <span className="font-medium">${extensionCost.platformFee.toFixed(2)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-base font-semibold">
                    <span>Total Charge</span>
                    <span className="text-primary">${extensionCost.total.toFixed(2)}</span>
                  </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowExtendDialog(false);
              setNewEndTime(null);
            }} disabled={extending}>
              Cancel
            </Button>
            <Button onClick={handleExtendBooking} disabled={extending || !newEndTime || extensionCost.hours <= 0}>
              {extending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <DollarSign className="h-4 w-4 mr-2" />}
              {newEndTime && extensionCost.hours > 0 ? `Pay $${extensionCost.total.toFixed(2)}` : 'Select Time'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Booking?</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this booking? This action cannot be undone. You will receive a full refund.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelDialog(false)} disabled={cancelling}>
              Keep Booking
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <XCircle className="h-4 w-4 mr-2" />}
              Cancel Booking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BookingDetail;
