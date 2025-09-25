import React, { useState, useEffect } from 'react';
import { ArrowLeft, Map, List, Filter, Star, MapPin, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import MapView from '@/components/map/MapView';

const SearchResults = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const [parkingSpots, setParkingSpots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get search parameters
  const location = searchParams.get('location') || 'Downtown San Francisco';
  const checkIn = searchParams.get('checkIn') || '';
  const checkOut = searchParams.get('checkOut') || '';

  useEffect(() => {
    searchParkingSpots();
  }, [location, checkIn, checkOut]);

  const searchParkingSpots = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get coordinates based on location - default to University Park, LA
      const getCoordinates = (locationName: string) => {
        // University Park (USC area) coordinates
        const defaultCoords = { lat: 34.0224, lng: -118.2851 };
        
        const locationMap: { [key: string]: { lat: number; lng: number } } = {
          'university park': { lat: 34.0224, lng: -118.2851 },
          'downtown los angeles': { lat: 34.0522, lng: -118.2437 },
          'west hollywood': { lat: 34.0900, lng: -118.3617 },
          'santa monica': { lat: 34.0195, lng: -118.4912 },
          'beverly hills': { lat: 34.0736, lng: -118.4004 },
          'venice': { lat: 34.0052, lng: -118.4810 },
          'manhattan beach': { lat: 33.8847, lng: -118.4109 },
          'hermosa beach': { lat: 33.8622, lng: -118.3998 },
          'hollywood': { lat: 34.0928, lng: -118.3287 },
          'westwood': { lat: 34.0669, lng: -118.4456 },
          'culver city': { lat: 34.0211, lng: -118.3965 },
          'marina del rey': { lat: 33.9802, lng: -118.4517 },
          'koreatown': { lat: 34.0579, lng: -118.3009 },
          'east los angeles': { lat: 34.0236, lng: -118.1720 },
          'pasadena': { lat: 34.1478, lng: -118.1445 }
        };
        
        const normalized = locationName.toLowerCase();
        for (const [key, coords] of Object.entries(locationMap)) {
          if (normalized.includes(key)) {
            return coords;
          }
        }
        return defaultCoords;
      };

      const coords = getCoordinates(location);
      const latitude = coords.lat;
      const longitude = coords.lng;
      
      // Create start and end times for the search
      const startTime = new Date(`${checkIn}T09:00:00.000Z`).toISOString();
      const endTime = new Date(`${checkOut}T18:00:00.000Z`).toISOString();

      console.log('Searching spots with params:', {
        latitude,
        longitude,
        start_time: startTime,
        end_time: endTime
      });

      const { data, error } = await supabase.functions.invoke('search-spots', {
        body: {
          latitude,
          longitude,
          radius: 40000, // 40km radius to cover all of LA
          start_time: startTime,
          end_time: endTime
        }
      });

      if (error) {
        console.error('Search error:', error);
        setError('Failed to search parking spots');
        return;
      }

      console.log('Search results:', data);

      // Transform the data to match our component structure
      const transformedSpots = data.spots?.map((spot: any) => ({
        id: spot.id,
        title: spot.title,
        address: spot.address,
        hourlyRate: parseFloat(spot.hourly_rate),
        rating: parseFloat(spot.profiles?.rating || 0),
        reviews: spot.profiles?.review_count || 0,
        lat: parseFloat(spot.latitude),
        lng: parseFloat(spot.longitude),
        imageUrl: spot.spot_photos?.find((photo: any) => photo.is_primary)?.url || spot.spot_photos?.[0]?.url,
        distance: spot.distance ? `${(spot.distance / 1000).toFixed(1)} km` : undefined,
        amenities: [
          ...(spot.has_ev_charging ? ['EV Charging'] : []),
          ...(spot.is_covered ? ['Covered'] : []),
          ...(spot.is_secure ? ['Secure'] : []),
        ]
      })) || [];

      setParkingSpots(transformedSpots);
    } catch (err) {
      console.error('Unexpected error:', err);
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

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
              <h1 className="font-semibold">
                {loading ? 'Searching...' : `${parkingSpots.length} spots nearby`}
              </h1>
              <p className="text-sm text-muted-foreground">{location}</p>
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
      {loading ? (
        <div className="flex items-center justify-center h-[calc(100vh-200px)]">
          <div className="text-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin mx-auto" />
            <p className="text-muted-foreground">Searching for parking spots...</p>
          </div>
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-[calc(100vh-200px)]">
          <div className="text-center space-y-4">
            <p className="text-red-500">{error}</p>
            <Button onClick={() => searchParkingSpots()}>Try Again</Button>
          </div>
        </div>
      ) : parkingSpots.length === 0 ? (
        <div className="flex items-center justify-center h-[calc(100vh-200px)]">
          <div className="text-center space-y-4">
            <p className="text-muted-foreground">No parking spots found</p>
            <Button onClick={() => navigate('/')}>Search Again</Button>
          </div>
        </div>
      ) : viewMode === 'map' ? (
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