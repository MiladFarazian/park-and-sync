import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, LayoutGrid, Clock, DollarSign, User, MapPin, Settings, List, MessageCircle, Star, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addDays, addMonths, addWeeks, isSameDay, isBefore, startOfDay, isToday, startOfWeek, endOfWeek } from 'date-fns';
import { cn } from '@/lib/utils';
import { getStreetAddress } from '@/lib/addressUtils';
import { ReviewModal } from '@/components/booking/ReviewModal';
import { useToast } from '@/hooks/use-toast';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';
import { getHostNetEarnings } from '@/lib/hostEarnings';

interface SpotWithRate {
  id: string;
  address: string;
  hourly_rate: number;
}

interface BookingForCalendar {
  id: string;
  spot_id: string;
  start_at: string;
  end_at: string;
  status: string;
  total_amount: number;
  host_earnings?: number | null;
  hourly_rate?: number;
  extension_charges?: number | null;
  is_guest?: boolean;
  guest_full_name?: string | null;
  will_use_ev_charging?: boolean | null;
  ev_charging_fee?: number | null;
  renter?: {
    first_name: string | null;
    last_name: string | null;
  };
  spot?: {
    title: string;
    address?: string;
  };
}

interface CalendarOverride {
  id?: string;
  spot_id: string;
  override_date: string;
  is_available: boolean;
  start_time?: string | null;
  end_time?: string | null;
  custom_rate?: number;
}

interface AvailabilityRule {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available: boolean | null;
  custom_rate: number | null;
}

type ViewMode = 'month' | 'week' | 'reservations';

const HostCalendar = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const { user } = useAuth();
  
  const initialViewMode = searchParams.get('tab') === 'reservations' ? 'reservations' : 'month';
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [spots, setSpots] = useState<SpotWithRate[]>([]);
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null); // null means loading, 'all' means all spots
  const [bookings, setBookings] = useState<BookingForCalendar[]>([]);
  const [allBookings, setAllBookings] = useState<any[]>([]);
  const [overrides, setOverrides] = useState<CalendarOverride[]>([]);
  const [availabilityRules, setAvailabilityRules] = useState<AvailabilityRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [reservationsLoading, setReservationsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reservationsTab, setReservationsTab] = useState<'upcoming' | 'past'>('upcoming');
  
  // Review modal state
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewBooking, setReviewBooking] = useState<any>(null);
  const [userReviews, setUserReviews] = useState<Set<string>>(new Set());

  const handleViewModeChange = (value: string) => {
    setViewMode(value as ViewMode);
    if (value === 'reservations') {
      setSearchParams({ tab: 'reservations' });
    } else {
      setSearchParams({});
    }
  };

  useEffect(() => {
    // Sync view mode from URL on mount/change
    const tabParam = searchParams.get('tab');
    if (tabParam === 'reservations') {
      setViewMode('reservations');
    }
  }, [searchParams]);

  useEffect(() => {
    if (user) {
      fetchSpots();
    }
  }, [user]);

  useEffect(() => {
    if (user && selectedSpotId && selectedSpotId !== 'none') {
      fetchData();
      fetchAllReservations();
    }
  }, [user, currentMonth, currentWeek, viewMode, selectedSpotId]);

  const fetchSpots = async () => {
    if (!user) return;
    
    try {
      const { data: spotsData, error: spotsError } = await supabase
        .from('spots')
        .select('id, address, hourly_rate')
        .eq('host_id', user.id);

      if (spotsError) throw spotsError;
      setSpots(spotsData || []);
      
      // Auto-select first spot if available, or 'none' if no spots exist
      if (spotsData && spotsData.length > 0 && !selectedSpotId) {
        setSelectedSpotId(spotsData[0].id);
      } else if ((!spotsData || spotsData.length === 0) && !selectedSpotId) {
        // Set a placeholder value so the calendar can render
        setSelectedSpotId('none');
      }
      setLoading(false);
    } catch (error) {
      console.error('Error fetching spots:', error);
      setLoading(false);
    }
  };

  const fetchData = async () => {
    if (!user || !selectedSpotId) return;
    
    try {
      setLoading(true);
      let rangeStart: Date, rangeEnd: Date;
      
      if (viewMode === 'month') {
        rangeStart = startOfMonth(currentMonth);
        rangeEnd = endOfMonth(currentMonth);
      } else {
        rangeStart = startOfWeek(currentWeek, { weekStartsOn: 0 });
        rangeEnd = endOfWeek(currentWeek, { weekStartsOn: 0 });
      }

      const isAllSpots = selectedSpotId === 'all';
      const spotIds = isAllSpots ? spots.map(s => s.id) : [selectedSpotId];

      // Fetch bookings for selected spot(s)
      let bookingsQuery = supabase
        .from('bookings')
        .select(`
          id, spot_id, start_at, end_at, status, total_amount, host_earnings, hourly_rate, extension_charges, is_guest, guest_full_name,
          renter:profiles!bookings_renter_id_fkey(first_name, last_name),
          spot:spots!bookings_spot_id_fkey(title, address)
        `)
        .gte('start_at', rangeStart.toISOString())
        .lte('start_at', rangeEnd.toISOString())
        .in('status', ['pending', 'paid', 'active', 'completed']);

      if (isAllSpots) {
        bookingsQuery = bookingsQuery.in('spot_id', spotIds);
      } else {
        bookingsQuery = bookingsQuery.eq('spot_id', selectedSpotId);
      }

      const { data: bookingsData, error: bookingsError } = await bookingsQuery;

      if (bookingsError) throw bookingsError;
      setBookings(bookingsData || []);

      // Fetch calendar overrides (only for single spot - skip for "all")
      if (!isAllSpots) {
        const { data: overridesData, error: overridesError } = await supabase
          .from('calendar_overrides')
          .select('id, spot_id, override_date, is_available, start_time, end_time, custom_rate')
          .eq('spot_id', selectedSpotId)
          .gte('override_date', format(rangeStart, 'yyyy-MM-dd'))
          .lte('override_date', format(rangeEnd, 'yyyy-MM-dd'));

        if (overridesError) throw overridesError;
        setOverrides(overridesData || []);

        // Fetch availability rules for the spot
        const { data: rulesData, error: rulesError } = await supabase
          .from('availability_rules')
          .select('day_of_week, start_time, end_time, is_available, custom_rate')
          .eq('spot_id', selectedSpotId);

        if (rulesError) throw rulesError;
        setAvailabilityRules(rulesData || []);
      } else {
        setOverrides([]);
        setAvailabilityRules([]);
      }

    } catch (error) {
      console.error('Error fetching calendar data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllReservations = async () => {
    if (!user || !selectedSpotId) return;
    
    try {
      setReservationsLoading(true);
      
      // Fetch user's existing reviews
      const { data: reviewsData } = await supabase
        .from('reviews')
        .select('booking_id')
        .eq('reviewer_id', user.id);
      
      setUserReviews(new Set(reviewsData?.map(r => r.booking_id) || []));

      const isAllSpots = selectedSpotId === 'all';
      const spotIds = isAllSpots ? spots.map(s => s.id) : [selectedSpotId];

      // Fetch all bookings for the selected spot(s)
      let bookingsQuery = supabase
        .from('bookings')
        .select(`
          *,
          spots!inner (
            title,
            address,
            host_id
          ),
          renter:profiles!bookings_renter_id_fkey (
            first_name,
            last_name
          )
        `)
        .order('start_at', { ascending: false });

      if (isAllSpots) {
        bookingsQuery = bookingsQuery.in('spot_id', spotIds);
      } else {
        bookingsQuery = bookingsQuery.eq('spot_id', selectedSpotId);
      }

      const { data: hostBookings, error: hostError } = await bookingsQuery;

      if (hostError) throw hostError;
      setAllBookings((hostBookings || []).map(b => ({ ...b, userRole: 'host' })));
    } catch (error) {
      console.error('Error fetching reservations:', error);
      toast({
        title: "Error",
        description: "Failed to load reservations",
        variant: "destructive"
      });
    } finally {
      setReservationsLoading(false);
    }
  };

  // Generate calendar grid for month view
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const startDay = getDay(monthStart);
    
    const days: { date: Date; isCurrentMonth: boolean }[] = [];
    
    // Previous month days
    for (let i = startDay - 1; i >= 0; i--) {
      days.push({
        date: addDays(monthStart, -i - 1),
        isCurrentMonth: false
      });
    }
    days.reverse();
    
    // Current month days
    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
    daysInMonth.forEach(date => {
      days.push({ date, isCurrentMonth: true });
    });
    
    // Next month days to fill grid
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        date: addDays(monthEnd, i),
        isCurrentMonth: false
      });
    }
    
    return days;
  }, [currentMonth]);

  // Generate week days for week view
  const weekDays = useMemo(() => {
    const weekStart = startOfWeek(currentWeek, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });
  }, [currentWeek]);

  // Get data for a specific date (for the selected spot)
  const selectedSpot = spots.find(s => s.id === selectedSpotId);
  const isAllSpotsView = selectedSpotId === 'all';

  // Helper to format time from HH:MM:SS to readable format
  const formatTimeDisplay = (time: string): string => {
    const [hours, minutes] = time.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };
  
  const getDateData = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const today = startOfDay(new Date());
    const isPast = isBefore(date, today);
    const dayOfWeek = getDay(date);
    
    // Get bookings for this date
    const dateBookings = bookings.filter(b => {
      const bookingDate = new Date(b.start_at);
      return isSameDay(bookingDate, date);
    });

    // Get overrides for this date (only for single spot view)
    const dateOverrides = overrides.filter(o => o.override_date === dateStr);
    const override = dateOverrides[0];
    const hasUnavailable = dateOverrides.some(o => !o.is_available);
    
    // Get weekly rule for this day
    const dayRule = availabilityRules.find(r => r.day_of_week === dayOfWeek);
    
    // Calculate rate to show (only for single spot view, null for "all spots")
    let displayRate: number | null = null;
    if (!isAllSpotsView && selectedSpot) {
      displayRate = selectedSpot.hourly_rate;
      const customRate = dateOverrides.find(o => o.custom_rate)?.custom_rate;
      if (customRate) displayRate = customRate;
      else if (dayRule?.custom_rate) displayRate = dayRule.custom_rate;
    }

    // Determine available hours display
    let availableHours: string | null = null;
    if (!isAllSpotsView) {
      if (override) {
        // Date override takes precedence
        if (!override.is_available) {
          availableHours = 'Blocked';
        } else if (override.start_time && override.end_time) {
          // Treat 00:00-23:59 as "Available all day"
          const isFullDay = override.start_time === '00:00' && override.end_time === '23:59';
          availableHours = isFullDay ? 'Available all day' : `${formatTimeDisplay(override.start_time)} - ${formatTimeDisplay(override.end_time)}`;
        } else {
          availableHours = 'Available all day';
        }
      } else if (dayRule) {
        // Fall back to weekly rule
        if (dayRule.is_available === false) {
          availableHours = 'Blocked (recurring)';
        } else {
          availableHours = `${formatTimeDisplay(dayRule.start_time)} - ${formatTimeDisplay(dayRule.end_time)} (recurring)`;
        }
      } else {
        availableHours = 'No schedule set';
      }
    }

    return {
      bookings: dateBookings,
      overrides: dateOverrides,
      isUnavailable: hasUnavailable,
      rate: displayRate,
      isPast,
      hasBookings: dateBookings.length > 0,
      availableHours
    };
  };

  const handleDayClick = (date: Date) => {
    setSelectedDate(date);
    setSheetOpen(true);
  };

  const selectedDateData = selectedDate ? getDateData(selectedDate) : null;

  // Swipe navigation for calendar
  const monthSwipeHandlers = useSwipeNavigation({
    onSwipeLeft: useCallback(() => setCurrentMonth(prev => addMonths(prev, 1)), []),
    onSwipeRight: useCallback(() => setCurrentMonth(prev => addMonths(prev, -1)), []),
  });

  const weekSwipeHandlers = useSwipeNavigation({
    onSwipeLeft: useCallback(() => setCurrentWeek(prev => addWeeks(prev, 1)), []),
    onSwipeRight: useCallback(() => setCurrentWeek(prev => addWeeks(prev, -1)), []),
  });

  // Reservations helpers
  const now = new Date();
  const upcomingBookings = allBookings.filter(b => new Date(b.end_at) >= now && b.status !== 'canceled');
  const pastBookings = allBookings.filter(b => new Date(b.end_at) < now || b.status === 'canceled');

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

  const getStatusColor = (status: string, isPast: boolean) => {
    if (status === 'canceled') return 'bg-destructive/10 text-destructive border-destructive/20';
    if (status === 'completed') {
      return 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-500 border-green-200 dark:border-green-800';
    }
    if (isPast) return 'bg-muted text-muted-foreground border-border';
    return 'bg-primary/10 text-primary border-primary/20';
  };

  const getStatusText = (status: string, isPast: boolean) => {
    if (status === 'canceled') return 'Cancelled';
    if (status === 'completed') return 'Completed';
    if (status === 'paid') return isPast ? 'Completed' : 'Confirmed';
    if (status === 'active') return 'Active';
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const ReservationCard = ({ booking, isPast = false }: { booking: any; isPast?: boolean }) => {
    const canReview = (booking.status === 'completed' || (isPast && booking.status === 'paid')) && 
                      booking.status !== 'canceled' && 
                      !userReviews.has(booking.id);

    const handleReview = (e: React.MouseEvent) => {
      e.stopPropagation();
      const renter = booking.renter;
      const isGuestBooking = booking.is_guest === true;
      setReviewBooking({
        ...booking,
        revieweeId: booking.renter_id,
        revieweeName: isGuestBooking 
          ? (booking.guest_full_name || 'Guest')
          : (renter?.first_name ? `${renter.first_name} ${renter.last_name || ''}`.trim() : 'Guest'),
        reviewerRole: 'host'
      });
      setReviewModalOpen(true);
    };

    return (
      <Card 
        className="group cursor-pointer hover:shadow-elegant hover:border-primary/30 transition-all duration-300 overflow-hidden"
        onClick={() => navigate(`/booking/${booking.id}`)}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-base truncate group-hover:text-primary transition-colors">
                {getStreetAddress(booking.spots?.address) || 'Parking Spot'}
              </h3>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
                <User className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {booking.is_guest 
                    ? (booking.guest_full_name || 'Guest')
                    : `${booking.renter?.first_name || 'Guest'} ${booking.renter?.last_name?.[0] || ''}.`
                  }
                </span>
              </div>
            </div>
            <Badge 
              className={`text-xs border ${getStatusColor(booking.status, isPast)}`}
              variant="outline"
            >
              {getStatusText(booking.status, isPast)}
            </Badge>
          </div>

          <div className="flex items-center gap-2 text-sm mb-3">
            <div className="flex items-center gap-1.5 flex-1 bg-muted/50 rounded-md px-2 py-1.5">
              <CalendarIcon className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="font-medium truncate">{formatDate(booking.start_at)}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-1 bg-muted/50 rounded-md px-2 py-1.5">
              <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="font-medium truncate text-xs">{formatTime(booking.start_at, booking.end_at)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-primary">${getHostNetEarnings(booking).toFixed(2)}</span>
              {booking.will_use_ev_charging && (
                <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 text-xs px-1.5 py-0.5">
                  <Zap className="h-3 w-3 mr-0.5" />
                  EV
                </Badge>
              )}
            </div>
            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
              <Button 
                variant="outline" 
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/messages?userId=${booking.renter_id}`);
                }}
              >
                <MessageCircle className="h-4 w-4" />
              </Button>
              {canReview && (
                <Button 
                  variant="outline" 
                  size="sm"
                  className="hover:bg-yellow-50 hover:text-yellow-600 hover:border-yellow-300"
                  onClick={handleReview}
                >
                  <Star className="h-4 w-4 mr-1" />
                  Review
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (!user) {
    return (
      <div className="p-4">
        <Card className="p-6 text-center">
          <p className="text-muted-foreground">Please sign in to view your calendar.</p>
          <Button onClick={() => navigate('/auth')} className="mt-4">Sign In</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden flex flex-col gap-4 p-4 pb-20 pb-[calc(5rem+env(safe-area-inset-bottom))]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Calendar</h1>
          <p className="text-sm text-muted-foreground">View bookings & availability</p>
        </div>
        {/* View Toggle - Month / Week / Reservations */}
        <Tabs value={viewMode} onValueChange={handleViewModeChange}>
          <TabsList className="h-9">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <TabsTrigger value="month" className="px-3">
                      <LayoutGrid className="h-4 w-4" />
                    </TabsTrigger>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Month view</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <TabsTrigger value="week" className="px-3">
                      <CalendarIcon className="h-4 w-4" />
                    </TabsTrigger>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Week view</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <TabsTrigger value="reservations" className="px-3">
                      <List className="h-4 w-4" />
                    </TabsTrigger>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Reservations</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </TabsList>
        </Tabs>
      </div>

      {/* Spot Selector */}
      {spots.length > 0 && (
        <Select value={selectedSpotId || ''} onValueChange={setSelectedSpotId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a spot" />
          </SelectTrigger>
          <SelectContent>
            {spots.length > 1 && (
              <SelectItem value="all">
                <div className="flex items-center gap-2 max-w-full overflow-hidden">
                  <LayoutGrid className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="font-medium">All Spots</span>
                </div>
              </SelectItem>
            )}
            {spots.map(spot => (
              <SelectItem key={spot.id} value={spot.id}>
                <div className="flex items-center gap-2 max-w-full overflow-hidden">
                  <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="truncate">{spot.address}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {spots.length === 0 && !loading && (
        <Card className="p-3 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">You don't have any spots yet.</p>
          <Button size="sm" onClick={() => navigate('/list-spot')}>List a Spot</Button>
        </Card>
      )}

      {/* Calendar Views (Month & Week) */}
      {selectedSpotId && (viewMode === 'month' || viewMode === 'week') && (
        <Card className="p-4">
          {/* Navigation */}
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => viewMode === 'month' 
                ? setCurrentMonth(addMonths(currentMonth, -1))
                : setCurrentWeek(addWeeks(currentWeek, -1))
              }
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h2 className="text-xl font-bold">
              {viewMode === 'month' 
                ? format(currentMonth, 'MMMM yyyy')
                : `${format(startOfWeek(currentWeek, { weekStartsOn: 0 }), 'MMM d')} - ${format(endOfWeek(currentWeek, { weekStartsOn: 0 }), 'MMM d, yyyy')}`
              }
            </h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => viewMode === 'month'
                ? setCurrentMonth(addMonths(currentMonth, 1))
                : setCurrentWeek(addWeeks(currentWeek, 1))
              }
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>

          {/* Day Headers - Month view only */}
          {viewMode === 'month' && (
            <div className="grid grid-cols-7 gap-1 mb-2">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                <div key={i} className="text-xs text-muted-foreground text-center font-medium py-1">
                  {day}
                </div>
              ))}
            </div>
          )}

          {/* Calendar Grid */}
          {loading ? (
            viewMode === 'month' ? (
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 35 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-square" />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {Array.from({ length: 7 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            )
          ) : viewMode === 'month' ? (
            // Month View
            <div 
              className="grid grid-cols-7 gap-1"
              {...monthSwipeHandlers}
            >
              {calendarDays.map(({ date, isCurrentMonth }, index) => {
                const { bookings: dayBookings, isUnavailable, rate, isPast, hasBookings } = getDateData(date);
                const isTodayDate = isToday(date);
                
                return (
                  <button
                    key={index}
                    onClick={() => isCurrentMonth && handleDayClick(date)}
                    disabled={!isCurrentMonth}
                    className={cn(
                      "aspect-square p-0.5 rounded-md border transition-all flex flex-col text-left",
                      !isCurrentMonth && "opacity-30 cursor-default",
                      isCurrentMonth && "hover:border-primary cursor-pointer",
                      isTodayDate && "ring-2 ring-primary",
                      isUnavailable && isCurrentMonth && "bg-destructive/10",
                      hasBookings && isCurrentMonth && !isUnavailable && "bg-green-500/10",
                      isPast && isCurrentMonth && "bg-muted/50"
                    )}
                  >
                    {/* Date Number */}
                    <div className="text-xs font-medium text-center w-full">
                      {format(date, 'd')}
                    </div>
                    
                    {isCurrentMonth && (
                      <div className="flex-1 flex flex-col justify-between overflow-hidden">
                        {/* Rate */}
                        {rate !== null && !isUnavailable && (
                          <div className="text-[10px] text-green-600 dark:text-green-400 font-semibold text-center truncate">
                            ${rate}
                          </div>
                        )}
                        
                        {/* Unavailable indicator */}
                        {isUnavailable && (
                          <div className="text-[8px] text-destructive text-center leading-tight">
                            Unavail.
                          </div>
                        )}
                        
                        {/* Bookings */}
                        {dayBookings.length > 0 && (
                          <div className="space-y-0.5">
                            {dayBookings.slice(0, 2).map((booking) => (
                              <div
                                key={booking.id}
                                className={cn(
                                  "text-[8px] leading-tight text-center rounded px-0.5 truncate",
                                  booking.status === 'completed' ? "bg-muted text-muted-foreground" :
                                  booking.status === 'active' ? "bg-primary/20 text-primary" :
                                  "bg-blue-500/20 text-blue-700 dark:text-blue-300"
                                )}
                              >
                                {format(new Date(booking.start_at), 'ha')}
                              </div>
                            ))}
                            {dayBookings.length > 2 && (
                              <div className="text-[8px] text-muted-foreground text-center">
                                +{dayBookings.length - 2}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            // Week View - Vertical layout for mobile
            <div className="space-y-2" {...weekSwipeHandlers}>
              {weekDays.map((date, index) => {
                const { bookings: dayBookings, isUnavailable, rate, isPast, hasBookings } = getDateData(date);
                const isTodayDate = isToday(date);
                
                return (
                  <button
                    key={index}
                    onClick={() => handleDayClick(date)}
                    className={cn(
                      "w-full p-3 rounded-lg border transition-all flex items-start gap-3 text-left",
                      "hover:border-primary cursor-pointer",
                      isTodayDate && "ring-2 ring-primary bg-primary/5",
                      isUnavailable && !isTodayDate && "bg-destructive/10",
                      hasBookings && !isUnavailable && !isTodayDate && "bg-green-500/5",
                      isPast && !isTodayDate && "bg-muted/30"
                    )}
                  >
                    {/* Date column */}
                    <div className="flex flex-col items-center min-w-[50px]">
                      <div className="text-xs text-muted-foreground font-medium">
                        {format(date, 'EEE')}
                      </div>
                      <div className={cn(
                        "text-xl font-bold flex items-center justify-center w-10 h-10 rounded-full",
                        isTodayDate && "bg-primary text-primary-foreground"
                      )}>
                        {format(date, 'd')}
                      </div>
                      {rate !== null && !isUnavailable && (
                        <div className="text-xs text-green-600 dark:text-green-400 font-semibold mt-1">
                          ${rate}/hr
                        </div>
                      )}
                    </div>
                    
                    {/* Content column */}
                    <div className="flex-1 min-w-0">
                      {isUnavailable ? (
                        <Badge variant="destructive" className="text-xs">
                          Blocked
                        </Badge>
                      ) : dayBookings.length > 0 ? (
                        <div className="space-y-1.5">
                          {dayBookings.slice(0, 3).map((booking) => (
                            <div
                              key={booking.id}
                              className={cn(
                                "text-sm px-2 py-1.5 rounded-md flex items-center justify-between gap-2",
                                booking.status === 'completed' ? "bg-muted" :
                                booking.status === 'active' ? "bg-primary/20" :
                                "bg-blue-500/15"
                              )}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                  <span className="font-medium truncate">
                                    {booking.renter?.first_name || 'Guest'}
                                  </span>
                                  <span className="text-xs text-muted-foreground flex-shrink-0">
                                    {format(new Date(booking.start_at), 'h:mm a')}
                                  </span>
                                </div>
                                {isAllSpotsView && booking.spot?.address && (
                                  <div className="text-xs text-muted-foreground truncate mt-0.5 pl-5">
                                    {getStreetAddress(booking.spot.address)}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                          {dayBookings.length > 3 && (
                            <div className="text-xs text-muted-foreground pl-2">
                              +{dayBookings.length - 3} more
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground py-1">
                          {isPast ? 'No bookings' : 'Available'}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Legend */}
          <div className="flex flex-col items-center gap-2 mt-4">
            <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-green-500/20 border" />
                <span>Booked</span>
              </div>
              {!isAllSpotsView && (
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-destructive/10 border" />
                  <span>Blocked</span>
                </div>
              )}
              <div className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-muted/50 border" />
                <span>Past</span>
              </div>
            </div>
            {isAllSpotsView && (
              <p className="text-xs text-muted-foreground text-center">
                Select a specific spot from the dropdown to view availability and pricing.
              </p>
            )}
          </div>
        </Card>
      )}

      {/* Reservations View */}
      {selectedSpotId && viewMode === 'reservations' && (
        <div className="space-y-4">
          <Tabs value={reservationsTab} onValueChange={(v) => setReservationsTab(v as 'upcoming' | 'past')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="upcoming">
                Upcoming ({upcomingBookings.length})
              </TabsTrigger>
              <TabsTrigger value="past">
                Past ({pastBookings.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upcoming" className="mt-4 space-y-3">
              {reservationsLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i} className="p-4">
                    <Skeleton className="h-20 w-full" />
                  </Card>
                ))
              ) : upcomingBookings.length === 0 ? (
                <Card className="p-8 text-center">
                  <CalendarIcon className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                  <p className="text-muted-foreground">No upcoming reservations</p>
                </Card>
              ) : (
                upcomingBookings.map((booking) => (
                  <ReservationCard key={booking.id} booking={booking} />
                ))
              )}
            </TabsContent>

            <TabsContent value="past" className="mt-4 space-y-3">
              {reservationsLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i} className="p-4">
                    <Skeleton className="h-20 w-full" />
                  </Card>
                ))
              ) : pastBookings.length === 0 ? (
                <Card className="p-8 text-center">
                  <CalendarIcon className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                  <p className="text-muted-foreground">No past reservations</p>
                </Card>
              ) : (
                pastBookings.map((booking) => (
                  <ReservationCard key={booking.id} booking={booking} isPast />
                ))
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* Day Detail Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-xl">
          <SheetHeader className="pb-4 border-b">
            <SheetTitle className="flex items-center justify-between">
              <span>{selectedDate ? format(selectedDate, 'EEEE, MMMM d, yyyy') : ''}</span>
            </SheetTitle>
          </SheetHeader>
          
          {selectedDate && selectedDateData && (
            <div className="py-4 space-y-6 overflow-y-auto max-h-[calc(85vh-100px)]">
              {/* Availability Status */}
              {!isAllSpotsView && selectedDateData.availableHours && (
                <Card className={cn(
                  "p-4",
                  selectedDateData.isUnavailable 
                    ? "bg-destructive/10 border-destructive/30" 
                    : "bg-green-500/10 border-green-500/30"
                )}>
                  <div className="flex items-center gap-3">
                    <Clock className={cn(
                      "h-5 w-5",
                      selectedDateData.isUnavailable ? "text-destructive" : "text-green-600"
                    )} />
                    <div>
                      <div className="font-semibold">
                        {selectedDateData.isUnavailable ? 'Unavailable' : 'Available Hours'}
                      </div>
                      <div className={cn(
                        "text-sm",
                        selectedDateData.isUnavailable ? "text-destructive" : "text-green-600"
                      )}>
                        {selectedDateData.availableHours}
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              {/* Quick Stats */}
              <div className={cn("grid gap-3", isAllSpotsView ? "grid-cols-1" : "grid-cols-2")}>
                {!isAllSpotsView && (
                  <Card className="p-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                      <DollarSign className="h-4 w-4" />
                      <span>Rate</span>
                    </div>
                    <div className="text-lg font-bold">
                      {selectedDateData.rate ? `$${selectedDateData.rate}/hr` : 'N/A'}
                    </div>
                  </Card>
                )}
                <Card className="p-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <CalendarIcon className="h-4 w-4" />
                    <span>Bookings</span>
                  </div>
                  <div className="text-lg font-bold">
                    {selectedDateData.bookings.length}
                  </div>
                </Card>
              </div>

              {/* Manage Availability Link */}
              {spots.length > 0 && (
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => navigate(`/manage-availability?date=${format(selectedDate, 'yyyy-MM-dd')}${selectedSpotId && selectedSpotId !== 'all' ? `&spotId=${selectedSpotId}` : ''}`)}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Manage Availability for This Day
                </Button>
              )}

              {/* Bookings List */}
              {selectedDateData.bookings.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-3">Bookings</h3>
                  <div className="space-y-2">
                    {selectedDateData.bookings.map(booking => (
                      <Card 
                        key={booking.id} 
                        className="p-3 cursor-pointer active:bg-accent/50 transition-colors touch-scroll-safe"
                        onClick={() => navigate(`/booking/${booking.id}`)}
                        onMouseDown={e => e.preventDefault()}
                      >
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">
                                {booking.is_guest 
                                  ? (booking.guest_full_name || 'Guest')
                                  : `${booking.renter?.first_name || ''} ${booking.renter?.last_name || ''}`.trim() || 'Guest'
                                }
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Clock className="h-4 w-4" />
                              <span>
                                {format(new Date(booking.start_at), 'h:mm a')} - {format(new Date(booking.end_at), 'h:mm a')}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <MapPin className="h-4 w-4" />
                              <span className="truncate">{getStreetAddress(booking.spot?.address)}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <Badge variant={
                              booking.status === 'completed' ? 'secondary' :
                              booking.status === 'active' ? 'default' :
                              booking.status === 'pending' ? 'outline' : 'default'
                            }>
                              {booking.status}
                            </Badge>
                            <div className="text-sm font-semibold mt-1 text-green-600 dark:text-green-400">
                              ${getHostNetEarnings(booking).toFixed(2)}
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {selectedDateData.bookings.length === 0 && !selectedDateData.isUnavailable && (
                <Card className="p-6 text-center text-muted-foreground">
                  <CalendarIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No bookings for this day</p>
                </Card>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Review Modal */}
      <ReviewModal
        open={reviewModalOpen}
        onOpenChange={(open) => {
          setReviewModalOpen(open);
          if (!open) setReviewBooking(null);
        }}
        bookingId={reviewBooking?.id || ''}
        revieweeId={reviewBooking?.revieweeId || ''}
        revieweeName={reviewBooking?.revieweeName || ''}
        reviewerRole={reviewBooking?.reviewerRole || 'host'}
        onReviewSubmitted={() => {
          if (reviewBooking) {
            setUserReviews(prev => new Set([...prev, reviewBooking.id]));
          }
          fetchAllReservations();
        }}
      />
    </div>
  );
};

export default HostCalendar;