import React, { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MobileTimePicker } from '@/components/booking/MobileTimePicker';
import { format, isToday, addHours } from 'date-fns';
import { CalendarIcon, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Star, MapPin, Loader2, Search, Plus, Activity, Zap, Navigation } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useMode } from '@/contexts/ModeContext';
import { useIsMobile } from '@/hooks/use-mobile';
import Index from './Index';

const Home = () => {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { setMode } = useMode();
  const [parkingSpots, setParkingSpots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationResolved, setLocationResolved] = useState(false); // Track if we've determined location
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mapboxToken, setMapboxToken] = useState('');
  const searchTimeoutRef = useRef<NodeJS.Timeout>();
  const sessionTokenRef = useRef<string>(crypto.randomUUID());
  const [startTime, setStartTime] = useState(new Date());
  const [endTime, setEndTime] = useState(new Date(Date.now() + 2 * 60 * 60 * 1000)); // 2 hours later
  const [mobileStartPickerOpen, setMobileStartPickerOpen] = useState(false);
  const [mobileEndPickerOpen, setMobileEndPickerOpen] = useState(false);

  // Ensure end time is always after start time
  const handleStartTimeChange = (date: Date) => {
    setStartTime(date);
    // If end time is before or equal to new start time, set it to 2 hours after
    if (endTime <= date) {
      setEndTime(new Date(date.getTime() + 2 * 60 * 60 * 1000));
    }
  };

  const handleEndTimeChange = (date: Date) => {
    // Only set if it's after start time
    if (date > startTime) {
      setEndTime(date);
    } else {
      toast.error('End time must be after start time');
    }
  };

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
          setLocationResolved(true);
          
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
          // Use default location when denied
          setUserLocation({ lat: 34.0224, lng: -118.2851 });
          setLocationResolved(true);
        }
      );
    } else {
      // No geolocation support, use default
      setUserLocation({ lat: 34.0224, lng: -118.2851 });
      setLocationResolved(true);
    }
  }, [mapboxToken]);

  useEffect(() => {
    // Only fetch spots once location is resolved
    if (locationResolved && userLocation) {
      fetchNearbySpots();
    }
  }, [locationResolved, userLocation]);

  const fetchNearbySpots = async () => {
    if (!userLocation) return;
    
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
        category: spot.category,
        address: spot.address,
        hourlyRate: parseFloat(spot.hourly_rate),
        rating: spot.spot_rating || 0,
        reviews: spot.spot_review_count || 0,
        lat: parseFloat(spot.latitude),
        lng: parseFloat(spot.longitude),
        imageUrl: spot.spot_photos?.find((photo: any) => photo.is_primary)?.url || spot.spot_photos?.[0]?.url,
        distance: spot.distance ? `${(spot.distance / 1000).toFixed(1)} km` : undefined,
        amenities: [
          ...(spot.has_ev_charging ? ['EV Charging'] : []),
          ...(spot.is_covered ? ['Covered'] : []),
          ...(spot.is_secure ? ['Secure'] : []),
        ],
        hostId: spot.host_id
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
      // Fixed Southern California proximity (Downtown LA)
      const socal_center = { lat: 34.0522, lng: -118.2437 };
      
      const url = `https://api.mapbox.com/search/searchbox/v1/suggest?` +
        `q=${encodeURIComponent(query)}` +
        `&access_token=${mapboxToken}` +
        `&session_token=${sessionTokenRef.current}` +
        `&limit=8` +
        `&types=poi,address,place` +
        `&proximity=${socal_center.lng},${socal_center.lat}` +
        `&country=US` +
        `&bbox=-119.5,32.5,-117.0,34.8`;
      
      console.log('[Search Box API] Calling:', url.replace(mapboxToken, 'TOKEN'));
      
      const response = await fetch(url);
      const data = await response.json();
      
      console.log('[Search Box API] Response:', data);
      
      if (data.suggestions && data.suggestions.length > 0) {
        console.log('[Search Box API] Found', data.suggestions.length, 'suggestions');
        setSuggestions(data.suggestions);
        setShowSuggestions(true);
      } else {
        console.log('[Search Box API] No suggestions found');
        setSuggestions([]);
        setShowSuggestions(false);
      }
    } catch (error) {
      console.error('[Search Box API] Error:', error);
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

  const handleSelectSuggestion = async (suggestion: any) => {
    if (!mapboxToken || !suggestion.mapbox_id) return;
    
    try {
      const retrieveUrl = `https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(suggestion.mapbox_id)}?access_token=${mapboxToken}&session_token=${sessionTokenRef.current}`;
      
      console.log('[Search Box API] Retrieving:', retrieveUrl.replace(mapboxToken, 'TOKEN'));
      
      const response = await fetch(retrieveUrl);
      const data = await response.json();
      
      console.log('[Search Box API] Retrieve response:', data);
      
      if (data?.features?.[0]?.geometry?.coordinates) {
        const [lng, lat] = data.features[0].geometry.coordinates;
        const placeName = suggestion.name || suggestion.place_formatted || suggestion.full_address;
        
        setSearchQuery(placeName);
        setUserLocation({ lat, lng });
        setShowSuggestions(false);
        
        // Regenerate session token for next search session
        sessionTokenRef.current = crypto.randomUUID();
        console.log('[Search Box API] Session token regenerated');
      }
    } catch (error) {
      console.error('[Search Box API] Retrieve error:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && suggestions.length > 0) {
      handleSelectSuggestion(suggestions[0]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation || !mapboxToken) return;
    
    setShowSuggestions(false);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setUserLocation({ lat, lng });
        
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
      },
      (error) => {
        console.error('Error getting location:', error);
        toast.error('Could not get your location');
      }
    );
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
            <div className="flex-1">
              {spot.category && (
                <Badge variant="secondary" className="text-xs px-2 py-0.5 mb-1">
                  {spot.category}
                </Badge>
              )}
            </div>
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
        navigate('/dashboard');
      }
    },
    { 
      icon: Activity, 
      label: 'My Bookings',
      onClick: () => navigate('/activity')
    },
  ];

  // Show desktop landing page on non-mobile
  if (!isMobile) {
    return <Index />;
  }

  return (
    <div className="bg-background">
      <div className="p-4 space-y-6">
        {/* Search Card */}
        <Card className="p-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input 
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              onKeyDown={handleKeyDown}
              placeholder="Where do you need parking?" 
              className="pl-10 h-12 text-base"
            />

            {showSuggestions && (
              <div className="absolute top-full left-0 right-0 z-50 mt-2 bg-background border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {/* Use Current Location Option */}
                <button
                  onMouseDown={(e) => { e.preventDefault(); handleUseCurrentLocation(); }}
                  className="w-full text-left px-4 py-3 hover:bg-accent transition-colors border-b border-border"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Navigation className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-primary">Use current location</span>
                      <span className="text-xs text-muted-foreground">Find parking near you</span>
                    </div>
                  </div>
                </button>
                
                {/* Search Suggestions */}
                {suggestions.map((s, idx) => (
                  <button
                    key={idx}
                    onMouseDown={(e) => { e.preventDefault(); handleSelectSuggestion(s); }}
                    className="w-full text-left px-4 py-3 hover:bg-accent transition-colors border-b border-border last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{s.name}</span>
                        <span className="text-xs text-muted-foreground">{s.place_formatted || s.full_address}</span>
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
              {/* Start Time */}
              <button
                onClick={() => setMobileStartPickerOpen(true)}
                className="w-full flex items-center gap-3 p-3 rounded-lg border bg-background hover:bg-accent transition-colors text-left"
              >
                <CalendarIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground">Start Time</div>
                  <div className="text-sm font-medium truncate">
                    {format(startTime, 'MMM d, yyyy')} · {format(startTime, 'h:mm a')}
                  </div>
                </div>
              </button>

              {/* End Time */}
              <button
                onClick={() => setMobileEndPickerOpen(true)}
                className="w-full flex items-center gap-3 p-3 rounded-lg border bg-background hover:bg-accent transition-colors text-left"
              >
                <Clock className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground">End Time</div>
                  <div className="text-sm font-medium truncate">
                    {format(endTime, 'MMM d, yyyy')} · {format(endTime, 'h:mm a')}
                  </div>
                </div>
              </button>
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
        {!locationResolved ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center space-y-4">
              <MapPin className="h-8 w-8 animate-pulse mx-auto text-primary" />
              <p className="text-muted-foreground">Detecting your location...</p>
            </div>
          </div>
        ) : loading ? (
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

      {/* Mobile Time Pickers */}
      {mobileStartPickerOpen && (
        <MobileTimePicker
          isOpen={mobileStartPickerOpen}
          onClose={() => setMobileStartPickerOpen(false)}
          onConfirm={(date) => {
            handleStartTimeChange(date);
            setMobileStartPickerOpen(false);
          }}
          mode="start"
          initialValue={startTime}
        />
      )}

      {mobileEndPickerOpen && (
        <MobileTimePicker
          isOpen={mobileEndPickerOpen}
          onClose={() => setMobileEndPickerOpen(false)}
          onConfirm={(date) => {
            handleEndTimeChange(date);
            setMobileEndPickerOpen(false);
          }}
          mode="end"
          startTime={startTime}
          initialValue={endTime}
        />
      )}
    </div>
  );
};

export default Home;
