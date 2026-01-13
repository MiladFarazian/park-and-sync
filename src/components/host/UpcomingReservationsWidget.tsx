import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronRight, Calendar, Clock, MessageCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format, isToday, isTomorrow, isPast } from 'date-fns';
import { cn } from '@/lib/utils';
import { getStreetAddress } from '@/lib/addressUtils';

interface ReservationPreview {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  total_amount: number;
  host_earnings: number | null;
  renter_id: string;
  is_guest: boolean;
  renter: {
    first_name: string | null;
    last_name: string | null;
  };
  spot: {
    title: string;
    address: string;
  };
}

const UpcomingReservationsWidget = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [reservations, setReservations] = useState<ReservationPreview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchUpcomingReservations();
    }
  }, [user]);

  const fetchUpcomingReservations = async () => {
    if (!user) return;

    try {
      // First get host's spots
      const { data: spots, error: spotsError } = await supabase
        .from('spots')
        .select('id')
        .eq('host_id', user.id);

      if (spotsError) throw spotsError;
      if (!spots || spots.length === 0) {
        setReservations([]);
        setLoading(false);
        return;
      }

      const spotIds = spots.map(s => s.id);

      // Get upcoming/active reservations
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select(`
          id,
          start_at,
          end_at,
          status,
          total_amount,
          host_earnings,
          renter_id,
          is_guest,
          renter:profiles!bookings_renter_id_fkey (
            first_name,
            last_name
          ),
          spot:spots!bookings_spot_id_fkey (
            title,
            address
          )
        `)
        .in('spot_id', spotIds)
        .in('status', ['pending', 'paid', 'active'])
        .gte('end_at', new Date().toISOString())
        .order('start_at', { ascending: true })
        .limit(5);

      if (bookingsError) throw bookingsError;

      const formattedBookings: ReservationPreview[] = (bookingsData || []).map(b => ({
        id: b.id,
        start_at: b.start_at,
        end_at: b.end_at,
        status: b.status,
        total_amount: b.total_amount,
        host_earnings: b.host_earnings,
        renter_id: b.renter_id,
        is_guest: b.is_guest || false,
        renter: b.renter as { first_name: string | null; last_name: string | null },
        spot: b.spot as { title: string; address: string }
      }));

      setReservations(formattedBookings);
    } catch (error) {
      console.error('Error fetching reservations:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDateLabel = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'MMM d');
  };

  const getStatusBadge = (status: string, startAt: string) => {
    const startDate = new Date(startAt);
    const isStarted = isPast(startDate);

    if (status === 'active') {
      return <Badge className="bg-green-500 text-white text-[10px]">Active</Badge>;
    }
    if (status === 'pending') {
      return <Badge variant="secondary" className="text-[10px]">Pending</Badge>;
    }
    if (isStarted) {
      return <Badge className="bg-blue-500 text-white text-[10px]">In Progress</Badge>;
    }
    return <Badge variant="outline" className="text-[10px]">Confirmed</Badge>;
  };

  const handleMessage = (e: React.MouseEvent, reservation: ReservationPreview) => {
    e.stopPropagation();
    if (reservation.is_guest) {
      navigate(`/messages?userId=guest:${reservation.id}`);
    } else {
      navigate(`/messages?userId=${reservation.renter_id}`);
    }
  };

  if (loading) {
    return (
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-16" />
        </div>
        {[1, 2].map(i => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-lg border">
            <Skeleton className="h-12 w-12 rounded-lg" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ))}
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div 
        className="flex items-center justify-between mb-3 cursor-pointer group"
        onClick={() => navigate('/host-calendar?tab=reservations')}
      >
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Upcoming Reservations</h3>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-primary transition-colors">
          View all
          <ChevronRight className="h-3 w-3" />
        </div>
      </div>

      {reservations.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">
          <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No upcoming reservations</p>
        </div>
      ) : (
        <div className="space-y-2">
          {reservations.map((reservation) => (
            <div
              key={reservation.id}
              className={cn(
                "p-3 rounded-lg border transition-all cursor-pointer hover:bg-muted/50",
                reservation.status === 'active' && "border-green-500/50 bg-green-500/5"
              )}
              onClick={() => navigate(`/booking/${reservation.id}`)}
            >
              <div className="flex items-start gap-3">
                {/* Date Badge */}
                <div className="flex flex-col items-center justify-center bg-primary/10 rounded-lg p-2 min-w-[50px]">
                  <span className="text-[10px] text-primary font-medium uppercase">
                    {getDateLabel(reservation.start_at)}
                  </span>
                  <span className="text-lg font-bold text-primary">
                    {format(new Date(reservation.start_at), 'd')}
                  </span>
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium truncate">
                      {reservation.renter?.first_name || 'Guest'} {reservation.renter?.last_name?.[0] || ''}.
                    </span>
                    {getStatusBadge(reservation.status, reservation.start_at)}
                  </div>
                  
                  {/* Time Range */}
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    <Clock className="h-3 w-3 flex-shrink-0" />
                    <span className="font-medium">
                      {format(new Date(reservation.start_at), 'h:mm a')} – {format(new Date(reservation.end_at), 'h:mm a')}
                    </span>
                  </div>
                  
                  {/* Address */}
                  <p className="text-xs text-muted-foreground truncate">
                    {getStreetAddress(reservation.spot?.address)}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex flex-col items-end gap-2">
                  <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                    ${(reservation.host_earnings ?? reservation.total_amount).toFixed(0)}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => handleMessage(e, reservation)}
                  >
                    <MessageCircle className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

export default UpcomingReservationsWidget;
