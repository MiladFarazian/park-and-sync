import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { ArrowLeft, MapPin, Clock, Calendar, DollarSign, AlertCircle, Navigation, MessageCircle, XCircle, Loader2, Plus } from 'lucide-react';
import { format } from 'date-fns';
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
  cancellation_reason: string | null;
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
  const [extensionHours, setExtensionHours] = useState(1);
  const [extending, setExtending] = useState(false);

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
    navigate(`/messages?userId=${booking.spots.host_id}`);
  };

  const handleExtendBooking = async () => {
    if (!booking) return;

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
      loadBookingDetails(); // Reload to show updated times
    } catch (error: any) {
      console.error('Error extending booking:', error);
      toast.error(error.message || 'Failed to extend booking');
    } finally {
      setExtending(false);
    }
  };

  const calculateExtensionCost = () => {
    if (!booking) return { subtotal: 0, platformFee: 0, total: 0 };
    const subtotal = booking.hourly_rate * extensionHours;
    const platformFee = subtotal * 0.15; // 15% platform fee
    const total = subtotal + platformFee;
    return { subtotal, platformFee, total };
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
  const canExtend = isActive && new Date() < new Date(booking.end_at);

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
              <Button size="sm" variant="outline" onClick={() => setShowExtendDialog(true)}>
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

        {/* Cancel Button */}
        {canCancel && (
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

      {/* Extend Duration Dialog */}
      <Dialog open={showExtendDialog} onOpenChange={setShowExtendDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend Parking Duration</DialogTitle>
            <DialogDescription>
              Add more time to your parking reservation. Payment will be charged immediately.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium">Additional Hours</label>
                <span className="text-sm font-semibold">{extensionHours} hour{extensionHours !== 1 ? 's' : ''}</span>
              </div>
              <Slider
                value={[extensionHours]}
                onValueChange={(value) => setExtensionHours(value[0])}
                min={1}
                max={12}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>1 hour</span>
                <span>12 hours</span>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Extension ({extensionHours}h × ${booking?.hourly_rate}/hr)</span>
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

            {booking && (
              <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-md">
                <p className="font-medium mb-1">New end time</p>
                <p>{format(new Date(new Date(booking.end_at).getTime() + extensionHours * 60 * 60 * 1000), 'EEE, MMM d, yyyy • h:mm a')}</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExtendDialog(false)} disabled={extending}>
              Cancel
            </Button>
            <Button onClick={handleExtendBooking} disabled={extending}>
              {extending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <DollarSign className="h-4 w-4 mr-2" />}
              Pay ${extensionCost.total.toFixed(2)}
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
