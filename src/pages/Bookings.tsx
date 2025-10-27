import React, { useState, useEffect } from 'react';
import { Star, MapPin, Clock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format } from 'date-fns';

interface Booking {
  id: string;
  start_at: string;
  end_at: string;
  total_amount: number;
  status: string;
  created_at: string;
  spots: {
    id: string;
    title: string;
    address: string;
  };
}

const Bookings = () => {
  const [activeTab, setActiveTab] = useState('upcoming');
  const [upcomingBookings, setUpcomingBookings] = useState<Booking[]>([]);
  const [pastBookings, setPastBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchBookings = async () => {
    if (!user) return;

    try {
      setLoading(true);
      // @ts-ignore - Supabase type inference issue with nested selects
      const { data, error } = await supabase
        .from('bookings')
        .select('*, spots(id, title, address)')
        .eq('user_id', user.id)
        .order('start_at', { ascending: false });

      if (error) throw error;

      const now = new Date();
      const upcoming: Booking[] = [];
      const past: Booking[] = [];

      data?.forEach((booking) => {
        const startTime = new Date(booking.start_at);
        if (startTime > now && booking.status !== 'canceled') {
          upcoming.push(booking);
        } else {
          past.push(booking);
        }
      });

      setUpcomingBookings(upcoming);
      setPastBookings(past);
    } catch (error: any) {
      console.error('Error fetching bookings:', error);
      toast({
        title: "Error",
        description: "Failed to load bookings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, [user]);

  const handleCancelClick = (booking: Booking) => {
    setSelectedBooking(booking);
    setShowCancelDialog(true);
  };

  const handleCancelConfirm = async () => {
    if (!selectedBooking) return;

    try {
      setCancellingId(selectedBooking.id);
      const { data, error } = await supabase.functions.invoke('cancel-booking', {
        body: { bookingId: selectedBooking.id },
      });

      if (error) throw error;

      toast({
        title: "Booking Cancelled",
        description: data.refundAmount > 0 
          ? `Refund of $${data.refundAmount.toFixed(2)} will be processed. ${data.refundReason}`
          : data.refundReason,
      });

      fetchBookings();
    } catch (error: any) {
      console.error('Error cancelling booking:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to cancel booking",
        variant: "destructive",
      });
    } finally {
      setCancellingId(null);
      setShowCancelDialog(false);
      setSelectedBooking(null);
    }
  };

  const calculateDuration = (start: string, end: string) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const hours = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60));
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  };

  const canCancel = (booking: Booking) => {
    const now = new Date();
    const startTime = new Date(booking.start_at);
    const createdAt = new Date(booking.created_at);
    const gracePeriodEnd = new Date(createdAt.getTime() + 10 * 60 * 1000);
    const oneHourBeforeStart = new Date(startTime.getTime() - 60 * 60 * 1000);

    return now <= gracePeriodEnd || now <= oneHourBeforeStart;
  };

  const getCancelMessage = (booking: Booking) => {
    if (!booking) return '';
    
    const now = new Date();
    const startTime = new Date(booking.start_at);
    const createdAt = new Date(booking.created_at);
    const gracePeriodEnd = new Date(createdAt.getTime() + 10 * 60 * 1000);
    const oneHourBeforeStart = new Date(startTime.getTime() - 60 * 60 * 1000);

    if (now <= gracePeriodEnd) {
      return "You're within the 10-minute grace period. You'll receive a full refund.";
    } else if (now <= oneHourBeforeStart) {
      return "Cancelling more than 1 hour before start time. You'll receive a full refund.";
    } else {
      return "Cancelling within 1 hour of start time. No refund available.";
    }
  };

  const BookingCard = ({ booking, isPast = false }: { booking: Booking, isPast?: boolean }) => (
    <Card className="p-4">
      <div className="flex gap-3">
        <div className="w-20 h-20 rounded-lg bg-muted flex-shrink-0 overflow-hidden">
          <img 
            src="/placeholder.svg"
            alt={booking.spots.title}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex-1 space-y-2 min-w-0">
          <div className="flex justify-between items-start gap-2">
            <h3 className="font-semibold text-base leading-tight truncate">{booking.spots.title}</h3>
            <div className="text-right flex-shrink-0">
              <p className="font-bold text-lg">${booking.total_amount.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">
                {calculateDuration(booking.start_at, booking.end_at)}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{booking.spots.address}</span>
          </div>
          
          <div className="text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3 flex-shrink-0" />
              <span>{format(new Date(booking.start_at), 'MMM dd, yyyy')}</span>
            </div>
            <div className="ml-4 text-xs">
              {format(new Date(booking.start_at), 'h:mm a')} - {format(new Date(booking.end_at), 'h:mm a')}
            </div>
          </div>
          
          {booking.status === 'canceled' && (
            <div className="text-xs text-destructive font-medium">
              Cancelled
            </div>
          )}
          
          <div className="flex items-center justify-between pt-1">
            <div className="text-xs text-muted-foreground">
              Status: <span className="capitalize">{booking.status}</span>
            </div>
            
            {!isPast && booking.status !== 'canceled' && canCancel(booking) && (
              <Button 
                variant="outline" 
                size="sm" 
                className="text-xs px-3"
                onClick={() => handleCancelClick(booking)}
                disabled={cancellingId === booking.id}
              >
                <X className="h-3 w-3 mr-1" />
                {cancellingId === booking.id ? 'Cancelling...' : 'Cancel'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );

  if (loading) {
    return (
      <div className="p-4 space-y-6">
        <div className="pt-4">
          <h1 className="text-2xl font-bold">My Bookings</h1>
          <p className="text-muted-foreground">Loading your reservations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <div className="pt-4">
        <h1 className="text-2xl font-bold">My Bookings</h1>
        <p className="text-muted-foreground">Manage your parking reservations</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="upcoming">Upcoming ({upcomingBookings.length})</TabsTrigger>
          <TabsTrigger value="past">Past ({pastBookings.length})</TabsTrigger>
        </TabsList>
        
        <TabsContent value="upcoming" className="space-y-3 mt-6">
          {upcomingBookings.length === 0 ? (
            <Card className="p-12 text-center">
              <p className="text-muted-foreground">No upcoming bookings</p>
            </Card>
          ) : (
            upcomingBookings.map((booking) => (
              <BookingCard key={booking.id} booking={booking} />
            ))
          )}
        </TabsContent>
        
        <TabsContent value="past" className="space-y-3 mt-6">
          {pastBookings.length === 0 ? (
            <Card className="p-12 text-center">
              <p className="text-muted-foreground">No past bookings</p>
            </Card>
          ) : (
            pastBookings.map((booking) => (
              <BookingCard key={booking.id} booking={booking} isPast />
            ))
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Booking</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedBooking && getCancelMessage(selectedBooking)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Booking</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelConfirm}>
              Confirm Cancellation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Bookings;
