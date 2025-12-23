import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, LayoutGrid, Clock, DollarSign, User, MapPin, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addDays, addMonths, addWeeks, isSameDay, isBefore, startOfDay, isToday, startOfWeek, endOfWeek } from 'date-fns';
import { cn } from '@/lib/utils';

interface SpotWithRate {
  id: string;
  title: string;
  hourly_rate: number;
}

interface BookingForCalendar {
  id: string;
  spot_id: string;
  start_at: string;
  end_at: string;
  status: string;
  total_amount: number;
  renter?: {
    first_name: string | null;
    last_name: string | null;
  };
  spot?: {
    title: string;
  };
}

interface CalendarOverride {
  id?: string;
  spot_id: string;
  override_date: string;
  is_available: boolean;
  custom_rate?: number;
}

type ViewMode = 'month' | 'week';

const HostCalendar = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [spots, setSpots] = useState<SpotWithRate[]>([]);
  const [bookings, setBookings] = useState<BookingForCalendar[]>([]);
  const [overrides, setOverrides] = useState<CalendarOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user, currentMonth, currentWeek, viewMode]);

  const fetchData = async () => {
    if (!user) return;
    
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

      // Fetch host's spots
      const { data: spotsData, error: spotsError } = await supabase
        .from('spots')
        .select('id, title, hourly_rate')
        .eq('host_id', user.id);

      if (spotsError) throw spotsError;
      setSpots(spotsData || []);

      if (!spotsData || spotsData.length === 0) {
        setLoading(false);
        return;
      }

      const spotIds = spotsData.map(s => s.id);

      // Fetch bookings for the range with renter info
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select(`
          id, spot_id, start_at, end_at, status, total_amount,
          renter:profiles!bookings_renter_id_fkey(first_name, last_name),
          spot:spots!bookings_spot_id_fkey(title)
        `)
        .in('spot_id', spotIds)
        .gte('start_at', rangeStart.toISOString())
        .lte('start_at', rangeEnd.toISOString())
        .in('status', ['pending', 'paid', 'active', 'completed']);

      if (bookingsError) throw bookingsError;
      setBookings(bookingsData || []);

      // Fetch calendar overrides
      const { data: overridesData, error: overridesError } = await supabase
        .from('calendar_overrides')
        .select('id, spot_id, override_date, is_available, custom_rate')
        .in('spot_id', spotIds)
        .gte('override_date', format(rangeStart, 'yyyy-MM-dd'))
        .lte('override_date', format(rangeEnd, 'yyyy-MM-dd'));

      if (overridesError) throw overridesError;
      setOverrides(overridesData || []);

    } catch (error) {
      console.error('Error fetching calendar data:', error);
    } finally {
      setLoading(false);
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

  // Get data for a specific date
  const getDateData = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const today = startOfDay(new Date());
    const isPast = isBefore(date, today);
    
    // Get bookings for this date
    const dateBookings = bookings.filter(b => {
      const bookingDate = new Date(b.start_at);
      return isSameDay(bookingDate, date);
    });

    // Get overrides for this date
    const dateOverrides = overrides.filter(o => o.override_date === dateStr);
    const hasUnavailable = dateOverrides.some(o => !o.is_available);
    
    // Calculate rate to show (use custom rate if available, otherwise base rate)
    let displayRate = spots.length > 0 ? Math.min(...spots.map(s => s.hourly_rate)) : null;
    const customRate = dateOverrides.find(o => o.custom_rate)?.custom_rate;
    if (customRate) displayRate = customRate;

    return {
      bookings: dateBookings,
      overrides: dateOverrides,
      isUnavailable: hasUnavailable,
      rate: displayRate,
      isPast,
      hasBookings: dateBookings.length > 0
    };
  };

  const handleDayClick = (date: Date) => {
    setSelectedDate(date);
    setSheetOpen(true);
  };

  const selectedDateData = selectedDate ? getDateData(selectedDate) : null;

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
    <div className="p-4 pb-24 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Calendar</h1>
          <p className="text-sm text-muted-foreground">View bookings & availability</p>
        </div>
        
        {/* View Toggle */}
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
          <TabsList className="h-9">
            <TabsTrigger value="month" className="px-3">
              <LayoutGrid className="h-4 w-4" />
            </TabsTrigger>
            <TabsTrigger value="week" className="px-3">
              <CalendarIcon className="h-4 w-4" />
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Calendar Card */}
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
          <div className="grid grid-cols-7 gap-1">
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
          <div className="space-y-2">
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
                            <div className="flex items-center gap-2 min-w-0">
                              <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                              <span className="font-medium truncate">
                                {booking.renter?.first_name || 'Guest'}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground flex-shrink-0">
                              {format(new Date(booking.start_at), 'h:mm a')}
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
        <div className="flex flex-wrap items-center justify-center gap-3 mt-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-green-500/20 border" />
            <span>Booked</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-destructive/10 border" />
            <span>Blocked</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-muted/50 border" />
            <span>Past</span>
          </div>
        </div>
      </Card>

      {/* Quick link to Activity */}
      <Button 
        variant="outline" 
        className="w-full"
        onClick={() => navigate('/activity')}
      >
        View All Reservations
      </Button>

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
              {/* Quick Stats */}
              <div className="grid grid-cols-2 gap-3">
                <Card className="p-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <DollarSign className="h-4 w-4" />
                    <span>Rate</span>
                  </div>
                  <div className="text-lg font-bold">
                    {selectedDateData.rate ? `$${selectedDateData.rate}/hr` : 'N/A'}
                  </div>
                </Card>
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
                  onClick={() => navigate(`/manage-availability?date=${format(selectedDate, 'yyyy-MM-dd')}`)}
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
                        className="p-3 cursor-pointer hover:bg-accent/50 transition-colors"
                        onClick={() => navigate(`/booking/${booking.id}`)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">
                                {booking.renter?.first_name} {booking.renter?.last_name || ''}
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
                              <span>{booking.spot?.title}</span>
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
                            <div className="text-sm font-semibold mt-1">
                              ${booking.total_amount.toFixed(2)}
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
    </div>
  );
};

export default HostCalendar;
