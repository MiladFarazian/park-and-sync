import React, { useState } from 'react';
import { ArrowLeft, Map, List, Filter, Star, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import MapView from '@/components/map/MapView';

const SearchResults = () => {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');

  const parkingSpots = [
    {
      id: 1,
      title: 'Premium Downtown Garage',
      address: '123 Main St',
      hourlyRate: 8,
      rating: 4.9,
      reviews: 124,
      status: 'Available Now',
      lat: 37.7749,
      lng: -122.4194,
      amenities: ['Covered', 'Security Camera', '24/7 Access']
    },
    {
      id: 2,
      title: 'Central Mall Parking',
      address: '100 Mall Center Drive, San Francisco, CA 94103',
      hourlyRate: 6,
      rating: 4.6,
      reviews: 89,
      distance: '1.1 mi',
      walkTime: '15 min walk',
      lat: 37.7849,
      lng: -122.4094,
      amenities: ['Shopping Access', 'Food Court', 'Restrooms']
    },
    {
      id: 3,
      title: 'Safe Residential Driveway',
      address: '456 Oak Ave',
      hourlyRate: 5,
      rating: 4.8,
      reviews: 67,
      status: 'Available in 30 min',
      lat: 37.7649,
      lng: -122.4294,
      amenities: ['Residential', 'Well Lit', 'Easy Access']
    }
  ];

  const SpotCard = ({ spot, isSelected = false }: { spot: any, isSelected?: boolean }) => (
    <Card 
      className={`p-4 cursor-pointer transition-all ${isSelected ? 'ring-2 ring-primary' : 'hover:shadow-md'}`}
      onClick={() => navigate(`/spot/${spot.id}`)}
    >
      <div className="flex gap-3">
        <div className="w-20 h-20 rounded-lg bg-muted flex-shrink-0">
          <img 
            src="/placeholder.svg" 
            alt={spot.title}
            className="w-full h-full object-cover rounded-lg"
          />
        </div>
        
        <div className="flex-1 space-y-2 min-w-0">
          <div className="flex justify-between items-start gap-2">
            <h3 className="font-semibold text-base leading-tight">{spot.title}</h3>
            <div className="text-right flex-shrink-0">
              <p className="font-bold text-primary text-lg">${spot.hourlyRate}/hr</p>
            </div>
          </div>
          
          <div className="flex items-start gap-1 text-sm text-muted-foreground">
            <MapPin className="h-3 w-3 flex-shrink-0 mt-0.5" />
            <span className="leading-tight">{spot.address}</span>
          </div>
          
          {spot.distance && (
            <p className="text-sm text-muted-foreground">{spot.distance} • {spot.walkTime}</p>
          )}
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              <span className="font-medium text-sm">{spot.rating}</span>
              <span className="text-muted-foreground text-sm">({spot.reviews})</span>
            </div>
            
            {spot.status && (
              <Badge 
                variant={spot.status === 'Available Now' ? 'default' : 'secondary'}
                className={spot.status === 'Available Now' ? 'bg-green-100 text-green-800 text-xs' : 'text-xs'}
              >
                {spot.status}
              </Badge>
            )}
          </div>

          {spot.amenities && (
            <div className="flex gap-1 flex-wrap">
              {spot.amenities.slice(0, 3).map((amenity, index) => (
                <Badge key={index} variant="outline" className="text-xs px-1.5 py-0.5">
                  {amenity}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="p-4 border-b bg-background sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="font-semibold">4 spots nearby</h1>
              <p className="text-sm text-muted-foreground">Downtown San Francisco</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="flex bg-muted rounded-lg p-1">
              <Button
                variant={viewMode === 'map' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('map')}
                className="h-8"
              >
                <Map className="h-4 w-4 mr-1" />
                Map
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
                className="h-8"
              >
                <List className="h-4 w-4 mr-1" />
                List
              </Button>
            </div>
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'map' ? (
        <div className="relative h-[calc(100vh-140px)]">
          <MapView spots={parkingSpots} />
        </div>
      ) : (
        <div className="p-4 space-y-3">
          {parkingSpots.map((spot) => (
            <SpotCard key={spot.id} spot={spot} />
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchResults;