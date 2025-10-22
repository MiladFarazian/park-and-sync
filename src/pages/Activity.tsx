import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MapPin, Clock, Calendar, DollarSign } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Activity = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('upcoming');

  // Mock data - replace with actual data from Supabase
  const upcomingBookings = [
    {
      id: '1',
      title: 'Downtown Garage',
      address: '123 Main St, Los Angeles',
      date: 'Dec 25, 2024',
      time: '9:00 AM - 5:00 PM',
      price: 40,
      status: 'upcoming'
    },
    {
      id: '2',
      title: 'Santa Monica Beach Parking',
      address: '789 Ocean Ave, Santa Monica',
      date: 'Dec 28, 2024',
      time: '10:00 AM - 4:00 PM',
      price: 35,
      status: 'upcoming'
    }
  ];

  const pastBookings = [
    {
      id: '3',
      title: 'Hollywood Walk of Fame',
      address: '456 Hollywood Blvd, Los Angeles',
      date: 'Dec 15, 2024',
      time: '11:00 AM - 3:00 PM',
      price: 25,
      status: 'completed'
    },
    {
      id: '4',
      title: 'Beverly Hills Shopping',
      address: '321 Rodeo Drive, Beverly Hills',
      date: 'Dec 10, 2024',
      time: '12:00 PM - 6:00 PM',
      price: 50,
      status: 'completed'
    }
  ];

  const BookingCard = ({ booking, isPast = false }: { booking: any; isPast?: boolean }) => (
    <Card>
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h3 className="font-semibold">{booking.title}</h3>
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
              <MapPin className="h-3 w-3" />
              {booking.address}
            </p>
          </div>
          <Badge variant={isPast ? 'secondary' : 'default'}>
            {isPast ? 'Completed' : 'Upcoming'}
          </Badge>
        </div>
        
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span>{booking.date}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span>{booking.time}</span>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t flex justify-between items-center">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-muted-foreground" />
            <span className="font-semibold text-lg">${booking.price}</span>
          </div>
        </div>
      </CardContent>
      <div className="p-4 pt-0 flex gap-2">
        <Button variant="outline" className="flex-1">View Details</Button>
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
            {upcomingBookings.length === 0 ? (
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
            {pastBookings.length === 0 ? (
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
