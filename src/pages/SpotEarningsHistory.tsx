import React, { useState, useEffect } from 'react';
import { ArrowLeft, Clock, MapPin, DollarSign, User, Calendar, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { getHostNetEarnings } from '@/lib/hostEarnings';
import { getStreetAddress } from '@/lib/addressUtils';
import { getBookingStatus, getBookingStatusColor } from '@/lib/bookingStatus';
import { logger } from '@/lib/logger';

const log = logger.scope('SpotEarningsHistory');

interface BookingWithDetails {
  id: string;
  status: string;
  start_at: string;
  end_at: string;
  total_amount: number;
  host_earnings: number | null;
  hourly_rate: number;
  extension_charges: number | null;
  is_guest: boolean;
  guest_full_name: string | null;
  renter: {
    first_name: string | null;
    last_name: string | null;
  } | null;
  instant_book?: boolean;
}

interface SpotInfo {
  id: string;
  title: string;
  address: string;
  photoUrl: string | null;
  instantBook: boolean;
}

const SpotEarningsHistory = () => {
  const navigate = useNavigate();
  const { spotId } = useParams<{ spotId: string }>();
  const { user } = useAuth();
  const [spot, setSpot] = useState<SpotInfo | null>(null);
  const [bookings, setBookings] = useState<BookingWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalEarnings, setTotalEarnings] = useState(0);

  useEffect(() => {
    if (user && spotId) {
      fetchSpotAndBookings();
    }
  }, [user, spotId]);

  const fetchSpotAndBookings = async () => {
    try {
      setLoading(true);

      // Fetch spot details with photo
      const { data: spotData, error: spotError } = await supabase
        .from('spots')
        .select(`
          id,
          title,
          address,
          host_id,
          instant_book,
          spot_photos(url, is_primary, sort_order)
        `)
        .eq('id', spotId)
        .single();

      if (spotError) throw spotError;

      // Verify ownership
      if (spotData.host_id !== user?.id) {
        toast.error('You do not have access to this spot');
        navigate('/host-home');
        return;
      }

      // Get primary photo or first photo
      const photos = spotData.spot_photos || [];
      const primaryPhoto = photos.find((p: any) => p.is_primary);
      const fallbackPhoto = [...photos].sort((a: any, b: any) =>
        (a.sort_order ?? 0) - (b.sort_order ?? 0)
      )[0];
      const photoUrl = primaryPhoto?.url || fallbackPhoto?.url || null;

      setSpot({
        id: spotData.id,
        title: spotData.title || 'Untitled Spot',
        address: spotData.address || '',
        photoUrl,
        instantBook: spotData.instant_book ?? true,
      });

      // Fetch all bookings for this spot (including cancelled for display, but excluded from total)
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select(`
          id, status, start_at, end_at, total_amount,
          host_earnings, hourly_rate, extension_charges,
          is_guest, guest_full_name,
          renter:profiles!bookings_renter_id_fkey (first_name, last_name)
        `)
        .eq('spot_id', spotId)
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
      log.error('Error fetching spot data:', error);
      toast.error('Failed to load spot earnings');
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

  const getRenterName = (booking: BookingWithDetails) => {
    if (booking.is_guest) {
      return booking.guest_full_name || 'Guest';
    }
    if (!booking.renter) return 'Guest';
    const firstName = booking.renter.first_name || '';
    const lastName = booking.renter.last_name || '';
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
        <Skeleton className="h-20 w-full rounded-lg" />
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!spot) {
    return (
      <div className="p-4 space-y-4">
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
            <h1 className="text-xl font-bold">Spot Not Found</h1>
          </div>
        </div>
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">This spot could not be found.</p>
        </Card>
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
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">Spot Earnings</h1>
          <p className="text-sm text-muted-foreground">
            Total: <span className="text-green-600 dark:text-green-400 font-semibold">${totalEarnings.toFixed(2)}</span>
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => navigate(`/edit-spot/${spotId}`)}
          className="shrink-0"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>

      {/* Spot Info Card */}
      <Card className="p-4">
        <div className="flex items-center gap-3">
          {spot.photoUrl ? (
            <img
              src={spot.photoUrl}
              alt={spot.title}
              className="h-16 w-16 rounded-lg object-cover shrink-0"
            />
          ) : (
            <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <MapPin className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{spot.title}</p>
            <p className="text-sm text-muted-foreground truncate">
              {getStreetAddress(spot.address)}
            </p>
            <p className="text-sm text-muted-foreground">
              {bookings.length} booking{bookings.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </Card>

      {/* Bookings List */}
      {bookings.length === 0 ? (
        <Card className="p-8 text-center">
          <DollarSign className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
          <h3 className="font-medium text-muted-foreground">No bookings yet</h3>
          <p className="text-sm text-muted-foreground mt-1">
            When drivers book this spot, their bookings will appear here.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
            Booking History
          </h3>
          {bookings.map(booking => {
            const statusResult = getBookingStatus({
              status: booking.status,
              instantBook: spot?.instantBook ?? true,
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
                    {/* Renter name and status */}
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium truncate">
                        {getRenterName(booking)}
                      </span>
                      <Badge className={`shrink-0 text-xs border ${getBookingStatusColor(statusResult.label)}`}>
                        {statusResult.label}
                      </Badge>
                    </div>

                    {/* Date */}
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5 shrink-0" />
                      <span>{formatDate(booking.start_at)}</span>
                    </div>

                    {/* Time range */}
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      <span>{formatTimeRange(booking.start_at, booking.end_at)}</span>
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

export default SpotEarningsHistory;
