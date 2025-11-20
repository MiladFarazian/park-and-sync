import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MapPin, Clock, Calendar, XCircle, MessageCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { useMode } from '@/contexts/ModeContext';
import { ActiveBookingBanner } from '@/components/booking/ActiveBookingBanner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
const Activity = () => {
  const navigate = useNavigate();
  const {
    toast
  } = useToast();
  const {
    mode
  } = useMode();
  const [activeTab, setActiveTab] = useState('upcoming');
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [cancelling, setCancelling] = useState(false);
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
              host_id
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
              host_id
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
  const BookingCard = ({
    booking,
    isPast = false
  }: {
    booking: any;
    isPast?: boolean;
  }) => {
    const isHost = booking.userRole === 'host';
    const otherPartyId = isHost ? booking.renter_id : booking.spots?.host_id;
    return <Card>
        <CardContent className="p-4">
          <div className="flex justify-between items-start mb-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold">{booking.spots?.title || 'Parking Spot'}</h3>
                {isHost && <Badge variant="outline" className="text-xs">As Host</Badge>}
              </div>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {booking.spots?.address || 'Address not available'}
              </p>
            </div>
            <Badge variant={isPast ? 'secondary' : 'default'}>
              {booking.status === 'canceled' ? 'Canceled' : booking.status === 'paid' ? isPast ? 'Completed' : 'Confirmed' : booking.status}
            </Badge>
          </div>
          
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>{formatDate(booking.start_at)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>{formatTime(booking.start_at, booking.end_at)}</span>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t flex justify-between items-center">
            <div className="flex items-center gap-2">
              
              <span className="font-semibold text-lg">${Number(booking.total_amount).toFixed(2)}</span>
            </div>
          </div>
        </CardContent>
        <div className="p-4 pt-0 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => navigate(`/booking-confirmation/${booking.id}`)}>View Details</Button>
          <Button variant="outline" size="icon" onClick={() => {
          if (otherPartyId) {
            navigate(`/messages?userId=${otherPartyId}`);
          }
        }} disabled={!otherPartyId}>
            <MessageCircle className="h-4 w-4" />
          </Button>
          {!isPast && booking.status !== 'canceled' && booking.userRole === 'renter' && <Button variant="destructive" size="icon" onClick={() => {
          setSelectedBooking(booking);
          setCancelDialogOpen(true);
        }}>
              <XCircle className="h-4 w-4" />
            </Button>}
        </div>
      </Card>;
  };
  return <div className="bg-background">
      <div className="p-4 space-y-4">
        <div>
          <h1 className="text-2xl font-bold">{mode === 'host' ? 'Reservations' : 'My Bookings'}</h1>
          <p className="text-sm text-muted-foreground">
            {mode === 'host' ? 'Manage reservations at your spots' : 'View your parking reservations'}
          </p>
        </div>

        {/* Active booking banner for quick management */}
        <ActiveBookingBanner />

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
                navigate(`/explore?start=${now.toISOString()}&end=${twoHoursLater.toISOString()}`);
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
    </div>;
};
export default Activity;