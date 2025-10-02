import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MapPin, Clock, Star, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Activity = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('spots');

  // Mock data - replace with actual data from Supabase
  const bookedSpots = [
    {
      id: '1',
      title: 'Downtown Garage',
      address: '123 Main St, Los Angeles',
      date: 'Dec 25, 2024',
      time: '9:00 AM - 5:00 PM',
      price: 40,
      duration: '8 hours',
      status: 'upcoming',
      imageUrl: null
    }
  ];

  const listedSpots = [
    {
      id: '2',
      title: 'My Driveway Spot',
      address: '456 Oak Ave, Los Angeles',
      hourlyRate: 5,
      rating: 4.8,
      reviews: 12,
      status: 'active',
      bookings: 3,
      imageUrl: null
    }
  ];

  const BookingCard = ({ booking }: { booking: any }) => (
    <Card className="p-4">
      <div className="flex gap-3">
        <div className="w-20 h-20 rounded-lg bg-muted flex-shrink-0" />
        
        <div className="flex-1 space-y-2">
          <div className="flex justify-between items-start">
            <h3 className="font-semibold text-base">{booking.title}</h3>
            <Badge variant={booking.status === 'upcoming' ? 'default' : 'secondary'}>
              {booking.status}
            </Badge>
          </div>
          
          <div className="flex items-start gap-1 text-sm text-muted-foreground">
            <MapPin className="h-3 w-3 flex-shrink-0 mt-0.5" />
            <span>{booking.address}</span>
          </div>
          
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>{booking.date}</span>
          </div>
          
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{booking.time}</span>
          </div>
          
          <div className="flex justify-between items-center pt-2">
            <div>
              <p className="font-bold text-lg">${booking.price}</p>
              <p className="text-xs text-muted-foreground">{booking.duration}</p>
            </div>
            <Button size="sm" variant="outline">View Details</Button>
          </div>
        </div>
      </div>
    </Card>
  );

  const ListingCard = ({ listing }: { listing: any }) => (
    <Card className="p-4">
      <div className="flex gap-3">
        <div className="w-20 h-20 rounded-lg bg-muted flex-shrink-0" />
        
        <div className="flex-1 space-y-2">
          <div className="flex justify-between items-start">
            <h3 className="font-semibold text-base">{listing.title}</h3>
            <Badge variant={listing.status === 'active' ? 'default' : 'secondary'}>
              {listing.status}
            </Badge>
          </div>
          
          <div className="flex items-start gap-1 text-sm text-muted-foreground">
            <MapPin className="h-3 w-3 flex-shrink-0 mt-0.5" />
            <span>{listing.address}</span>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              <span className="font-medium text-sm">{listing.rating}</span>
              <span className="text-muted-foreground text-sm">({listing.reviews})</span>
            </div>
            <span className="text-sm text-muted-foreground">{listing.bookings} bookings</span>
          </div>
          
          <div className="flex justify-between items-center pt-2">
            <p className="font-bold text-lg">${listing.hourlyRate}/hr</p>
            <Button size="sm" variant="outline">Manage</Button>
          </div>
        </div>
      </div>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="p-4 space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Activity</h1>
          <p className="text-sm text-muted-foreground">Manage your bookings and listings</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="spots">Your Spots</TabsTrigger>
            <TabsTrigger value="listings">Your Listings</TabsTrigger>
          </TabsList>
          
          <TabsContent value="spots" className="space-y-3 mt-4">
            {bookedSpots.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">No bookings yet</p>
                <Button onClick={() => navigate('/')}>Find Parking</Button>
              </div>
            ) : (
              bookedSpots.map((booking) => (
                <BookingCard key={booking.id} booking={booking} />
              ))
            )}
          </TabsContent>
          
          <TabsContent value="listings" className="space-y-3 mt-4">
            {listedSpots.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">No listings yet</p>
                <Button onClick={() => navigate('/add-spot')}>Add a Spot</Button>
              </div>
            ) : (
              listedSpots.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Activity;
