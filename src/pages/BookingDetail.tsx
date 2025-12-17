import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MobileTimePicker } from '@/components/booking/MobileTimePicker';
import { ExtendParkingDialog } from '@/components/booking/ExtendParkingDialog';
import { ArrowLeft, MapPin, Clock, Calendar, DollarSign, AlertCircle, Navigation, MessageCircle, XCircle, Loader2, AlertTriangle, CheckCircle2, Copy, TimerReset } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { calculateBookingTotal, calculateDriverPrice } from '@/lib/pricing';
import RequireAuth from '@/components/auth/RequireAuth';

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
  original_total_amount: number | null;
  extension_charges: number | null;
  spots: {
    id: string;
    title: string;
    address: string;
    host_id: string;
    description: string | null;
    access_notes: string | null;
  };
  profiles: {
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  };
}

const BookingDetailContent = () => {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [booking, setBooking] = useState<BookingDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showExtendDialog, setShowExtendDialog] = useState(false);
  const [cancellingTow, setCancellingTow] = useState(false);
  const [overstayLoading, setOverstayLoading] = useState(false);
  const [confirmingDeparture, setConfirmingDeparture] = useState(false);
  const [showModifyStartPicker, setShowModifyStartPicker] = useState(false);
  const [showModifyEndPicker, setShowModifyEndPicker] = useState(false);
  const [modifyStartTime, setModifyStartTime] = useState<Date | null>(null);
  const [modifyEndTime, setModifyEndTime] = useState<Date | null>(null);
  const [modifying, setModifying] = useState(false);

  useEffect(() => {
    if (!bookingId || !user) return;
    loadBookingDetails();
  }, [bookingId, user]);

  // Auto-open extend dialog if action=extend query param is present
  useEffect(() => {
    if (!booking || loading) return;
    const action = searchParams.get('action');
    const canExtendBooking = (booking.status === 'pending' || booking.status === 'active' || booking.status === 'paid') && new Date() < new Date(booking.end_at);
    
    if (action === 'extend' && canExtendBooking && booking.renter_id === user?.id) {
      setShowExtendDialog(true);
      // Remove the query param to prevent re-opening on refresh
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
  }, [booking, loading, searchParams, user]);

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
          original_total_amount,
          extension_charges,
          spots!inner(id, title, address, host_id, description, access_notes),
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

  const handleSendWarning = async () => {
    if (!booking || !inGracePeriod) {
      toast.error('Warning can only be sent during grace period');
      return;
    }
    
    setOverstayLoading(true);

    try {
      // Send warning notification to the renter
      const { error: notifError } = await supabase
        .from('notifications')
        .insert({
          user_id: booking.renter_id,
          type: 'overstay_warning',
          title: 'Grace Period Active - Please Vacate',
          message: `Your parking at ${booking.spots.title} has expired and you are in the 10-minute grace period. Please vacate immediately to avoid overtime charges of $25/hour or towing.`,
          related_id: booking.id,
        });

      if (notifError) throw notifError;

      toast.success('Grace period warning sent to driver');
    } catch (error) {
      console.error('Error sending warning:', error);
      toast.error('Failed to send warning');
    }

    setOverstayLoading(false);
  };

  const handleOverstayAction = async (action: 'charging' | 'towing') => {
    if (!booking || !gracePeriodEnded) {
      toast.error('This action can only be taken after grace period ends');
      return;
    }
    
    setOverstayLoading(true);
    
    try {
      const { error } = await supabase
        .from('bookings')
        .update({
          overstay_action: action,
        })
        .eq('id', booking.id);

      if (error) throw error;

      // Send notification to renter
      await supabase
        .from('notifications')
        .insert({
          user_id: booking.renter_id,
          type: action === 'charging' ? 'overstay_charging' : 'overstay_towing',
          title: action === 'charging' ? 'Overtime Charges Applied' : 'Tow Request Initiated',
          message: action === 'charging' 
            ? `Overtime charges of $25/hour are now being applied at ${booking.spots.title}. Please vacate immediately.`
            : `A tow request has been initiated for your vehicle at ${booking.spots.title}. Please vacate immediately to avoid towing.`,
          related_id: booking.id,
        });

      toast.success(
        action === 'charging' 
          ? 'Overtime charging activated at $25/hour. Driver notified.' 
          : 'Tow request initiated. Driver notified.'
      );
      loadBookingDetails();
    } catch (error) {
      console.error('Error updating overstay:', error);
      toast.error('Failed to update overstay status');
    }
    
    setOverstayLoading(false);
  };

  const handleConfirmDeparture = async () => {
    if (!booking) return;

    setConfirmingDeparture(true);
    try {
      const { data, error } = await supabase.functions.invoke('confirm-departure', {
        body: { bookingId: booking.id },
      });

      if (error) throw error;

      toast.success('Departure confirmed! Thank you.');
      await loadBookingDetails();
    } catch (error) {
      console.error('Error confirming departure:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to confirm departure');
    } finally {
      setConfirmingDeparture(false);
    }
  };

  const handleModifyTimes = async () => {
    if (!booking || !modifyStartTime || !modifyEndTime) {
      toast.error('Please select both start and end times');
      return;
    }

    if (modifyEndTime <= modifyStartTime) {
      toast.error('End time must be after start time');
      return;
    }

    setModifying(true);
    try {
      const { data, error } = await supabase.functions.invoke('modify-booking-times', {
        body: {
          bookingId: booking.id,
          newStartAt: modifyStartTime.toISOString(),
          newEndAt: modifyEndTime.toISOString()
        }
      });

      if (error) throw error;

      const priceDiff = data.priceDifference;
      if (priceDiff > 0) {
        toast.success(`Booking modified! Additional charge: $${priceDiff.toFixed(2)}`);
      } else if (priceDiff < 0) {
        toast.success(`Booking modified! Refund: $${Math.abs(priceDiff).toFixed(2)}`);
      } else {
        toast.success('Booking times updated successfully!');
      }

      setModifyStartTime(null);
      setModifyEndTime(null);
      loadBookingDetails();
    } catch (error: any) {
      console.error('Error modifying booking:', error);
      toast.error(error.message || 'Failed to modify booking');
    } finally {
      setModifying(false);
    }
  };

  const calculateModifyCost = () => {
    if (!booking || !modifyStartTime || !modifyEndTime) return { subtotal: 0, serviceFee: 0, total: 0, hours: 0, difference: 0, driverHourlyRate: 0 };
    
    const durationMs = modifyEndTime.getTime() - modifyStartTime.getTime();
    const hours = durationMs / (1000 * 60 * 60);
    
    if (hours <= 0) return { subtotal: 0, serviceFee: 0, total: 0, hours: 0, difference: 0, driverHourlyRate: 0 };
    
    // Use new pricing: driver sees upcharged rate + service fee
    const { driverHourlyRate, driverSubtotal, serviceFee, driverTotal } = calculateBookingTotal(booking.hourly_rate, hours);
    const difference = driverTotal - booking.total_amount;
    
    return { subtotal: driverSubtotal, serviceFee, total: driverTotal, hours, difference, driverHourlyRate };
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
  const isRenter = booking?.renter_id === user?.id;
  
  // Can modify if renter, booking is active/paid, and booking hasn't started yet
  const canModifyTimes = () => {
    if (!isRenter || (!isActive && booking.status !== 'pending')) return false;
    const startTime = new Date(booking.start_at);
    const now = new Date();
    return now < startTime;
  };

  // Check if booking is ending soon or has just ended for departure confirmation
  const canConfirmDeparture = () => {
    if (!booking || !isRenter || (booking.status !== 'active' && booking.status !== 'paid')) return false;
    const now = new Date();
    const endTime = new Date(booking.end_at);
    const fifteenMinBefore = new Date(endTime.getTime() - 15 * 60 * 1000);
    const fifteenMinAfter = new Date(endTime.getTime() + 15 * 60 * 1000);
    return now >= fifteenMinBefore && now <= fifteenMinAfter && !booking.overstay_action;
  };
  
  // Correct overstay detection logic
  const now = new Date();
  const endTimeDate = new Date(booking.end_at);
  const isActuallyOverstayed = now > endTimeDate;
  const isOverstayed = booking.overstay_detected_at !== null && isActuallyOverstayed;
  const inGracePeriod = isOverstayed && booking.overstay_grace_end && new Date(booking.overstay_grace_end) > now;
  const gracePeriodEnded = isOverstayed && booking.overstay_grace_end && new Date(booking.overstay_grace_end) <= now;
  const hasTowRequest = booking.overstay_action === 'towing';

  const modifyCost = calculateModifyCost();

  const baseTotal = (booking.subtotal ?? 0) + (booking.platform_fee ?? 0);
  const inferredExtensionCharges = Math.max(0, (booking.total_amount ?? 0) - baseTotal);
  const extensionChargesToShow = (booking.extension_charges ?? 0) > 0
    ? (booking.extension_charges ?? 0)
    : inferredExtensionCharges;

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="container max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/activity')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold">Booking Details</h1>
              {isActive && <Badge className="text-xs">Active</Badge>}
              {isCancelled && <Badge variant="destructive" className="text-xs">Cancelled</Badge>}
              {isCompleted && <Badge variant="secondary" className="text-xs">Completed</Badge>}
            </div>
          </div>
        </div>
      </div>

      <div className="container max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Departure Confirmation for Renters */}
        {isRenter && canConfirmDeparture() && (
          <Card className="overflow-hidden border-primary/20 bg-primary/5">
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">Confirm Your Departure</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Your booking is ending soon. Please confirm when you've left the parking spot.
                  </p>
                  <Button
                    onClick={handleConfirmDeparture}
                    disabled={confirmingDeparture}
                    className="w-full"
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    {confirmingDeparture ? 'Confirming...' : 'I\'ve Left the Spot'}
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Location Card */}
        <Card className="p-4 space-y-4">
          <div>
          <div className="flex items-start gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <p className="text-sm flex-1">{booking.spots.address}</p>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(booking.spots.address);
                  toast.success("Address copied to clipboard");
                }}
                className="p-1 hover:bg-muted rounded flex-shrink-0"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Spot Description */}
          {booking.spots.description && (
            <div className="pt-2 border-t">
              <h4 className="text-sm font-semibold mb-1">About This Spot</h4>
              <p className="text-sm text-muted-foreground">{booking.spots.description}</p>
            </div>
          )}

          {/* Access Information */}
          {booking.spots.access_notes && (
            <div className="pt-2 border-t">
              <h4 className="text-sm font-semibold mb-1">Access Instructions</h4>
              <p className="text-sm text-muted-foreground">{booking.spots.access_notes}</p>
            </div>
          )}

          <Button variant="outline" className="w-full" onClick={handleGetDirections}>
            <Navigation className="h-4 w-4 mr-2" />
            Get Directions
          </Button>
        </Card>

        {/* Time Details */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Parking Time</h3>
            <div className="flex gap-2">
              {canModifyTimes() && (
                <Button size="sm" variant="outline" onClick={() => {
                  setModifyStartTime(new Date(booking.start_at));
                  setModifyEndTime(new Date(booking.end_at));
                  setShowModifyStartPicker(true);
                }}>
                  <Clock className="h-4 w-4 mr-1" />
                  Modify
                </Button>
              )}
              {canExtend && (
                <Button size="sm" variant="outline" onClick={() => setShowExtendDialog(true)}>
                  <TimerReset className="h-4 w-4 mr-1" />
                  Extend
                </Button>
              )}
            </div>
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
                <p className="text-sm text-muted-foreground">
                  {(() => {
                    const durationMs = new Date(booking.end_at).getTime() - new Date(booking.start_at).getTime();
                    const totalMinutes = Math.round(durationMs / (1000 * 60));
                    const hours = Math.floor(totalMinutes / 60);
                    const minutes = totalMinutes % 60;
                    if (hours === 0) return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
                    if (minutes === 0) return `${hours} hour${hours !== 1 ? 's' : ''}`;
                    return `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} min`;
                  })()}
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Payment Details */}
        <Card className="p-4 space-y-3">
          <h3 className="font-semibold">Payment Details</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {(() => {
                  const durationMs = new Date(booking.end_at).getTime() - new Date(booking.start_at).getTime();
                  const totalMinutes = Math.round(durationMs / (1000 * 60));
                  const hours = Math.floor(totalMinutes / 60);
                  const minutes = totalMinutes % 60;
                  if (hours === 0) return `${minutes}min`;
                  if (minutes === 0) return `${hours}h`;
                  return `${hours}h ${minutes}min`;
                })()} × ${calculateDriverPrice(booking.hourly_rate).toFixed(2)}/hr
              </span>
              <span className="font-medium">${booking.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Service fee</span>
              <span className="font-medium">${booking.platform_fee.toFixed(2)}</span>
            </div>
            {extensionChargesToShow > 0.01 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1">
                  <TimerReset className="h-3 w-3" />
                  Extension Charges
                </span>
                <span className="font-medium">${extensionChargesToShow.toFixed(2)}</span>
              </div>
            )}
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
        <Card className="p-4 space-y-4">
          <h3 className="font-semibold">Host</h3>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              {booking.profiles.avatar_url ? (
                <img src={booking.profiles.avatar_url} alt="Host" className="h-12 w-12 rounded-full object-cover" />
              ) : (
                <span className="text-lg font-semibold text-primary">
                  {booking.profiles.first_name.charAt(0)}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium">{booking.profiles.first_name} {booking.profiles.last_name.charAt(0)}.</p>
              <p className="text-sm text-muted-foreground">Spot Host</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleMessage}>
              <MessageCircle className="h-4 w-4 mr-1" />
              Message
            </Button>
          </div>
        </Card>

        {/* Overstay Status (Host Only) */}
        {isHost && isOverstayed && (
          <Card className="p-4 border-destructive bg-destructive/5">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
              <div className="flex-1 space-y-3">
                <div>
                  <p className="font-semibold text-destructive mb-1">Overstay Detected</p>
                  <p className="text-sm text-muted-foreground">
                    Guest has exceeded their booking time.
                    {inGracePeriod && booking.overstay_grace_end && (
                      <> Grace period ends at {format(new Date(booking.overstay_grace_end), 'h:mm a')}.</>
                    )}
                    {gracePeriodEnded && (
                      <> Grace period has ended.</>
                    )}
                  </p>
                </div>

                {/* Action Buttons - Progressive System */}
                {!booking.overstay_action && (
                  <div className="flex gap-2 flex-wrap">
                    {inGracePeriod && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSendWarning}
                        disabled={overstayLoading}
                        className="border-amber-500 text-amber-600 hover:bg-amber-50 dark:border-amber-600 dark:text-amber-500 dark:hover:bg-amber-950"
                      >
                        <AlertCircle className="h-4 w-4 mr-2" />
                        Send Warning
                      </Button>
                    )}

                    {gracePeriodEnded && (
                      <>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleOverstayAction('charging')}
                          disabled={overstayLoading}
                        >
                          <DollarSign className="h-4 w-4 mr-2" />
                          Charge $25/hr
                        </Button>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOverstayAction('towing')}
                          disabled={overstayLoading}
                          className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                        >
                          <AlertCircle className="h-4 w-4 mr-2" />
                          Request Tow
                        </Button>
                      </>
                    )}
                  </div>
                )}
                
                {/* Active Overstay Action Status */}
                {booking.overstay_action === 'charging' && booking.overstay_charge_amount > 0 && (
                  <div className="bg-background p-3 rounded-md border border-destructive">
                    <Badge variant="destructive" className="text-xs mb-2">Overtime Charges Active</Badge>
                    <p className="text-sm font-semibold text-destructive">
                      Total Overtime: ${Number(booking.overstay_charge_amount).toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Charging $25/hour until vehicle is vacated
                    </p>
                  </div>
                )}
                
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

      {/* Extend Parking Dialog (same as Activity page) */}
      {booking && (
        <ExtendParkingDialog
          open={showExtendDialog}
          onOpenChange={setShowExtendDialog}
          booking={booking}
          onExtendSuccess={() => {
            loadBookingDetails();
          }}
        />
      )}

      {/* Modify Start Time Picker */}
      <MobileTimePicker
        isOpen={showModifyStartPicker}
        onClose={() => setShowModifyStartPicker(false)}
        onConfirm={(date) => {
          setModifyStartTime(date);
          setShowModifyStartPicker(false);
          setShowModifyEndPicker(true);
        }}
        mode="start"
        initialValue={modifyStartTime || new Date(booking.start_at)}
      />

      {/* Modify End Time Picker */}
      <MobileTimePicker
        isOpen={showModifyEndPicker}
        onClose={() => {
          setShowModifyEndPicker(false);
          if (modifyStartTime && modifyEndTime) {
            handleModifyTimes();
          }
        }}
        onConfirm={(date) => {
          setModifyEndTime(date);
          setShowModifyEndPicker(false);
          handleModifyTimes();
        }}
        mode="end"
        startTime={modifyStartTime || undefined}
        initialValue={modifyEndTime || new Date(booking.end_at)}
      />

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

const BookingDetail = () => {
  return (
    <RequireAuth feature="booking">
      <BookingDetailContent />
    </RequireAuth>
  );
};

export default BookingDetail;
