import React, { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Star, MapPin, Loader2, Search, Plus, Activity, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useMode } from '@/contexts/ModeContext';

const Home = () => {
  const navigate = useNavigate();
  const { setMode } = useMode();
  const [parkingSpots, setParkingSpots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState({ lat: 34.0224, lng: -118.2851 }); // Default to University Park
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mapboxToken, setMapboxToken] = useState('');
  const searchTimeoutRef = useRef<NodeJS.Timeout>();
  const [startTime, setStartTime] = useState(new Date());
  const [endTime, setEndTime] = useState(new Date(Date.now() + 2 * 60 * 60 * 1000)); // 2 hours later

  useEffect(() => {
    // Fetch Mapbox public token
    (async () => {
      try {
        const { data } = await supabase.functions.invoke('get-mapbox-token');
        if (data?.token) setMapboxToken(data.token);
      } catch (e) {
        console.error('Error fetching Mapbox token:', e);
      }
    })();

    // Get user's location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setUserLocation({ lat, lng });
          
          // Reverse geocode to get place name and autofill search
          if (mapboxToken) {
            try {
              const response = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxToken}&limit=1`
              );
              const data = await response.json();
              if (data.features && data.features.length > 0) {
                setSearchQuery(data.features[0].place_name);
              }
            } catch (error) {
              console.error('Error reverse geocoding:', error);
            }
          }
        },
        () => {
          console.log('Location access denied, using default location');
        }
      );
    }
  }, [mapboxToken]);

  useEffect(() => {
    fetchNearbySpots();
  }, [userLocation]);

  const fetchNearbySpots = async () => {
    try {
      setLoading(true);
      const today = new Date().toISOString();
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase.functions.invoke('search-spots', {
        body: {
          latitude: userLocation.lat,
          longitude: userLocation.lng,
          radius: 5000, // 5km radius
          start_time: today,
          end_time: tomorrow
        }
      });

      if (error) {
        console.error('Search error:', error);
        return;
      }

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
    } finally {
      setLoading(false);
    }
  };

  const searchLocation = async (query: string) => {
    if (!query.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    if (!mapboxToken) {
      console.log('Mapbox token not ready yet');
      return;
    }
    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxToken}&limit=5&types=place,locality,neighborhood,address,poi`
      );
      const data = await response.json();
      if (data.features && data.features.length > 0) {
        setSuggestions(data.features);
        setShowSuggestions(true);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    } catch (error) {
      console.error('Error searching location:', error);
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      searchLocation(value);
    }, 300);
  };

  const handleSelectSuggestion = (feature: any) => {
    const placeName = feature.place_name || feature.text;
    setSearchQuery(placeName);
    setShowSuggestions(false);
    
    // Extract coordinates from Mapbox feature
    const [lng, lat] = feature.center;
    setUserLocation({ lat, lng });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && suggestions.length > 0) {
      handleSelectSuggestion(suggestions[0]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const SpotCard = ({ spot }: { spot: any }) => (
    <Card 
      className="p-4 cursor-pointer transition-all hover:shadow-md"
      onClick={() => navigate(`/spot/${spot.id}?from=home`)}
    >
      <div className="flex gap-3">
        <div className="w-20 h-20 rounded-lg bg-muted flex-shrink-0 overflow-hidden">
          {spot.imageUrl ? (
            <img 
              src={spot.imageUrl} 
              alt={spot.title}
              loading="lazy"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-muted" />
          )}
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
            <p className="text-sm text-muted-foreground">{spot.distance} away</p>
          )}
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              <span className="font-medium text-sm">{spot.rating}</span>
              <span className="text-muted-foreground text-sm">({spot.reviews})</span>
            </div>
          </div>

          {spot.amenities && spot.amenities.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {spot.amenities.slice(0, 3).map((amenity: string, index: number) => (
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

  const handleSearch = () => {
    if (!searchQuery.trim()) {
      toast.error('Please enter a location');
      return;
    }
    
    if (!startTime || !endTime) {
      toast.error('Please select start and end times');
      return;
    }

    // Navigate to explore page with location and time params
    if (userLocation) {
      navigate(`/explore?lat=${userLocation.lat}&lng=${userLocation.lng}&start=${startTime.toISOString()}&end=${endTime.toISOString()}&q=${encodeURIComponent(searchQuery)}`);
    }
  };

  const quickActions = [
    { 
      icon: Zap, 
      label: 'Instant Book',
      onClick: () => {
        const now = new Date();
        const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
        if (userLocation) {
          navigate(`/explore?lat=${userLocation.lat}&lng=${userLocation.lng}&start=${now.toISOString()}&end=${twoHoursLater.toISOString()}`);
        } else {
          navigate('/explore');
        }
      }
    },
    { 
      icon: Plus, 
      label: 'List Your Spot',
      onClick: () => {
        setMode('host');
        navigate('/add-spot');
      }
    },
    { 
      icon: Activity, 
      label: 'My Bookings',
      onClick: () => navigate('/activity')
    },
  ];

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="p-4 space-y-6">
        {/* Search Card */}
        <Card className="p-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input 
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
              onKeyDown={handleKeyDown}
              placeholder="Where do you need parking?" 
              className="pl-10 h-12 text-base"
            />

            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-50 mt-2 bg-background border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {suggestions.map((s, idx) => (
                  <button
                    key={idx}
                    onMouseDown={(e) => { e.preventDefault(); handleSelectSuggestion(s); }}
                    className="w-full text-left px-4 py-3 hover:bg-accent transition-colors border-b border-border last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{s.text}</span>
                        <span className="text-xs text-muted-foreground">{s.place_name}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="font-semibold mb-4">When do you need parking?</p>
            
            <div className="space-y-3">
              <DateTimePicker
                date={startTime}
                setDate={setStartTime}
                label="Start Time"
                minDate={new Date()}
              />

              <DateTimePicker
                date={endTime}
                setDate={setEndTime}
                label="End Time"
                minDate={startTime}
              />
            </div>
          </div>

          <Button 
            onClick={handleSearch}
            className="w-full h-12 text-base"
            size="lg"
          >
            <Search className="mr-2 h-5 w-5" />
            Find Parking
          </Button>
        </Card>

        {/* Quick Actions */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Quick Actions</h2>
          <div className="grid grid-cols-3 gap-3">
            {quickActions.map((action, index) => {
              const Icon = action.icon;
              return (
                <Card 
                  key={index}
                  className="p-2 cursor-pointer hover:shadow-md transition-all"
                  onClick={action.onClick}
                >
                  <div className="flex flex-col items-center text-center space-y-1">
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-medium">{action.label}</span>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Nearby Spots */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin mx-auto" />
              <p className="text-muted-foreground">Finding nearby spots...</p>
            </div>
          </div>
        ) : parkingSpots.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">No parking spots found nearby</p>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Nearby Spots</h2>
            {parkingSpots.map((spot) => (
              <SpotCard key={spot.id} spot={spot} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;
