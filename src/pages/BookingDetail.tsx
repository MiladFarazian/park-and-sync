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
import { ReviewModal } from '@/components/booking/ReviewModal';
import { ArrowLeft, MapPin, Clock, Calendar, DollarSign, AlertCircle, Navigation, MessageCircle, XCircle, Loader2, AlertTriangle, CheckCircle2, Copy, AlarmClockPlus, Flag, Zap, ChevronLeft, ChevronRight, Car, CalendarPlus, Star } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { calculateBookingTotal, calculateDriverPrice } from '@/lib/pricing';
import { getHostNetEarnings, getParkzyFee } from '@/lib/hostEarnings';
import RequireAuth from '@/components/auth/RequireAuth';
import { getBookingStatus, getBookingStatusColor, getBookingStatusLabelWithOverstay } from '@/lib/bookingStatus';
import { formatDisplayName } from '@/lib/displayUtils';
import { logger } from '@/lib/logger';
import { useSupportRole } from '@/hooks/useSupportRole';

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
  will_use_ev_charging: boolean | null;
  ev_charging_fee: number | null;
  host_earnings: number | null;
  is_guest?: boolean;
  guest_full_name?: string | null;
  guest_car_model?: string | null;
  guest_license_plate?: string | null;
  guest_email?: string | null;
  spots: {
    id: string;
    title: string;
    address: string;
    host_id: string;
    description: string | null;
    access_notes: string | null;
    has_ev_charging: boolean | null;
    ev_charging_instructions: string | null;
    instant_book: boolean;
    spot_photos: Array<{
      url: string;
      is_primary: boolean | null;
      sort_order: number | null;
    }>;
  };
  profiles: {
    first_name: string;
    last_name: string;
    avatar_url: string | null;
    privacy_show_profile_photo?: boolean | null;
    privacy_show_full_name?: boolean | null;
  };
}

const BookingDetailContent = () => {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { isSupport } = useSupportRole();
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
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  const [showNotificationBanner, setShowNotificationBanner] = useState<string | null>(null);
  const [showTowConfirmDialog, setShowTowConfirmDialog] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [hasReviewed, setHasReviewed] = useState(false);

  useEffect(() => {
    if (!bookingId || !user) return;
    loadBookingDetails();
  }, [bookingId, user]);

  // Auto-open extend dialog if action=extend query param is present or fromNotification param
  useEffect(() => {
    if (!booking || loading) return;
    const action = searchParams.get('action');
    const fromNotification = searchParams.get('fromNotification');
    const canExtendBooking = (booking.status === 'pending' || booking.status === 'active' || booking.status === 'paid') && new Date() < new Date(booking.end_at);
    const isRenterUser = booking.renter_id === user?.id;
    const isHostUser = booking.spots.host_id === user?.id;
    
    // Handle action=extend param
    if (action === 'extend' && canExtendBooking && isRenterUser) {
      setShowExtendDialog(true);
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
    
    // Handle fromNotification param for deep-linked notifications
    if (fromNotification) {
      const notifType = fromNotification;
      
      // Driver notifications
      if (isRenterUser && (notifType === 'grace_period' || notifType === 'ending_soon')) {
        setShowNotificationBanner(notifType);
        
        // Auto-open extend dialog for grace period notifications
        if (notifType === 'grace_period' && canExtendBooking) {
          setShowExtendDialog(true);
        }
      }
      
      // Host notifications for guest overstay
      if (isHostUser && notifType === 'overstay_host') {
        setShowNotificationBanner('overstay_host');
      }
      
      // Remove the query param to prevent re-triggering
      searchParams.delete('fromNotification');
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
          will_use_ev_charging,
          ev_charging_fee,
          host_earnings,
          is_guest,
          guest_full_name,
          guest_car_model,
          guest_license_plate,
          guest_email,
          spots!inner(id, title, address, host_id, description, access_notes, has_ev_charging, ev_charging_instructions, instant_book, spot_photos(url, is_primary, sort_order)),
          profiles!bookings_renter_id_fkey(first_name, last_name, avatar_url, privacy_show_profile_photo, privacy_show_full_name)
        `)
        .eq('id', bookingId)
        .single();

      if (error) throw error;

      // Check if user has access to this booking
      if (data.spots.host_id !== user?.id && data.profiles) {
        // User must be the renter - verify via another check if needed
      }

      setBooking(data as unknown as BookingDetails);
      
      // Check if user has already reviewed this booking
      const { data: existingReview } = await supabase
        .from('reviews')
        .select('id')
        .eq('booking_id', bookingId)
        .eq('reviewer_id', user?.id)
        .single();
      
      setHasReviewed(!!existingReview);
    } catch (error) {
      logger.error('Error loading booking:', error);
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
      logger.error('Error cancelling booking:', error);
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
      logger.error('Error cancelling tow request:', error);
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
      logger.error('Error sending warning:', error);
      toast.error('Failed to send warning');
    }

    setOverstayLoading(false);
  };

  const handleOverstayAction = async (action: 'charging' | 'towing') => {
    if (!booking || !isOverstayed) {
      toast.error('This action can only be taken when overstay is detected');
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
      logger.error('Error updating overstay:', error);
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
      logger.error('Error confirming departure:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to confirm departure');
    } finally {
      setConfirmingDeparture(false);
    }
  };

  const handleModifyTimes = async (newStart?: Date, newEnd?: Date) => {
    const startTime = newStart || modifyStartTime;
    const endTime = newEnd || modifyEndTime;
    
    if (!booking || !startTime || !endTime) {
      toast.error('Please select both start and end times');
      return;
    }

    if (endTime <= startTime) {
      toast.error('End time must be after start time');
      return;
    }

    setModifying(true);
    try {
      const { data, error } = await supabase.functions.invoke('modify-booking-times', {
        body: {
          bookingId: booking.id,
          newStartAt: startTime.toISOString(),
          newEndAt: endTime.toISOString()
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
      logger.error('Error modifying booking:', error);
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

  const handleReportSpot = () => {
    if (!user) {
      toast.error('Please sign in to report a listing');
      return;
    }
    setReportDialogOpen(true);
  };

  const handleSubmitReport = async () => {
    if (!reportReason) {
      toast.error('Please select a reason for reporting');
      return;
    }
    if (!user || !booking?.spots?.id) return;

    setSubmittingReport(true);
    try {
      const { data: reportData, error } = await supabase
        .from('spot_reports')
        .insert({
          spot_id: booking.spots.id,
          reporter_id: user.id,
          reason: reportReason,
          details: reportDetails.trim() || null
        })
        .select('id')
        .single();

      if (error) throw error;

      // Send notification email to admin (fire and forget)
      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, last_name, email')
        .eq('user_id', user.id)
        .single();

      supabase.functions.invoke('send-report-notification', {
        body: {
          reportId: reportData.id,
          spotId: booking.spots.id,
          spotTitle: booking.spots.title,
          spotAddress: booking.spots.address,
          reporterName: profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Anonymous' : 'Anonymous',
          reporterEmail: profile?.email || null,
          reason: reportReason,
          details: reportDetails.trim() || null
        }
      }).catch(err => logger.error('Failed to send report notification:', err));

      toast.success('Report submitted. We will review it shortly.');
      setReportReason('');
      setReportDetails('');
      setReportDialogOpen(false);
    } catch (error) {
      logger.error('Error submitting report:', error);
      toast.error('Failed to submit report');
    } finally {
      setSubmittingReport(false);
    }
  };

  // Image carousel handlers
  const photos = booking?.spots?.spot_photos || [];
  const sortedPhotos = [...photos].sort((a, b) => {
    if (a.is_primary && !b.is_primary) return -1;
    if (!a.is_primary && b.is_primary) return 1;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });
  const hasMultiplePhotos = sortedPhotos.length > 1;

  const handlePrevImage = () => {
    setCurrentImageIndex((prev) => 
      prev === 0 ? sortedPhotos.length - 1 : prev - 1
    );
  };

  const handleNextImage = () => {
    setCurrentImageIndex((prev) => 
      prev === sortedPhotos.length - 1 ? 0 : prev + 1
    );
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;
    if (isLeftSwipe) handleNextImage();
    if (isRightSwipe) handlePrevImage();
    setTouchStart(0);
    setTouchEnd(0);
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
  // Can extend only after booking has started (before start: use modify instead)
  const bookingHasStarted = new Date() >= new Date(booking.start_at);
  const isHost = user?.id === booking.spots.host_id;
  const isRenter = booking?.renter_id === user?.id;
  
  // Get status using new terminology system
  const bookingStatusResult = getBookingStatus({
    status: booking.status,
    instantBook: booking.spots.instant_book !== false,
    startAt: booking.start_at,
    endAt: booking.end_at,
    isHost
  });
  const hasOverstay = booking.overstay_charge_amount && booking.overstay_charge_amount > 0;
  const statusLabel = getBookingStatusLabelWithOverstay(bookingStatusResult.label, hasOverstay);
  const statusColor = getBookingStatusColor(bookingStatusResult.label);
  
  // Can extend only after booking has started (before start: use modify instead) - DRIVER ONLY
  const canExtend = isRenter && !isHost && (booking.status === 'pending' || booking.status === 'active' || booking.status === 'paid') && bookingHasStarted && new Date() < new Date(booking.end_at);
  
  // Can modify if renter (not host), booking is active/paid, and booking hasn't started yet
  const canModifyTimes = () => {
    if (!isRenter || isHost || (!isActive && booking.status !== 'pending')) return false;
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
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold">Booking Details</h1>
              <Badge 
                variant={bookingStatusResult.variant}
                className={`text-xs border ${statusColor}`}
              >
                {statusLabel}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="container max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Notification Banner for deep-linked notifications */}
        {showNotificationBanner && (
          <div 
            className={`p-4 rounded-lg flex items-center gap-3 animate-pulse ${
              showNotificationBanner === 'grace_period' 
                ? 'bg-destructive/10 border border-destructive/30' 
                : showNotificationBanner === 'overstay_host'
                ? 'bg-orange-500/10 border border-orange-500/30'
                : 'bg-amber-500/10 border border-amber-500/30'
            }`}
          >
            <AlertTriangle className={`h-5 w-5 flex-shrink-0 ${
              showNotificationBanner === 'grace_period' 
                ? 'text-destructive' 
                : showNotificationBanner === 'overstay_host'
                ? 'text-orange-500'
                : 'text-amber-500'
            }`} />
            <div className="flex-1">
              <p className={`text-sm font-medium ${
                showNotificationBanner === 'grace_period' 
                  ? 'text-destructive' 
                  : showNotificationBanner === 'overstay_host'
                  ? 'text-orange-600'
                  : 'text-amber-600'
              }`}>
                {showNotificationBanner === 'grace_period' 
                  ? "You're in your grace period — extend now to avoid $25/hr overtime charges"
                  : showNotificationBanner === 'overstay_host'
                  ? "Guest has overstayed — you can send a warning or take action below"
                  : "Your parking ends soon — extend now to keep your spot"}
              </p>
            </div>
            {showNotificationBanner !== 'overstay_host' && (
              <Button 
                size="sm" 
                variant={showNotificationBanner === 'grace_period' ? 'destructive' : 'default'}
                onClick={() => setShowExtendDialog(true)}
                disabled={!((booking.status === 'pending' || booking.status === 'active' || booking.status === 'paid') && new Date() < new Date(booking.end_at))}
              >
                Extend Now
              </Button>
            )}
            <Button 
              size="icon" 
              variant="ghost" 
              className="h-6 w-6"
              onClick={() => setShowNotificationBanner(null)}
            >
              <XCircle className="h-4 w-4" />
            </Button>
          </div>
        )}
        
        {/* Spot Photo Carousel */}
        {sortedPhotos.length > 0 && (
          <div 
            className="relative rounded-xl overflow-hidden aspect-[16/9] select-none"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <img 
              src={sortedPhotos[currentImageIndex]?.url} 
              alt={booking.spots.title}
              loading="lazy"
              className="w-full h-full object-cover"
            />
            
            {hasMultiplePhotos && (
              <>
                {/* Navigation Arrows */}
                <button
                  onClick={handlePrevImage}
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-all hover:scale-110 z-10"
                  aria-label="Previous image"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={handleNextImage}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-all hover:scale-110 z-10"
                  aria-label="Next image"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>

                {/* Dot Indicators */}
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                  {sortedPhotos.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentImageIndex(index)}
                      className={`w-2 h-2 rounded-full transition-all ${
                        index === currentImageIndex 
                          ? 'bg-white scale-110' 
                          : 'bg-white/50 hover:bg-white/75'
                      }`}
                      aria-label={`Go to image ${index + 1}`}
                    />
                  ))}
                </div>

                {/* Image Counter */}
                <div className="absolute top-3 right-3 bg-black/50 text-white text-xs px-2 py-1 rounded-full z-10">
                  {currentImageIndex + 1} / {sortedPhotos.length}
                </div>
              </>
            )}
          </div>
        )}
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

          {/* EV Charging Instructions */}
          {booking.will_use_ev_charging && booking.spots.ev_charging_instructions && (
            <div className="pt-2 border-t border-green-200 bg-green-50/50 -mx-4 px-4 pb-2 rounded-b-lg">
              <div className="flex items-start gap-2 pt-2">
                <Zap className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="text-sm font-semibold text-green-800 mb-1">EV Charging Instructions</h4>
                  <p className="text-sm text-green-700">{booking.spots.ev_charging_instructions}</p>
                </div>
              </div>
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
            {/* Time modification actions - Driver only */}
            {isRenter && (
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
                    <AlarmClockPlus className="h-4 w-4 mr-1" />
                    Extend
                  </Button>
                )}
              </div>
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

        {/* Payment Details - Different view for Host vs Driver */}
        <Card className="p-4 space-y-3">
          <h3 className="font-semibold">{isHost ? 'Earnings' : 'Payment Details'}</h3>
          
          {isHost ? (
            // HOST VIEW: Show only what they earned
            <div className="space-y-2">
              <div className="flex justify-between text-base font-semibold text-green-600 dark:text-green-400">
                <span>You earned</span>
                <span>${getHostNetEarnings(booking).toFixed(2)}</span>
              </div>
              
              {/* Optional earnings breakdown for transparency */}
              <Separator />
              <div className="text-xs text-muted-foreground space-y-1">
                <div className="flex justify-between">
                  <span>Driver paid</span>
                  <span>${(booking.total_amount + booking.overstay_charge_amount).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Parkzy fee</span>
                  <span>-${getParkzyFee(booking).toFixed(2)}</span>
                </div>
              </div>
            </div>
          ) : (
            // DRIVER VIEW: Show full payment breakdown
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
              {(booking.ev_charging_fee ?? 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Zap className="h-3 w-3 text-green-500" />
                    EV Charging
                  </span>
                  <span className="font-medium">${(booking.ev_charging_fee ?? 0).toFixed(2)}</span>
                </div>
              )}
              {extensionChargesToShow > 0.01 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <AlarmClockPlus className="h-3 w-3" />
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
          )}
        </Card>

        {/* Host/Driver Info - Show different content based on viewer role */}
        <Card className="p-4 space-y-4">
          <h3 className="font-semibold">
            {isHost ? (booking.is_guest ? 'Guest' : 'Driver') : 'Host'}
          </h3>
          <div 
            className={`flex items-center gap-3 ${isSupport ? 'cursor-pointer hover:bg-muted/50 -m-2 p-2 rounded-lg transition-colors' : ''}`}
            onClick={isSupport ? () => {
              // Support users can click to view user profile
              const targetUserId = isHost ? booking.renter_id : booking.spots.host_id;
              navigate(`/support-user/${targetUserId}`);
            } : undefined}
          >
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              {isHost && booking.is_guest ? (
                <span className="text-lg font-semibold text-primary">
                  {(booking.guest_full_name || 'G').charAt(0)}
                </span>
              ) : booking.profiles?.avatar_url ? (
                <img src={booking.profiles.avatar_url} alt={isHost ? 'Driver' : 'Host'} className="h-12 w-12 rounded-full object-cover" />
              ) : (
                <span className="text-lg font-semibold text-primary">
                  {formatDisplayName(booking.profiles, isHost ? 'Driver' : 'Host').charAt(0)}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              {isHost && booking.is_guest ? (
                <>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{booking.guest_full_name || 'Guest'}</p>
                    <Badge variant="outline" className="text-xs">Guest</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">Guest booking</p>
                </>
              ) : (
                <>
                  <p className="font-medium">{formatDisplayName(booking.profiles, isHost ? 'Driver' : 'Host')}</p>
                  <p className="text-sm text-muted-foreground">{isHost ? 'Driver' : 'Spot Host'}</p>
                </>
              )}
            </div>
            {isSupport ? (
              <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
            ) : (
              <Button variant="outline" size="sm" onClick={(e) => {
                e.stopPropagation();
                if (isHost && booking.is_guest) {
                  navigate(`/messages?userId=guest:${booking.id}`);
                } else {
                  handleMessage();
                }
              }}>
                <MessageCircle className="h-4 w-4 mr-1" />
                Message
              </Button>
            )}
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

                {/* Action Buttons - Available when overstay is detected and no final action taken */}
                {(!booking.overstay_action || booking.overstay_action === 'pending_action') && (
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

                    {/* Tow and Charge options available as soon as overstay is detected */}
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
                      onClick={() => setShowTowConfirmDialog(true)}
                      disabled={overstayLoading}
                      className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    >
                      <Car className="h-4 w-4 mr-2" />
                      Request Tow
                    </Button>
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

        {/* Leave Review Option (Both Drivers and Hosts) */}
        {(() => {
          const bookingEndTime = new Date(booking.end_at);
          const isBookingEnded = new Date() > bookingEndTime;
          const canReview = (isBookingEnded || booking.status === 'completed') && 
                            !['canceled', 'refunded', 'declined', 'rejected', 'pending'].includes(booking.status) && 
                            !hasReviewed;
          const revieweeId = isHost ? booking.renter_id : booking.spots.host_id;
          const revieweeName = isHost 
            ? (booking.is_guest ? booking.guest_full_name || 'Guest' : `${booking.profiles.first_name} ${booking.profiles.last_name.charAt(0)}.`)
            : `${booking.profiles.first_name} ${booking.profiles.last_name.charAt(0)}.`;
          
          if (!canReview) return null;
          
          return (
            <Card className="p-4 bg-yellow-50/50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800">
              <div className="flex items-start gap-3">
                <Star className="h-5 w-5 text-yellow-500 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium mb-1">
                    How was your experience?
                  </p>
                  <p className="text-xs text-muted-foreground mb-3">
                    {isHost 
                      ? 'Leave a review for this driver to help other hosts'
                      : 'Leave a review for this parking spot and host'
                    }
                  </p>
                  <Button 
                    size="sm"
                    variant="outline"
                    className="border-yellow-400 text-yellow-700 hover:bg-yellow-100 dark:border-yellow-600 dark:text-yellow-400 dark:hover:bg-yellow-900/30"
                    onClick={() => setShowReviewModal(true)}
                  >
                    <Star className="h-4 w-4 mr-2" />
                    Leave Review
                  </Button>
                </div>
              </div>
            </Card>
          );
        })()}

        {/* Book Again Option (Renter Only) */}
        {isRenter && !isHost && (
          <Card className="p-4 bg-primary/5 border-primary/20">
            <div className="flex items-start gap-3">
              <CalendarPlus className="h-5 w-5 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium mb-1">Want to park here again?</p>
                <p className="text-xs text-muted-foreground mb-3">Book this spot for another date or time</p>
                <Button 
                  size="sm" 
                  onClick={() => navigate(`/book/${booking.spots.id}`)}
                >
                  <CalendarPlus className="h-4 w-4 mr-2" />
                  Book Again
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Report Listing Option (Renters Only) */}
        {!isHost && (
          <div className="flex justify-center">
            <button
              onClick={handleReportSpot}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Flag className="h-4 w-4" />
              Report Listing
            </button>
          </div>
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
        }}
        onConfirm={(date) => {
          setModifyEndTime(date);
          setShowModifyEndPicker(false);
          // Pass both start and end times directly to avoid async state issues
          handleModifyTimes(modifyStartTime || undefined, date);
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

      {/* Report Listing Dialog */}
      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report Listing</DialogTitle>
            <DialogDescription>
              Help us keep Parkzy safe by reporting inappropriate listings
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <RadioGroup value={reportReason} onValueChange={setReportReason}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="inaccurate_info" id="bd_inaccurate_info" />
                <Label htmlFor="bd_inaccurate_info">Inaccurate information</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="misleading_photos" id="bd_misleading_photos" />
                <Label htmlFor="bd_misleading_photos">Misleading photos</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="scam" id="bd_scam" />
                <Label htmlFor="bd_scam">Suspected scam or fraud</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="unsafe" id="bd_unsafe" />
                <Label htmlFor="bd_unsafe">Unsafe location</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="unavailable" id="bd_unavailable" />
                <Label htmlFor="bd_unavailable">Spot doesn't exist or unavailable</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="other" id="bd_other" />
                <Label htmlFor="bd_other">Other</Label>
              </div>
            </RadioGroup>
            <Textarea
              placeholder="Additional details (optional)"
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              rows={3}
              className="resize-none"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setReportDialogOpen(false);
                  setReportReason('');
                  setReportDetails('');
                }}
                disabled={submittingReport}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSubmitReport} 
                disabled={submittingReport || !reportReason}
                variant="destructive"
              >
                {submittingReport ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Report'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Tow Confirmation Dialog (Host Only) */}
      <Dialog open={showTowConfirmDialog} onOpenChange={setShowTowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Car className="h-5 w-5 text-destructive" />
              Request Vehicle Tow
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to request a tow for this vehicle? This is a serious action and should only be used when the guest has significantly overstayed and is not responding to warnings.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md p-3">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                <strong>Before requesting a tow:</strong>
              </p>
              <ul className="text-sm text-amber-700 dark:text-amber-300 mt-1 list-disc list-inside space-y-1">
                <li>Ensure you've tried contacting the driver via messages</li>
                <li>Confirm the vehicle is still in your spot</li>
                <li>Consider applying overtime charges first</li>
              </ul>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowTowConfirmDialog(false)} disabled={overstayLoading}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => {
                handleOverstayAction('towing');
                setShowTowConfirmDialog(false);
              }} 
              disabled={overstayLoading}
            >
              {overstayLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Processing...
                </>
              ) : (
                <>
                  <Car className="h-4 w-4 mr-2" />
                  Confirm Tow Request
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review Modal */}
      {booking && (
        <ReviewModal
          open={showReviewModal}
          onOpenChange={setShowReviewModal}
          bookingId={booking.id}
          revieweeId={isHost ? booking.renter_id : booking.spots.host_id}
          revieweeName={
            isHost 
              ? (booking.is_guest ? booking.guest_full_name || 'Guest' : `${booking.profiles.first_name} ${booking.profiles.last_name.charAt(0)}.`)
              : `${booking.profiles.first_name} ${booking.profiles.last_name.charAt(0)}.`
          }
          reviewerRole={isHost ? 'host' : 'driver'}
          onReviewSubmitted={() => {
            setHasReviewed(true);
            loadBookingDetails();
          }}
        />
      )}
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
