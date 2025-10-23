import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MapPin, Clock, Calendar, DollarSign } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

const Activity = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('upcoming');
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('bookings')
        .select(`
          *,
          spots (
            title,
            address
          )
        `)
        .eq('renter_id', user.id)
        .order('start_at', { ascending: false });

      if (error) throw error;

      setBookings(data || []);
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

  const now = new Date();
  const upcomingBookings = bookings.filter(b => new Date(b.end_at) >= now);
  const pastBookings = bookings.filter(b => new Date(b.end_at) < now);

  const BookingCard = ({ booking, isPast = false }: { booking: any; isPast?: boolean }) => (
    <Card>
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h3 className="font-semibold">{booking.spots?.title || 'Parking Spot'}</h3>
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
              <MapPin className="h-3 w-3" />
              {booking.spots?.address || 'Address not available'}
            </p>
          </div>
          <Badge variant={isPast ? 'secondary' : 'default'}>
            {booking.status === 'paid' ? (isPast ? 'Completed' : 'Confirmed') : booking.status}
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
            <DollarSign className="h-5 w-5 text-muted-foreground" />
            <span className="font-semibold text-lg">${Number(booking.total_amount).toFixed(2)}</span>
          </div>
        </div>
      </CardContent>
      <div className="p-4 pt-0 flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => navigate(`/booking/${booking.id}`)}>View Details</Button>
        {!isPast && <Button variant="default" className="flex-1">Get Directions</Button>}
      </div>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="p-4 space-y-4">
        <div>
          <h1 className="text-2xl font-bold">My Bookings</h1>
          <p className="text-sm text-muted-foreground">View your parking reservations</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="past">Past</TabsTrigger>
          </TabsList>
          
          <TabsContent value="upcoming" className="space-y-3 mt-4">
            {loading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <Skeleton className="h-20 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : upcomingBookings.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="font-semibold mb-2">No upcoming bookings</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Start exploring parking spots near you
                  </p>
                  <Button onClick={() => navigate('/explore')}>
                    Find Parking
                  </Button>
                </CardContent>
              </Card>
            ) : (
              upcomingBookings.map((booking) => (
                <BookingCard key={booking.id} booking={booking} isPast={false} />
              ))
            )}
          </TabsContent>
          
          <TabsContent value="past" className="space-y-3 mt-4">
            {loading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <Skeleton className="h-20 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : pastBookings.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="font-semibold mb-2">No past bookings</h3>
                  <p className="text-sm text-muted-foreground">
                    Your completed bookings will appear here
                  </p>
                </CardContent>
              </Card>
            ) : (
              pastBookings.map((booking) => (
                <BookingCard key={booking.id} booking={booking} isPast={true} />
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Activity;
