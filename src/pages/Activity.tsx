import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MapPin, Clock, Calendar, XCircle, MessageCircle, Navigation, Edit, Star, AlarmClockPlus, List, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { useMode } from '@/contexts/ModeContext';
import { ActiveBookingBanner } from '@/components/booking/ActiveBookingBanner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ReviewModal } from '@/components/booking/ReviewModal';
import { ExtendParkingDialog } from '@/components/booking/ExtendParkingDialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths, isToday } from 'date-fns';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';
import { getBookingStatus, getBookingStatusColorWithOverstay, getBookingStatusLabelWithOverstay } from '@/lib/bookingStatus';

const Activity = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { mode } = useMode();
  const [activeTab, setActiveTab] = useState('upcoming');
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewBooking, setReviewBooking] = useState<any>(null);
  const [userReviews, setUserReviews] = useState<Set<string>>(new Set());
  
  // Quick extend state
  const [extendDialogOpen, setExtendDialogOpen] = useState(false);
  const [extendBooking, setExtendBooking] = useState<any>(null);
  useEffect(() => {
    fetchBookings();
  }, [mode]);
  const fetchBookings = async () => {
    try {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) return;
      
      // Fetch user's existing reviews (including pending ones for UI state)
      const { data: reviewsData } = await supabase
        .from('reviews')
        .select('booking_id, revealed_at')
        .eq('reviewer_id', user.id);
      
      // Store booking IDs where user has already submitted a review
      setUserReviews(new Set(reviewsData?.map(r => r.booking_id) || []));
      
      let bookingsData: any[] = [];
      if (mode === 'driver') {
        // Driver mode: only show bookings where user is the renter
        const {
          data: renterBookings,
          error: renterError
        } = await supabase.from('bookings').select(`
            *,
            spots (
              title,
              address,
              host_id,
              instant_book,
              profiles:host_id (
                first_name,
                last_name
              ),
              spot_photos(url, is_primary, sort_order)
            )
          `).eq('renter_id', user.id).order('start_at', {
          ascending: false
        });
        if (renterError) throw renterError;
        bookingsData = (renterBookings || []).map(b => ({
          ...b,
          userRole: 'renter'
        }));
      } else {
        // Host mode: only show bookings for user's spots
        const {
          data: hostBookings,
          error: hostError
        } = await supabase.from('bookings').select(`
            *,
            spots!inner (
              title,
              address,
              host_id,
              instant_book,
              spot_photos(url, is_primary, sort_order)
            ),
            renter:renter_id (
              first_name,
              last_name
            )
          `).eq('spots.host_id', user.id).order('start_at', {
          ascending: false
        });
        if (hostError) throw hostError;
        bookingsData = (hostBookings || []).map(b => ({
          ...b,
          userRole: 'host'
        }));
      }
      setBookings(bookingsData);
    } catch (error) {
      console.error('Error fetching bookings:', error);
      toast({
        title: "Error",
        description: "Failed to load bookings",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };
  const formatTime = (start: string, end: string) => {
    const startTime = new Date(start).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    });
    const endTime = new Date(end).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    });
    return `${startTime} - ${endTime}`;
  };
  const getCancellationPolicy = (booking: any) => {
    const now = new Date();
    const bookingStart = new Date(booking.start_at);
    const bookingCreated = new Date(booking.created_at);
    const gracePeriodEnd = new Date(bookingCreated.getTime() + 10 * 60 * 1000);
    const oneHourBeforeStart = new Date(bookingStart.getTime() - 60 * 60 * 1000);
    if (now <= gracePeriodEnd) {
      return {
        refundable: true,
        message: 'Full refund - within 10-minute grace period'
      };
    } else if (now <= oneHourBeforeStart) {
      return {
        refundable: true,
        message: 'Full refund - more than 1 hour before start time'
      };
    } else {
      return {
        refundable: false,
        message: 'No refund - less than 1 hour before start time'
      };
    }
  };
  const handleCancelBooking = async () => {
    if (!selectedBooking) return;
    setCancelling(true);
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke('cancel-booking', {
        body: {
          bookingId: selectedBooking.id
        }
      });
      if (error) throw error;
      toast({
        title: "Booking cancelled",
        description: data.refundAmount > 0 ? `Refund of $${data.refundAmount.toFixed(2)} will be processed within 5-10 business days` : data.refundReason
      });

      // Refresh bookings
      await fetchBookings();
      setCancelDialogOpen(false);
      setSelectedBooking(null);
    } catch (error) {
      console.error('Error cancelling booking:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to cancel booking",
        variant: "destructive"
      });
    } finally {
      setCancelling(false);
    }
  };

  const now = new Date();
  const upcomingBookings = bookings.filter(b => new Date(b.end_at) >= now && b.status !== 'canceled');
  const pastBookings = bookings.filter(b => new Date(b.end_at) < now || b.status === 'canceled');

  // Calendar view helpers
  const calendarDays = useMemo(() => {
    const start = startOfMonth(calendarMonth);
    const end = endOfMonth(calendarMonth);
    return eachDayOfInterval({ start, end });
  }, [calendarMonth]);

  const getBookingsForDate = (date: Date) => {
    return bookings.filter(b => {
      const bookingStart = new Date(b.start_at);
      return isSameDay(bookingStart, date);
    });
  };

  const bookingsForSelectedDate = selectedDate ? getBookingsForDate(selectedDate) : [];

  // Swipe navigation for calendar
  const calendarSwipeHandlers = useSwipeNavigation({
    onSwipeLeft: useCallback(() => setCalendarMonth(prev => addMonths(prev, 1)), []),
    onSwipeRight: useCallback(() => setCalendarMonth(prev => subMonths(prev, 1)), []),
  });

  // Get calendar dot color based on booking status and timing
  const getCalendarDotColor = (booking: any) => {
    const now = new Date();
    const start = new Date(booking.start_at);
    const end = new Date(booking.end_at);
    const status = booking.status;

    // Cancelled or refunded
    if (status === 'canceled' || status === 'refunded') {
      return 'bg-red-500';
    }

    // Declined/rejected
    if (status === 'declined' || status === 'rejected') {
      return 'bg-red-500';
    }

    // Pending (awaiting host confirmation)
    if (status === 'pending') {
      return 'bg-yellow-500';
    }

    // Completed (past end time or explicitly completed)
    if (status === 'completed' || now > end) {
      return 'bg-green-500'; // Green for completed
    }

    // Active (currently during the booking period)
    if (now >= start && now <= end && (status === 'active' || status === 'paid' || status === 'held')) {
      return 'bg-primary'; // Primary color for active
    }

    // Booked (future confirmed booking)
    if (now < start && (status === 'active' || status === 'paid' || status === 'held')) {
      return 'bg-blue-500';
    }

    return 'bg-gray-500';
  };
  const BookingCard = ({
    booking,
    isPast = false
  }: {
    booking: any;
    isPast?: boolean;
  }) => {
    const [imageError, setImageError] = useState(false);
    
    const isHost = booking.userRole === 'host';
    const isLinkedGuestBooking = booking.is_guest && booking.guest_user_id;
    const otherPartyId = isHost ? booking.renter_id : booking.spots?.host_id;
    const canExtend = !isPast && booking.status !== 'canceled' && booking.userRole === 'renter';
    
    // Compute primary photo URL
    const photos = booking.spots?.spot_photos || [];
    const primaryPhoto = photos.find((p: any) => p.is_primary);
    const fallbackPhoto = [...photos].sort((a: any, b: any) => 
      (a.sort_order ?? 0) - (b.sort_order ?? 0)
    )[0];
    const primaryPhotoUrl = primaryPhoto?.url || fallbackPhoto?.url || null;
    
    // Thumbnail component
    const SpotThumbnail = ({ size = 'mobile' }: { size?: 'mobile' | 'desktop' }) => {
      const sizeClasses = size === 'mobile' 
        ? 'h-14 w-14 rounded-lg' 
        : 'h-16 w-16 rounded-xl';
      
      if (primaryPhotoUrl && !imageError) {
        return (
          <img
            src={primaryPhotoUrl}
            alt={booking.spots?.title || 'Parking spot'}
            className={`${sizeClasses} object-cover border shrink-0`}
            loading="lazy"
            onError={() => setImageError(true)}
          />
        );
      }
      
      return (
        <div className={`${sizeClasses} bg-muted border flex items-center justify-center shrink-0`}>
          <MapPin className="h-5 w-5 text-muted-foreground" />
        </div>
      );
    };
    
    // Review-related logic
    const hasReviewed = userReviews.has(booking.id);
    const canReview = (booking.status === 'completed' || (isPast && booking.status === 'paid')) && 
                      booking.status !== 'canceled' && 
                      !hasReviewed;
    const revieweeId = isHost ? booking.renter_id : booking.spots?.host_id;
    const getRevieweeName = () => {
      if (isHost) {
        const renter = booking.renter;
        return renter?.first_name ? `${renter.first_name} ${renter.last_name || ''}`.trim() : 'Guest';
      } else {
        const hostProfile = booking.spots?.profiles;
        return hostProfile?.first_name ? `${hostProfile.first_name} ${hostProfile.last_name || ''}`.trim() : 'Host';
      }
    };
    
    const handleReview = (e: React.MouseEvent) => {
      e.stopPropagation();
      setReviewBooking({
        ...booking,
        revieweeId,
        revieweeName: getRevieweeName(),
        reviewerRole: isHost ? 'host' : 'driver'
      });
      setReviewModalOpen(true);
    };
    
    const handleGetDirections = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!booking.spots?.address) return;
      const address = encodeURIComponent(booking.spots.address);
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${address}`, '_blank');
    };

    const handleModify = (e: React.MouseEvent) => {
      e.stopPropagation();
      navigate(`/booking/${booking.id}`);
    };

    const handleExtend = (e: React.MouseEvent) => {
      e.stopPropagation();
      setExtendBooking(booking);
      setExtendDialogOpen(true);
    };

    const bookingStatusResult = getBookingStatus({
      status: booking.status,
      instantBook: booking.spots?.instant_book !== false,
      startAt: booking.start_at,
      endAt: booking.end_at,
      isHost
    });

    const hasOverstay = booking.overstay_charge_amount && booking.overstay_charge_amount > 0;

    const getStatusColor = () => {
      return getBookingStatusColorWithOverstay(bookingStatusResult.label, hasOverstay);
    };

    const getStatusText = () => {
      return getBookingStatusLabelWithOverstay(bookingStatusResult.label, hasOverstay);
    };

    return <Card 
      className="group cursor-pointer hover:shadow-elegant hover:border-primary/30 transition-all duration-300 overflow-hidden animate-fade-in" 
      onClick={() => navigate(`/booking/${booking.id}`)}
    >
        <CardContent className="p-0">
          {/* Mobile Compact Layout */}
          <div className="md:hidden">
            {/* Mobile Header - More Compact */}
            <div className="bg-gradient-to-br from-primary/5 via-primary/3 to-transparent p-3">
              <div className="flex items-start justify-between gap-2 mb-3">
                <SpotThumbnail size="mobile" />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-base truncate group-hover:text-primary transition-colors mb-1">
                    {booking.spots?.title || 'Parking Spot'}
                  </h3>
                  <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span className="line-clamp-1">{booking.spots?.address || 'Address not available'}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <Badge 
                    className={`text-xs border ${getStatusColor()}`}
                    variant="outline"
                  >
                    {getStatusText()}
                  </Badge>
                  {isHost && (
                    <Badge variant="outline" className="text-xs border-primary/20 bg-primary/5">
                      Host
                    </Badge>
                  )}
                  {isLinkedGuestBooking && !isHost && (
                    <Badge variant="outline" className="text-xs border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
                      Linked
                    </Badge>
                  )}
                </div>
              </div>

              {/* Mobile Date/Time - Horizontal Compact */}
              <div className="flex items-center gap-2 text-xs">
                <div className="flex items-center gap-1.5 flex-1 bg-background/60 backdrop-blur-sm rounded-md px-2 py-1.5 border border-border/50">
                  <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="font-medium truncate">{formatDate(booking.start_at)}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-1 bg-background/60 backdrop-blur-sm rounded-md px-2 py-1.5 border border-border/50">
                  <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="font-medium truncate text-xs">{formatTime(booking.start_at, booking.end_at)}</span>
                </div>
              </div>
            </div>

            {/* Mobile Price - More Compact */}
            <div className="px-3 py-2.5 bg-muted/30 border-t flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Total</span>
              <span className="text-xl font-bold text-primary">${Number(booking.total_amount).toFixed(2)}</span>
            </div>

            {/* Mobile Actions - Icon Only */}
            <TooltipProvider>
              <div className="p-3 flex gap-2 border-t bg-background" onClick={(e) => e.stopPropagation()}>
                {booking.userRole === 'renter' && (
                  <>
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
                      <TooltipContent>Directions</TooltipContent>
                    </Tooltip>
                    {canExtend && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="icon"
                            className="flex-1 hover:bg-green-50 hover:text-green-600 hover:border-green-300 transition-colors"
                            onClick={handleExtend}
                          >
                            <AlarmClockPlus className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Extend</TooltipContent>
                      </Tooltip>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          variant="outline" 
                          size="icon"
                          className="flex-1 hover:bg-primary/5 hover:text-primary hover:border-primary/30 transition-colors"
                          onClick={handleModify}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Details</TooltipContent>
                    </Tooltip>
                  </>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="icon"
                      className="flex-1 hover:bg-primary/5 hover:text-primary hover:border-primary/30 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (otherPartyId) {
                          navigate(`/messages?userId=${otherPartyId}`);
                        }
                      }} 
                      disabled={!otherPartyId}
                    >
                      <MessageCircle className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Message</TooltipContent>
                </Tooltip>
                {canReview ? (
                  isHost ? (
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="flex-1 hover:bg-yellow-50 hover:text-yellow-600 hover:border-yellow-300 transition-colors"
                      onClick={handleReview}
                    >
                      <Star className="h-4 w-4 mr-1" />
                      Review
                    </Button>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          variant="outline" 
                          size="icon"
                          className="flex-1 hover:bg-yellow-50 hover:text-yellow-600 hover:border-yellow-300 transition-colors"
                          onClick={handleReview}
                        >
                          <Star className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Review</TooltipContent>
                    </Tooltip>
                  )
                ) : hasReviewed && isPast && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        variant="outline" 
                        size="icon"
                        className="flex-1 bg-yellow-50 text-yellow-600 border-yellow-300 cursor-default"
                        disabled
                      >
                        <Star className="h-4 w-4 fill-yellow-400" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Review submitted - awaiting reveal</TooltipContent>
                  </Tooltip>
                )}
                {!isPast && booking.status !== 'canceled' && booking.userRole === 'renter' && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        variant="destructive" 
                        size="icon"
                        className="flex-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedBooking(booking);
                          setCancelDialogOpen(true);
                        }}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Cancel</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </TooltipProvider>
          </div>

          {/* Desktop Layout - Unchanged */}
          <div className="hidden md:block">
            {/* Header Section with Gradient Background */}
            <div className="bg-gradient-to-br from-primary/5 via-primary/3 to-transparent p-5 pb-4">
              <div className="flex items-start justify-between gap-3 mb-4">
                <SpotThumbnail size="desktop" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold text-lg truncate group-hover:text-primary transition-colors">
                      {booking.spots?.title || 'Parking Spot'}
                    </h3>
                    {isHost && (
                      <Badge variant="outline" className="text-xs shrink-0 border-primary/20 bg-primary/5">
                        As Host
                      </Badge>
                    )}
                    {isLinkedGuestBooking && !isHost && (
                      <Badge variant="outline" className="text-xs shrink-0 border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
                        Linked Guest Booking
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                    <span className="line-clamp-1">{booking.spots?.address || 'Address not available'}</span>
                  </div>
                </div>
                <Badge 
                  className={`shrink-0 border ${getStatusColor()}`}
                  variant="outline"
                >
                  {getStatusText()}
                </Badge>
              </div>

              {/* Date and Time Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2.5 bg-background/60 backdrop-blur-sm rounded-lg px-3 py-2.5 border border-border/50">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Calendar className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground font-medium mb-0.5">Date</p>
                    <p className="text-sm font-semibold truncate">{formatDate(booking.start_at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 bg-background/60 backdrop-blur-sm rounded-lg px-3 py-2.5 border border-border/50">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Clock className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground font-medium mb-0.5">Time</p>
                    <p className="text-sm font-semibold truncate">{formatTime(booking.start_at, booking.end_at)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Price Section */}
            <div className="px-5 py-4 bg-muted/30 border-t">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground font-medium">Total Amount</span>
                <span className="text-2xl font-bold text-primary">${Number(booking.total_amount).toFixed(2)}</span>
              </div>
              {booking.overstay_charge_amount && booking.overstay_charge_amount > 0 && (
                <div className="flex items-center justify-between mt-2 pt-2 border-t">
                  <span className="text-xs text-yellow-600 dark:text-yellow-500">Overstay Charge</span>
                  <span className="text-sm font-semibold text-yellow-600 dark:text-yellow-500">
                    +${Number(booking.overstay_charge_amount).toFixed(2)}
                  </span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="p-4 flex gap-2 border-t bg-background" onClick={(e) => e.stopPropagation()}>
              {booking.userRole === 'renter' && (
                <>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1 hover:bg-primary/5 hover:text-primary hover:border-primary/30 transition-colors"
                    onClick={handleGetDirections}
                  >
                    <Navigation className="h-4 w-4 mr-2" />
                    Directions
                  </Button>
                  {canExtend && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1 hover:bg-green-50 hover:text-green-600 hover:border-green-300 transition-colors"
                      onClick={handleExtend}
                    >
                      <AlarmClockPlus className="h-4 w-4 mr-2" />
                      Extend
                    </Button>
                  )}
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1 hover:bg-primary/5 hover:text-primary hover:border-primary/30 transition-colors"
                    onClick={handleModify}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Details
                  </Button>
                </>
              )}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="icon"
                      className="shrink-0 hover:bg-primary/5 hover:text-primary hover:border-primary/30 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (otherPartyId) {
                          navigate(`/messages?userId=${otherPartyId}`);
                        }
                      }} 
                      disabled={!otherPartyId}
                    >
                      <MessageCircle className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Message</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {canReview ? (
                isHost ? (
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="hover:bg-yellow-50 hover:text-yellow-600 hover:border-yellow-300 transition-colors"
                    onClick={handleReview}
                  >
                    <Star className="h-4 w-4 mr-2" />
                    Review Guest
                  </Button>
                ) : (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          variant="outline" 
                          size="icon"
                          className="shrink-0 hover:bg-yellow-50 hover:text-yellow-600 hover:border-yellow-300 transition-colors"
                          onClick={handleReview}
                        >
                          <Star className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Review</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )
              ) : hasReviewed && isPast && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        variant="outline" 
                        size="icon"
                        className="shrink-0 bg-yellow-50 text-yellow-600 border-yellow-300 cursor-default"
                        disabled
                      >
                        <Star className="h-4 w-4 fill-yellow-400" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Review submitted - awaiting reveal</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {!isPast && booking.status !== 'canceled' && booking.userRole === 'renter' && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        variant="destructive" 
                        size="icon"
                        className="shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedBooking(booking);
                          setCancelDialogOpen(true);
                        }}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Cancel</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
        </CardContent>
      </Card>;
  };
  return <div className="bg-background">
      <div className="p-4 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{mode === 'host' ? 'Reservations' : 'My Reservations'}</h1>
            <p className="text-sm text-muted-foreground">
              {mode === 'host' ? 'Manage reservations at your spots' : 'View your parking reservations'}
            </p>
          </div>
          <ToggleGroup type="single" value={viewMode} onValueChange={(v) => v && setViewMode(v as 'list' | 'calendar')}>
            <ToggleGroupItem value="list" aria-label="List view" className="px-3">
              <List className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="calendar" aria-label="Calendar view" className="px-3">
              <CalendarDays className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* Active booking banner for quick management */}
        <ActiveBookingBanner />

        {viewMode === 'list' ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
              <TabsTrigger value="past">Past</TabsTrigger>
            </TabsList>
            
            <TabsContent value="upcoming" className="space-y-3 mt-4">
              {loading ? <div className="space-y-3">
                  {[1, 2].map(i => <Card key={i}>
                      <CardContent className="p-4">
                        <Skeleton className="h-20 w-full" />
                      </CardContent>
                    </Card>)}
                </div> : upcomingBookings.length === 0 ? <Card>
                  <CardContent className="p-8 text-center">
                    <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="font-semibold mb-2">
                      {mode === 'host' ? 'No upcoming reservations' : 'No upcoming bookings'}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      {mode === 'host' ? 'Reservations for your spots will appear here' : 'Start exploring parking spots near you'}
                    </p>
                    {mode === 'driver' && <Button onClick={() => {
                  const now = new Date();
                  const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
                  
                  if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                      (position) => {
                        navigate(`/explore?lat=${position.coords.latitude}&lng=${position.coords.longitude}&start=${now.toISOString()}&end=${twoHoursLater.toISOString()}`);
                      },
                      (error) => {
                        console.error('Location error:', error);
                        navigate(`/explore?start=${now.toISOString()}&end=${twoHoursLater.toISOString()}`);
                      }
                    );
                  } else {
                    navigate(`/explore?start=${now.toISOString()}&end=${twoHoursLater.toISOString()}`);
                  }
                }}>
                        Find Parking
                      </Button>}
                  </CardContent>
                </Card> : upcomingBookings.map(booking => <BookingCard key={booking.id} booking={booking} isPast={false} />)}
            </TabsContent>
            
            <TabsContent value="past" className="space-y-3 mt-4">
              {loading ? <div className="space-y-3">
                  {[1, 2].map(i => <Card key={i}>
                      <CardContent className="p-4">
                        <Skeleton className="h-20 w-full" />
                      </CardContent>
                    </Card>)}
                </div> : pastBookings.length === 0 ? <Card>
                  <CardContent className="p-8 text-center">
                    <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="font-semibold mb-2">No past bookings</h3>
                    <p className="text-sm text-muted-foreground">
                      Your completed bookings will appear here
                    </p>
                  </CardContent>
                </Card> : pastBookings.map(booking => <BookingCard key={booking.id} booking={booking} isPast={true} />)}
            </TabsContent>
          </Tabs>
        ) : (
          /* Calendar View */
          <div className="space-y-4">
            {/* Month Navigation */}
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))}>
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <h2 className="text-lg font-semibold">
                {format(calendarMonth, 'MMMM yyyy')}
              </h2>
              <Button variant="ghost" size="icon" onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))}>
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>

            {/* Calendar Grid */}
            <Card>
              <CardContent className="p-3">
                {/* Day headers */}
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
                      {day}
                    </div>
                  ))}
                </div>

                {/* Calendar days */}
                <div className="grid grid-cols-7 gap-1" {...calendarSwipeHandlers}>
                  {/* Empty cells for days before the first of the month */}
                  {Array.from({ length: calendarDays[0]?.getDay() || 0 }).map((_, i) => (
                    <div key={`empty-${i}`} className="aspect-square" />
                  ))}

                  {calendarDays.map(day => {
                    const dayBookings = getBookingsForDate(day);
                    const hasBookings = dayBookings.length > 0;
                    const isSelected = selectedDate && isSameDay(day, selectedDate);
                    const dayIsToday = isToday(day);

                    return (
                      <button
                        key={day.toISOString()}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setSelectedDate(isSelected ? null : day)}
                        className={`
                          aspect-square rounded-lg p-1 text-sm relative transition-colors
                          ${isSelected 
                            ? 'bg-primary text-primary-foreground font-medium' 
                            : 'text-foreground hover:bg-muted'}
                          ${dayIsToday && !isSelected ? 'border-2 border-primary' : ''}
                        `}
                      >
                        <span className={dayIsToday && !isSelected ? 'font-bold' : ''}>
                          {format(day, 'd')}
                        </span>
                        {hasBookings && (
                          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                            {dayBookings.slice(0, 3).map((b, i) => (
                              <span
                                key={i}
                                className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-primary-foreground' : getCalendarDotColor(b)}`}
                              />
                            ))}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Selected Date Bookings */}
            {selectedDate && (
              <div className="space-y-3">
                <h3 className="font-semibold text-lg">
                  {format(selectedDate, 'EEEE, MMMM d, yyyy')}
                </h3>
                {loading ? (
                  <Card>
                    <CardContent className="p-4">
                      <Skeleton className="h-20 w-full" />
                    </CardContent>
                  </Card>
                ) : bookingsForSelectedDate.length === 0 ? (
                  <Card>
                    <CardContent className="p-6 text-center">
                      <p className="text-muted-foreground text-sm">No reservations on this date</p>
                    </CardContent>
                  </Card>
                ) : (
                  bookingsForSelectedDate.map(booking => (
                    <BookingCard 
                      key={booking.id} 
                      booking={booking} 
                      isPast={new Date(booking.end_at) < now || booking.status === 'canceled'} 
                    />
                  ))
                )}
              </div>
            )}

            {/* Legend */}
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                Booked
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-primary" />
                Active
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                Completed
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-yellow-500" />
                Requested
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                Cancelled
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Cancellation Confirmation Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Booking?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Are you sure you want to cancel this booking?</p>
              {selectedBooking && <div className="mt-4 p-3 bg-muted rounded-lg">
                  <p className="font-semibold text-foreground">{selectedBooking.spots?.title}</p>
                  <p className="text-sm mt-1">{formatDate(selectedBooking.start_at)}</p>
                  <p className="text-sm">{formatTime(selectedBooking.start_at, selectedBooking.end_at)}</p>
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-sm font-semibold text-foreground">
                      {getCancellationPolicy(selectedBooking).message}
                    </p>
                  </div>
                </div>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Keep Booking</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelBooking} disabled={cancelling} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {cancelling ? 'Cancelling...' : 'Cancel Booking'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Review Modal */}
      {reviewBooking && (
        <ReviewModal
          open={reviewModalOpen}
          onOpenChange={setReviewModalOpen}
          bookingId={reviewBooking.id}
          revieweeId={reviewBooking.revieweeId}
          revieweeName={reviewBooking.revieweeName}
          reviewerRole={reviewBooking.reviewerRole}
          onReviewSubmitted={() => {
            setUserReviews(prev => new Set([...prev, reviewBooking.id]));
            setReviewBooking(null);
          }}
        />
      )}

      {/* Extend Parking Dialog */}
      <ExtendParkingDialog
        open={extendDialogOpen}
        onOpenChange={(open) => {
          setExtendDialogOpen(open);
          if (!open) setExtendBooking(null);
        }}
        booking={extendBooking}
        onExtendSuccess={fetchBookings}
      />
    </div>;
};
export default Activity;