import React, { useState, useEffect, useRef } from 'react';
import { Loader2, Search, X, MapPin, Calendar, Clock, Edit2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import MapView from '@/components/map/MapView';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

const Explore = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [parkingSpots, setParkingSpots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState({ lat: 34.0224, lng: -118.2851 }); // Default to University Park
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mapboxToken, setMapboxToken] = useState('');
  const searchTimeoutRef = useRef<NodeJS.Timeout>();
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [endTime, setEndTime] = useState<Date | null>(null);
  const fetchTimeoutRef = useRef<NodeJS.Timeout>();
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  useEffect(() => {
    fetchMapboxToken();
    
    // Check for URL parameters
    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');
    const start = searchParams.get('start');
    const end = searchParams.get('end');
    const query = searchParams.get('q');
    
    if (lat && lng) {
      const location = { lat: parseFloat(lat), lng: parseFloat(lng) };
      setUserLocation(location);
      if (query) setSearchQuery(query);
      // Fetch spots for the initial location
      const startDate = start ? new Date(start) : new Date();
      const endDate = end ? new Date(end) : new Date(Date.now() + 24 * 60 * 60 * 1000);
      if (start) setStartTime(startDate);
      if (end) setEndTime(endDate);
      fetchNearbySpots(location, 15000, true);
    } else {
      // Get user's current location
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const location = {
              lat: position.coords.latitude,
              lng: position.coords.longitude
            };
            setUserLocation(location);
            fetchNearbySpots(location, 15000, true);
          },
          (error) => {
            console.log('Location access denied, using default location');
            fetchNearbySpots(userLocation, 15000, true);
          }
        );
      } else {
        fetchNearbySpots(userLocation, 15000, true);
      }
      
      if (start) setStartTime(new Date(start));
      if (end) setEndTime(new Date(end));
    }
  }, [searchParams]);

  const fetchMapboxToken = async () => {
    try {
      const { data } = await supabase.functions.invoke('get-mapbox-token');
      if (data?.token) {
        setMapboxToken(data.token);
      }
    } catch (error) {
      console.error('Error fetching Mapbox token:', error);
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

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    setShowSuggestions(true);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      searchLocation(value);
    }, 300);
  };

  const handleSelectLocation = (location: any) => {
    const [lng, lat] = location.center;
    const newLocation = { lat, lng };
    setUserLocation(newLocation);
    setSearchQuery(location.place_name);
    setShowSuggestions(false);
    setSuggestions([]);
    // Fetch spots for the new search location
    fetchNearbySpots(newLocation, 15000, false);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const fetchNearbySpots = async (center = userLocation, radius = 15000, isInitialLoad = true) => {
    try {
      if (isInitialLoad) {
        setLoading(true);
      }
      
      // Use provided times or default to now + 24 hours
      const start = startTime || new Date();
      const end = endTime || new Date(Date.now() + 24 * 60 * 60 * 1000);

      const { data, error } = await supabase.functions.invoke('search-spots', {
        body: {
          latitude: center.lat,
          longitude: center.lng,
          radius: Math.ceil(radius), // Dynamic radius based on viewport
          start_time: start.toISOString(),
          end_time: end.toISOString(),
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
      if (isInitialLoad) {
        setLoading(false);
      }
    }
  };

  const handleMapMove = (center: { lat: number; lng: number }, radiusMeters: number) => {
    // Debounce map movement to avoid too many requests
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }

    fetchTimeoutRef.current = setTimeout(() => {
      fetchNearbySpots(center, radiusMeters, false); // Don't show loading on map movement
    }, 800); // Longer debounce to reduce requests
  };

  const handleDateTimeUpdate = () => {
    // Update URL params
    const params = new URLSearchParams();
    params.set('lat', userLocation.lat.toString());
    params.set('lng', userLocation.lng.toString());
    if (startTime) params.set('start', startTime.toISOString());
    if (endTime) params.set('end', endTime.toISOString());
    if (searchQuery) params.set('q', searchQuery);
    navigate(`/explore?${params.toString()}`, { replace: true });
    
    // Refetch spots with new times
    fetchNearbySpots(userLocation, 15000, false);
    setDatePickerOpen(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
          <p className="text-muted-foreground">Loading map...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-64px)] relative">
      <div className="absolute top-4 left-4 right-4 z-10 space-y-2">
        <div className="relative max-w-md mx-auto">
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input 
              value={searchQuery}
              onChange={handleSearchChange}
              onFocus={() => setShowSuggestions(true)}
              placeholder="Search by location, address, or landmark..." 
              className="pl-10 pr-10 bg-background/95 backdrop-blur-sm shadow-lg"
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            
            {showSuggestions && suggestions.length > 0 && (
              <Card className="absolute top-full mt-2 w-full bg-background shadow-lg max-h-80 overflow-y-auto z-20">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectLocation(suggestion);
                    }}
                    className="w-full text-left p-3 hover:bg-accent transition-colors border-b border-border last:border-0"
                  >
                    <div className="font-medium text-sm">{suggestion.text}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {suggestion.place_name}
                    </div>
                  </button>
                ))}
              </Card>
            )}
          </div>
        </div>
        
        {(startTime || endTime) && (
          <div className="max-w-md mx-auto">
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <Card className="p-3 bg-background/95 backdrop-blur-sm shadow-lg cursor-pointer hover:bg-accent/5 transition-colors">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 text-sm flex-1">
                      {startTime && (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span>{format(startTime, 'MMM dd')}</span>
                          <Clock className="h-4 w-4 text-muted-foreground ml-2" />
                          <span>{format(startTime, 'h:mm a')}</span>
                        </div>
                      )}
                      {endTime && (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">to</span>
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span>{format(endTime, 'MMM dd')}</span>
                          <Clock className="h-4 w-4 text-muted-foreground ml-2" />
                          <span>{format(endTime, 'h:mm a')}</span>
                        </div>
                      )}
                    </div>
                    <Edit2 className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Card>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-4" align="center">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <DateTimePicker
                      date={startTime || undefined}
                      setDate={(date) => setStartTime(date || null)}
                      label="Start Date & Time"
                      minDate={new Date()}
                    />
                  </div>
                  <div className="space-y-2">
                    <DateTimePicker
                      date={endTime || undefined}
                      setDate={(date) => setEndTime(date || null)}
                      label="End Date & Time"
                      minDate={startTime || new Date()}
                    />
                  </div>
                  <Button onClick={handleDateTimeUpdate} className="w-full">
                    Update Search
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>
      <MapView 
        spots={parkingSpots} 
        searchCenter={userLocation}
        onVisibleSpotsChange={() => {}}
        onMapMove={handleMapMove}
        exploreParams={{
          lat: userLocation?.lat.toString(),
          lng: userLocation?.lng.toString(),
          start: startTime?.toISOString(),
          end: endTime?.toISOString(),
          q: searchQuery
        }}
      />
    </div>
  );
};

export default Explore;
