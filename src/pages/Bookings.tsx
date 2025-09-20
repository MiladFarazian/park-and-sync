import React, { useState } from 'react';
import { Star, MapPin, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const Bookings = () => {
  const [activeTab, setActiveTab] = useState('upcoming');

  const upcomingBookings = [
    {
      id: 1,
      title: 'Business District Lot',
      address: '789 Business Blvd',
      date: 'Dec 15, 2024',
      time: '10:00 AM - 2:00 PM',
      duration: '4 hours',
      price: 48,
      rating: 5,
      image: '/placeholder.svg'
    },
    {
      id: 2,
      title: 'Central Mall Parking',
      address: 'Mall Center Dr',
      date: 'Dec 12, 2024',
      time: '1:00 PM - 8:00 PM',
      duration: '7 hours',
      price: 42,
      rating: 4,
      image: '/placeholder.svg'
    }
  ];

  const pastBookings = [
    {
      id: 3,
      title: 'Downtown Garage',
      address: '123 Main St',
      date: 'Dec 8, 2024',
      time: '9:00 AM - 5:00 PM',
      duration: '8 hours',
      price: 64,
      rating: 5,
      image: '/placeholder.svg'
    }
  ];

  const BookingCard = ({ booking, isPast = false }: { booking: any, isPast?: boolean }) => (
    <Card className="p-4">
      <div className="flex gap-3">
        <div className="w-20 h-20 rounded-lg bg-muted flex-shrink-0">
          <img 
            src={booking.image} 
            alt={booking.title}
            className="w-full h-full object-cover rounded-lg"
          />
        </div>
        <div className="flex-1 space-y-2 min-w-0">
          <div className="flex justify-between items-start gap-2">
            <h3 className="font-semibold text-base leading-tight truncate">{booking.title}</h3>
            <div className="text-right flex-shrink-0">
              <p className="font-bold text-lg">${booking.price}</p>
              <p className="text-xs text-muted-foreground">{booking.duration}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{booking.address}</span>
          </div>
          
          <div className="text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3 flex-shrink-0" />
              <span>{booking.date}</span>
            </div>
            <div className="ml-4 text-xs">{booking.time}</div>
          </div>
          
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1">
              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              <span className="font-medium text-sm">{booking.rating}</span>
            </div>
            
            {isPast ? (
              <Button variant="outline" size="sm" className="text-xs px-3">Book Again</Button>
            ) : (
              <Button variant="default" size="sm" className="text-xs px-3">View Details</Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="pt-4">
        <h1 className="text-2xl font-bold">My Bookings</h1>
        <p className="text-muted-foreground">Manage your parking reservations</p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="upcoming">Upcoming (2)</TabsTrigger>
          <TabsTrigger value="past">Past (2)</TabsTrigger>
        </TabsList>
        
        <TabsContent value="upcoming" className="space-y-3 mt-6">
          {upcomingBookings.map((booking) => (
            <BookingCard key={booking.id} booking={booking} />
          ))}
        </TabsContent>
        
        <TabsContent value="past" className="space-y-3 mt-6">
          {pastBookings.map((booking) => (
            <BookingCard key={booking.id} booking={booking} isPast />
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Bookings;