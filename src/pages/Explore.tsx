import React, { useState, useEffect, useRef } from 'react';
import { Loader2, Search, X, MapPin, Calendar, Clock, ArrowRight, Navigation } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import MapView from '@/components/map/MapView';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { format, isToday } from 'date-fns';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { TimePicker } from '@/components/ui/time-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
const Explore = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [parkingSpots, setParkingSpots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState({
    lat: 34.0224,
    lng: -118.2851
  }); // Default to University Park
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mapboxToken, setMapboxToken] = useState('');
  const searchTimeoutRef = useRef<NodeJS.Timeout>();
  const sessionTokenRef = useRef<string>(crypto.randomUUID());
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [endTime, setEndTime] = useState<Date | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);

  // Ensure end time is always after start time
  const validateAndSetTimes = (newStartTime: Date, newEndTime: Date | null) => {
    let validatedEndTime = newEndTime;
    
    // If end time is before or equal to new start time, set it to 2 hours after
    if (!validatedEndTime || validatedEndTime <= newStartTime) {
      validatedEndTime = new Date(newStartTime.getTime() + 2 * 60 * 60 * 1000);
    }
    
    setStartTime(newStartTime);
    setEndTime(validatedEndTime);
    
    return { startTime: newStartTime, endTime: validatedEndTime };
  };

  const handleStartTimeChange = (date: Date) => {
    const { startTime: validatedStart, endTime: validatedEnd } = validateAndSetTimes(date, endTime);
    handleDateTimeUpdate(validatedStart, validatedEnd);
  };
  
  const handleEndTimeChange = (date: Date) => {
    // Only set if it's after start time
    if (startTime && date > startTime) {
      setEndTime(date);
      handleDateTimeUpdate(startTime, date);
    }
  };
  const fetchTimeoutRef = useRef<NodeJS.Timeout>();

  // Function to reverse geocode coordinates to address
  const reverseGeocode = async (lat: number, lng: number) => {
    if (!mapboxToken) return null;
    
    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxToken}&types=address,neighborhood,place`
      );
      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        return data.features[0].place_name;
      }
    } catch (error) {
      console.error('Error reverse geocoding:', error);
    }
    return null;
  };

  useEffect(() => {
    fetchMapboxToken();

    // Check for URL parameters
    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');
    const start = searchParams.get('start');
    const end = searchParams.get('end');
    const query = searchParams.get('q');
    if (lat && lng) {
      const location = {
        lat: parseFloat(lat),
        lng: parseFloat(lng)
      };
      setUserLocation(location);
      if (query) {
        setSearchQuery(query);
      } else if (mapboxToken) {
        // Get address for the location
        reverseGeocode(location.lat, location.lng).then(address => {
          if (address) setSearchQuery(address);
        });
      }
      // Fetch spots for the initial location
      const startDate = start ? new Date(start) : new Date();
      const endDate = end ? new Date(end) : new Date(Date.now() + 24 * 60 * 60 * 1000);
      if (start) setStartTime(startDate);
      if (end) setEndTime(endDate);
      fetchNearbySpots(location, 15000, true);
    } else {
      // Get user's current location
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (position) => {
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setUserLocation(location);
          
          // Get address for current location
          if (mapboxToken) {
            const address = await reverseGeocode(location.lat, location.lng);
            if (address) setSearchQuery(address);
          }
          
          fetchNearbySpots(location, 15000, true);
        }, error => {
          console.log('Location access denied, using default location');
          fetchNearbySpots(userLocation, 15000, true);
          // Set default location name
          setSearchQuery('University Park, Los Angeles');
        });
      } else {
        fetchNearbySpots(userLocation, 15000, true);
        setSearchQuery('University Park, Los Angeles');
      }
      if (start) setStartTime(new Date(start));
      if (end) setEndTime(new Date(end));
    }
  }, [searchParams, mapboxToken]);
  const fetchMapboxToken = async () => {
    try {
      const {
        data
      } = await supabase.functions.invoke('get-mapbox-token');
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
  const handleSelectLocation = async (location: any) => {
    if (!mapboxToken || !location.mapbox_id) return;
    
    try {
      const retrieveUrl = `https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(location.mapbox_id)}?access_token=${mapboxToken}&session_token=${sessionTokenRef.current}`;
      
      console.log('[Search Box API] Retrieving:', retrieveUrl.replace(mapboxToken, 'TOKEN'));
      
      const response = await fetch(retrieveUrl);
      const data = await response.json();
      
      console.log('[Search Box API] Retrieve response:', data);
      
      if (data?.features?.[0]?.geometry?.coordinates) {
        const [lng, lat] = data.features[0].geometry.coordinates;
        const placeName = location.name || location.place_formatted || location.full_address;
        
        const newLocation = { lat, lng };
        setUserLocation(newLocation);
        setSearchQuery(placeName);
        setShowSuggestions(false);
        setSuggestions([]);
        
        // Fetch spots for the new search location
        fetchNearbySpots(newLocation, 15000, false);
        
        // Regenerate session token for next search session
        sessionTokenRef.current = crypto.randomUUID();
        console.log('[Search Box API] Session token regenerated');
      }
    } catch (error) {
      console.error('[Search Box API] Retrieve error:', error);
    }
  };

  const handleSearchSubmit = async () => {
    if (!searchQuery.trim() || !mapboxToken) return;
    
    // Search for the location using Search Box API
    try {
      const socal_center = { lat: 34.0522, lng: -118.2437 };
      
      const response = await fetch(
        `https://api.mapbox.com/search/searchbox/v1/suggest?` +
        `q=${encodeURIComponent(searchQuery)}` +
        `&access_token=${mapboxToken}` +
        `&limit=1` +
        `&types=poi,address,place` +
        `&proximity=${socal_center.lng},${socal_center.lat}` +
        `&country=US` +
        `&bbox=-119.5,32.5,-117.0,34.8`
      );
      const data = await response.json();
      
      if (data.suggestions && data.suggestions.length > 0) {
        handleSelectLocation(data.suggestions[0]);
      }
    } catch (error) {
      console.error('Error searching location:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearchSubmit();
    }
  };

  const handleGoToCurrentLocation = () => {
    setIsLoadingLocation(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (position) => {
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        setUserLocation(location);
        
        // Get address for current location
        if (mapboxToken) {
          const address = await reverseGeocode(location.lat, location.lng);
          if (address) setSearchQuery(address);
        }
        
        fetchNearbySpots(location, 15000, false);
        setIsLoadingLocation(false);
      }, error => {
        console.error('Error getting location:', error);
        setIsLoadingLocation(false);
      });
    }
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
      const {
        data,
        error
      } = await supabase.functions.invoke('search-spots', {
        body: {
          latitude: center.lat,
          longitude: center.lng,
          radius: Math.ceil(radius),
          // Dynamic radius based on viewport
          start_time: start.toISOString(),
          end_time: end.toISOString()
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
        amenities: [...(spot.has_ev_charging ? ['EV Charging'] : []), ...(spot.is_covered ? ['Covered'] : []), ...(spot.is_secure ? ['Secure'] : [])]
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
  const handleMapMove = (center: {
    lat: number;
    lng: number;
  }, radiusMeters: number) => {
    // Debounce map movement to avoid too many requests
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }
    fetchTimeoutRef.current = setTimeout(() => {
      fetchNearbySpots(center, radiusMeters, false); // Don't show loading on map movement
    }, 800); // Longer debounce to reduce requests
  };
  const handleDateTimeUpdate = (newStartTime?: Date, newEndTime?: Date) => {
    const effectiveStartTime = newStartTime || startTime;
    const effectiveEndTime = newEndTime || endTime;
    
    // Update URL params
    const params = new URLSearchParams();
    params.set('lat', userLocation.lat.toString());
    params.set('lng', userLocation.lng.toString());
    if (effectiveStartTime) params.set('start', effectiveStartTime.toISOString());
    if (effectiveEndTime) params.set('end', effectiveEndTime.toISOString());
    if (searchQuery) params.set('q', searchQuery);
    navigate(`/explore?${params.toString()}`, {
      replace: true
    });

    // Refetch spots with new times
    fetchNearbySpots(userLocation, 15000, false);
  };
  const formatDateDisplay = (date: Date) => {
    return isToday(date) ? 'Today' : format(date, 'MMM dd');
  };
  if (loading) {
    return <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
          <p className="text-muted-foreground">Loading map...</p>
        </div>
      </div>;
  }
  return <div className="h-[calc(100vh-64px)] relative">
      <div className="absolute top-4 left-4 right-4 z-10 space-y-2">
        <div className="relative max-w-md mx-auto">
          <div className="relative flex gap-2">
            <div className="relative flex-1">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input 
                value={searchQuery} 
                onChange={handleSearchChange} 
                onFocus={() => setShowSuggestions(true)} 
                onKeyDown={handleKeyDown}
                placeholder="Search by location, address, or landmark..." 
                className="pl-10 pr-10 bg-background/95 backdrop-blur-sm shadow-lg" 
              />
              {searchQuery && <button onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>}
            </div>
            <button 
              onClick={handleSearchSubmit}
              className="flex-shrink-0 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors shadow-lg"
            >
              <Search className="h-4 w-4" />
            </button>
            
            {showSuggestions && suggestions.length > 0 && <Card className="absolute top-full mt-2 w-full bg-background shadow-lg max-h-80 overflow-y-auto z-20">
                {suggestions.map((suggestion, index) => <button key={index} onMouseDown={e => {
              e.preventDefault();
              handleSelectLocation(suggestion);
            }} className="w-full text-left p-3 hover:bg-accent transition-colors border-b border-border last:border-0">
                    <div className="font-medium text-sm">{suggestion.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {suggestion.place_formatted || suggestion.full_address}
                    </div>
                  </button>)}
              </Card>}
          </div>
        </div>
        
        {(startTime || endTime) && <div className="max-w-md mx-auto">
            <Card className="p-2.5 bg-background/95 backdrop-blur-sm shadow-lg">
              <div className="flex items-center gap-2 text-sm justify-center mx-0">
                {startTime && <>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="flex items-center gap-1 hover:bg-accent/50 rounded px-1.5 py-1 transition-colors flex-shrink-0">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          <span className="whitespace-nowrap text-xs">{formatDateDisplay(startTime)}</span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent mode="single" selected={startTime} onSelect={date => {
                    if (date) {
                      const newDate = new Date(date);
                      newDate.setHours(startTime.getHours());
                      newDate.setMinutes(startTime.getMinutes());
                      handleStartTimeChange(newDate);
                    }
                  }} disabled={date => date < new Date()} initialFocus className="pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                    
                    <TimePicker date={startTime} setDate={handleStartTimeChange}>
                      <button className="flex items-center gap-1 hover:bg-accent/50 rounded px-1.5 py-1 transition-colors flex-shrink-0">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="whitespace-nowrap text-xs">{format(startTime, 'h:mma')}</span>
                      </button>
                    </TimePicker>
                  </>}
                
                {startTime && endTime && <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                
                {endTime && <>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="flex items-center gap-1 hover:bg-accent/50 rounded px-1.5 py-1 transition-colors flex-shrink-0">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          <span className="whitespace-nowrap text-xs">{formatDateDisplay(endTime)}</span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent mode="single" selected={endTime} onSelect={date => {
                    if (date) {
                      const newDate = new Date(date);
                      newDate.setHours(endTime.getHours());
                      newDate.setMinutes(endTime.getMinutes());
                      handleEndTimeChange(newDate);
                    }
                  }} disabled={date => {
                    if (!startTime) return date < new Date();
                    // Disable dates before start date
                    const startDateOnly = new Date(startTime);
                    startDateOnly.setHours(0, 0, 0, 0);
                    const checkDate = new Date(date);
                    checkDate.setHours(0, 0, 0, 0);
                    return checkDate < startDateOnly;
                  }} initialFocus className="pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                    
                    <TimePicker date={endTime} setDate={handleEndTimeChange}>
                      <button className="flex items-center gap-1 hover:bg-accent/50 rounded px-1.5 py-1 transition-colors flex-shrink-0">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="whitespace-nowrap text-xs">{format(endTime, 'h:mma')}</span>
                      </button>
                    </TimePicker>
                  </>}
              </div>
            </Card>
          </div>}
      </div>
      {/* Current Location Button */}
      <button
        onClick={handleGoToCurrentLocation}
        disabled={isLoadingLocation}
        className="absolute bottom-28 right-4 z-10 p-3 bg-background/95 backdrop-blur-sm shadow-lg rounded-full hover:bg-accent transition-colors disabled:opacity-50"
        title="Go to current location"
      >
        {isLoadingLocation ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Navigation className="h-5 w-5" />
        )}
      </button>

      <MapView 
        spots={parkingSpots} 
        searchCenter={userLocation} 
        currentLocation={userLocation}
        onVisibleSpotsChange={() => {}} 
        onMapMove={handleMapMove}
        searchQuery={searchQuery}
        exploreParams={{
          lat: userLocation?.lat.toString(),
          lng: userLocation?.lng.toString(),
          start: startTime?.toISOString(),
          end: endTime?.toISOString(),
          q: searchQuery
        }} 
      />
    </div>;
};
export default Explore;