import React, { useState } from 'react';
import { Plus, Star, MapPin, Edit, Eye, TrendingUp, Calendar, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';

const HostDashboard = () => {
  const [activeTab, setActiveTab] = useState('listings');
  const navigate = useNavigate();

  const listings = [
    {
      id: 1,
      title: 'Downtown Garage',
      address: '123 Main St',
      hourlyRate: 8,
      rating: 4.9,
      reviews: 127,
      earnings: 1245.60,
      status: 'Active',
      image: '/placeholder.svg'
    },
    {
      id: 2,
      title: 'Residential Driveway',
      address: '456 Oak Ave',
      hourlyRate: 5,
      rating: 4.8,
      reviews: 89,
      earnings: 875.40,
      status: 'Active',
      image: '/placeholder.svg'
    }
  ];

  const ListingCard = ({ listing }: { listing: any }) => (
    <Card className="p-4">
      <div className="flex gap-3">
        <div className="w-20 h-20 rounded-lg bg-muted flex-shrink-0 relative">
          <img 
            src={listing.image} 
            alt={listing.title}
            className="w-full h-full object-cover rounded-lg"
          />
          <div className="absolute top-1 left-1">
            <Badge variant="secondary" className="text-xs px-1.5 py-0.5">${listing.hourlyRate}/hr</Badge>
          </div>
        </div>
        
        <div className="flex-1 space-y-2 min-w-0">
          <div className="flex justify-between items-start gap-2">
            <h3 className="font-semibold text-base leading-tight">{listing.title}</h3>
            <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs flex-shrink-0">
              {listing.status}
            </Badge>
          </div>
          
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{listing.address}</span>
          </div>
          
          <div className="flex items-center gap-1 text-sm">
            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
            <span className="font-medium">{listing.rating}</span>
            <span className="text-muted-foreground">({listing.reviews})</span>
          </div>
          
          <div className="flex items-center justify-between pt-1">
            <p className="font-bold text-lg">${listing.earnings.toFixed(2)}</p>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="text-xs px-2 py-1"
                onClick={() => navigate(`/edit-availability/${listing.id}`)}
              >
                <Clock className="h-3 w-3 mr-1" />
                Schedule
              </Button>
              <Button variant="outline" size="sm" className="text-xs px-2 py-1">
                <Edit className="h-3 w-3 mr-1" />
                Edit
              </Button>
              <Button variant="outline" size="sm" className="text-xs px-2 py-1">
                <Eye className="h-3 w-3 mr-1" />
                View
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );

  return (
    <div className="p-4 space-y-6">
      {/* Header with Add Button */}
      <div className="pt-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Host Dashboard</h1>
          <p className="text-muted-foreground">Manage your listings</p>
        </div>
        <Button className="bg-primary text-primary-foreground">
          <Plus className="h-4 w-4 mr-2" />
          Add Spot
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4 bg-primary text-primary-foreground">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              <span className="text-sm opacity-90">Earnings</span>
            </div>
            <div>
              <p className="text-2xl font-bold">$2,121</p>
              <div className="flex items-center gap-1 text-sm opacity-75">
                <TrendingUp className="h-3 w-3" />
                <span>+15%</span>
              </div>
            </div>
          </div>
        </Card>
        
        <Card className="p-4 bg-primary text-primary-foreground">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span className="text-sm opacity-90">Bookings</span>
            </div>
            <div>
              <p className="text-2xl font-bold">145</p>
              <p className="text-sm opacity-75">12 this month</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="listings">Listings (2)</TabsTrigger>
          <TabsTrigger value="requests">Requests (2)</TabsTrigger>
        </TabsList>
        
        <TabsContent value="listings" className="space-y-3 mt-6">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </TabsContent>
        
        <TabsContent value="requests" className="space-y-3 mt-6">
          <Card className="p-6 text-center">
            <Calendar className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground">No pending requests</p>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default HostDashboard;