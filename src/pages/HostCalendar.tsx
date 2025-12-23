import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addDays, addMonths, isSameDay, isBefore, startOfDay, isToday } from 'date-fns';
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
}

interface CalendarOverride {
  spot_id: string;
  override_date: string;
  is_available: boolean;
  custom_rate?: number;
}

const HostCalendar = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [spots, setSpots] = useState<SpotWithRate[]>([]);
  const [bookings, setBookings] = useState<BookingForCalendar[]>([]);
  const [overrides, setOverrides] = useState<CalendarOverride[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user, currentMonth]);

  const fetchData = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);

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

      // Fetch bookings for the month
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select('id, spot_id, start_at, end_at, status, total_amount')
        .in('spot_id', spotIds)
        .gte('start_at', monthStart.toISOString())
        .lte('start_at', monthEnd.toISOString())
        .in('status', ['pending', 'paid', 'active', 'completed']);

      if (bookingsError) throw bookingsError;
      setBookings(bookingsData || []);

      // Fetch calendar overrides
      const { data: overridesData, error: overridesError } = await supabase
        .from('calendar_overrides')
        .select('spot_id, override_date, is_available, custom_rate')
        .in('spot_id', spotIds)
        .gte('override_date', format(monthStart, 'yyyy-MM-dd'))
        .lte('override_date', format(monthEnd, 'yyyy-MM-dd'));

      if (overridesError) throw overridesError;
      setOverrides(overridesData || []);

    } catch (error) {
      console.error('Error fetching calendar data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Generate calendar grid
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
      isUnavailable: hasUnavailable,
      rate: displayRate,
      isPast,
      hasBookings: dateBookings.length > 0
    };
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
    <div className="p-4 pb-24 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/host-home')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Calendar</h1>
          <p className="text-sm text-muted-foreground">View bookings & availability</p>
        </div>
      </div>

      {/* Month Navigation */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCurrentMonth(addMonths(currentMonth, -1))}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h2 className="text-xl font-bold">{format(currentMonth, 'MMMM yyyy')}</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* Day Headers */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
            <div key={i} className="text-xs text-muted-foreground text-center font-medium py-1">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        {loading ? (
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map(({ date, isCurrentMonth }, index) => {
              const { bookings: dayBookings, isUnavailable, rate, isPast, hasBookings } = getDateData(date);
              const isTodayDate = isToday(date);
              
              return (
                <div
                  key={index}
                  className={cn(
                    "aspect-square p-0.5 rounded-md border transition-all flex flex-col",
                    !isCurrentMonth && "opacity-30",
                    isTodayDate && "ring-2 ring-primary",
                    isUnavailable && isCurrentMonth && "bg-destructive/10",
                    hasBookings && isCurrentMonth && !isUnavailable && "bg-green-500/10",
                    isPast && isCurrentMonth && "bg-muted/50"
                  )}
                >
                  {/* Date Number */}
                  <div className="text-xs font-medium text-center">
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
                          {dayBookings.slice(0, 2).map((booking, i) => (
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
                </div>
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
            <span>Unavailable</span>
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
    </div>
  );
};

export default HostCalendar;
