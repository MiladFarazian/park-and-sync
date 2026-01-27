import React, { useState, useEffect } from 'react';
import { ArrowLeft, Clock, MapPin, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { getHostNetEarnings } from '@/lib/hostEarnings';
import { getBookingStatus, getBookingStatusColor } from '@/lib/bookingStatus';
import { logger } from '@/lib/logger';

const log = logger.scope('HostEarningsHistory');

interface BookingWithDetails {
  id: string;
  status: string;
  start_at: string;
  end_at: string;
  total_amount: number;
  host_earnings: number | null;
  hourly_rate: number;
  extension_charges: number | null;
  renter: {
    first_name: string | null;
    last_name: string | null;
  } | null;
  spot: {
    title: string;
    address: string;
    instant_book?: boolean;
  } | null;
}

const HostEarningsHistory = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [bookings, setBookings] = useState<BookingWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalEarnings, setTotalEarnings] = useState(0);

  useEffect(() => {
    if (user) {
      fetchBookings();
    }
  }, [user]);

  const fetchBookings = async () => {
    try {
      setLoading(true);

      // First get host's spot IDs
      const { data: spotsData, error: spotsError } = await supabase
        .from('spots')
        .select('id')
        .eq('host_id', user?.id);

      if (spotsError) throw spotsError;

      const spotIds = spotsData?.map(s => s.id) || [];

      if (spotIds.length === 0) {
        setBookings([]);
        setTotalEarnings(0);
        setLoading(false);
        return;
      }

      // Fetch all bookings for these spots (including cancelled for display, but excluded from total)
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select(`
          id, status, start_at, end_at, total_amount,
          host_earnings, hourly_rate, extension_charges,
          renter:profiles!bookings_renter_id_fkey (first_name, last_name),
          spot:spots!bookings_spot_id_fkey (title, address, instant_book)
        `)
        .in('spot_id', spotIds)
        .in('status', ['completed', 'active', 'paid', 'canceled', 'refunded'])
        .order('start_at', { ascending: false });

      if (bookingsError) throw bookingsError;

      const typedBookings = (bookingsData || []) as unknown as BookingWithDetails[];
      setBookings(typedBookings);

      // Calculate total earnings excluding cancelled/declined bookings
      const earningStatuses = ['completed', 'active', 'paid'];
      const total = typedBookings
        .filter(b => earningStatuses.includes(b.status))
        .reduce((sum, b) => sum + getHostNetEarnings(b), 0);
      setTotalEarnings(total);
    } catch (error) {
      log.error('Error fetching bookings:', error);
      toast.error('Failed to load earnings history');
    } finally {
      setLoading(false);
    }
  };

  const formatTimeRange = (startAt: string, endAt: string) => {
    const start = new Date(startAt);
    const end = new Date(endAt);
    return `${format(start, 'h:mm a')} - ${format(end, 'h:mm a')}`;
  };

  const formatDate = (startAt: string) => {
    return format(new Date(startAt), 'MMM d, yyyy');
  };

  const getStreetAddress = (address: string) => {
    // Get first line of address (street)
    return address.split(',')[0];
  };

  const getRenterName = (renter: BookingWithDetails['renter']) => {
    if (!renter) return 'Guest';
    const firstName = renter.first_name || '';
    const lastName = renter.last_name || '';
    return `${firstName} ${lastName}`.trim() || 'Guest';
  };

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3 pt-2">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-24 mt-1" />
          </div>
        </div>
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 pt-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/host-home')}
          className="shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Earnings History</h1>
          <p className="text-sm text-muted-foreground">
            Total: <span className="text-green-600 dark:text-green-400 font-semibold">${totalEarnings.toFixed(2)}</span>
          </p>
        </div>
      </div>

      {/* Bookings List */}
      {bookings.length === 0 ? (
        <Card className="p-8 text-center">
          <DollarSign className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
          <h3 className="font-medium text-muted-foreground">No earnings yet</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Complete your first booking to see your earnings here.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {bookings.map(booking => {
            const statusResult = getBookingStatus({
              status: booking.status,
              instantBook: booking.spot?.instant_book ?? true,
              startAt: booking.start_at,
              endAt: booking.end_at,
              isHost: true,
            });
            const earnings = getHostNetEarnings(booking);

            return (
              <Card
                key={booking.id}
                className="p-4 cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => navigate(`/booking/${booking.id}`)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-1">
                    {/* Renter name and date */}
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">
                        {getRenterName(booking.renter)}
                      </span>
                      <Badge className={`shrink-0 text-xs border ${getBookingStatusColor(statusResult.label)}`}>
                        {statusResult.label}
                      </Badge>
                    </div>

                    {/* Date */}
                    <p className="text-xs text-muted-foreground">
                      {formatDate(booking.start_at)}
                    </p>

                    {/* Time range */}
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      <span>{formatTimeRange(booking.start_at, booking.end_at)}</span>
                    </div>

                    {/* Address */}
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">
                        {booking.spot ? getStreetAddress(booking.spot.address) : 'Unknown location'}
                      </span>
                    </div>
                  </div>

                  {/* Earnings - show $0 for cancelled/declined */}
                  <div className="text-right shrink-0">
                    {statusResult.label === 'Cancelled' || statusResult.label === 'Declined' ? (
                      <span className="text-lg font-semibold text-muted-foreground">
                        $0.00
                      </span>
                    ) : (
                      <span className="text-lg font-semibold text-green-600 dark:text-green-400">
                        ${earnings.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default HostEarningsHistory;
