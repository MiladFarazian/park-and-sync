import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { MapPin, Clock, Shield, DollarSign, Search, Calendar, ChevronRight, Loader2, Navigation } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { MobileTimePicker } from '@/components/booking/MobileTimePicker';
import { useNavigate } from 'react-router-dom';
import { format, addHours } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import heroImage from '@/assets/hero-parking.jpg';

const HeroSection = () => {
  const navigate = useNavigate();
  const [searchLocation, setSearchLocation] = useState('');
  const [searchCoords, setSearchCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [startTime, setStartTime] = useState<Date>(addHours(new Date(), 1));
  const [endTime, setEndTime] = useState<Date>(addHours(new Date(), 3));
  const [mobileStartPickerOpen, setMobileStartPickerOpen] = useState(false);
  const [mobileEndPickerOpen, setMobileEndPickerOpen] = useState(false);
  const [mapboxToken, setMapboxToken] = useState('');
  const [isLoadingLocation, setIsLoadingLocation] = useState(true);
  
  const searchTimeoutRef = useRef<NodeJS.Timeout>();
  const sessionTokenRef = useRef<string>(crypto.randomUUID());

  // Fetch Mapbox token on mount
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const { data } = await supabase.functions.invoke('get-mapbox-token');
        if (data?.token) {
          setMapboxToken(data.token);
        }
      } catch (error) {
        console.error('Error fetching Mapbox token:', error);
      }
    };
    fetchToken();
  }, []);

  // Reverse geocode coordinates to address
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

  // Auto-detect current location on mount
  useEffect(() => {
    if (!mapboxToken) return;
    
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setSearchCoords(coords);
          
          // Get address for current location
          const address = await reverseGeocode(coords.lat, coords.lng);
          if (address) {
            setSearchLocation(address);
          }
          setIsLoadingLocation(false);
        },
        (error) => {
          console.error('Error getting location:', error);
          // Default to University Park if geolocation fails
          setSearchCoords({ lat: 34.0224, lng: -118.2851 });
          setSearchLocation('University Park, Los Angeles');
          setIsLoadingLocation(false);
        },
        { timeout: 5000 }
      );
    } else {
      setSearchCoords({ lat: 34.0224, lng: -118.2851 });
      setSearchLocation('University Park, Los Angeles');
      setIsLoadingLocation(false);
    }
  }, [mapboxToken]);

  // Search for locations using Mapbox Search Box API
  const searchByQuery = async (query: string) => {
    if (!query.trim() || !mapboxToken) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    try {
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
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.suggestions && data.suggestions.length > 0) {
        setSuggestions(data.suggestions);
        setShowSuggestions(true);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    } catch (error) {
      console.error('Search error:', error);
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchLocation(value);
    setSearchCoords(null); // Clear coords when typing new query
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      searchByQuery(value);
    }, 300);
  };

  const handleSelectLocation = async (location: any) => {
    if (!mapboxToken || !location.mapbox_id) return;
    
    try {
      const retrieveUrl = `https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(location.mapbox_id)}?access_token=${mapboxToken}&session_token=${sessionTokenRef.current}`;
      
      const response = await fetch(retrieveUrl);
      const data = await response.json();
      
      if (data?.features?.[0]?.geometry?.coordinates) {
        const [lng, lat] = data.features[0].geometry.coordinates;
        const placeName = location.name || location.place_formatted || location.full_address;
        
        setSearchCoords({ lat, lng });
        setSearchLocation(placeName);
        setShowSuggestions(false);
        setSuggestions([]);
        
        // Regenerate session token for next search session
        sessionTokenRef.current = crypto.randomUUID();
      }
    } catch (error) {
      console.error('Retrieve error:', error);
    }
  };

  const handleSearch = () => {
    if (searchCoords) {
      navigate(`/explore?lat=${searchCoords.lat}&lng=${searchCoords.lng}&start=${startTime.toISOString()}&end=${endTime.toISOString()}&q=${encodeURIComponent(searchLocation)}`);
    } else if (searchLocation.trim()) {
      // If no coords but has query, let Explore page resolve it
      navigate(`/explore?start=${startTime.toISOString()}&end=${endTime.toISOString()}&q=${encodeURIComponent(searchLocation)}`);
    } else {
      // Default fallback
      navigate(`/explore?lat=34.0224&lng=-118.2851&start=${startTime.toISOString()}&end=${endTime.toISOString()}&q=University Park, Los Angeles`);
    }
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation || !mapboxToken) return;
    
    setIsLoadingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        setSearchCoords(coords);
        
        const address = await reverseGeocode(coords.lat, coords.lng);
        if (address) {
          setSearchLocation(address);
        }
        setIsLoadingLocation(false);
        setShowSuggestions(false);
      },
      (error) => {
        console.error('Error getting location:', error);
        setIsLoadingLocation(false);
      }
    );
  };

  const handleStartTimeChange = (date: Date) => {
    setStartTime(date);
    if (endTime <= date) {
      setEndTime(new Date(date.getTime() + 2 * 60 * 60 * 1000));
    }
  };

  const handleEndTimeChange = (date: Date) => {
    if (date > startTime) {
      setEndTime(date);
    }
  };

  return (
    <section className="relative min-h-[calc(100vh-64px)] flex items-center bg-background">
      <div className="container mx-auto px-6 py-12 lg:py-20">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Left: Content */}
          <div className="space-y-8 lg:space-y-10">
            <div className="space-y-4">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight tracking-tight">
                Parking made easy,
                <span className="block text-foreground">wherever you go</span>
              </h1>
              <p className="text-lg text-muted-foreground max-w-lg">
                Book affordable parking near your destination in seconds. Compare prices and reserve your spot today.
              </p>
            </div>

            {/* Search Box - SpotHero Style */}
            <div className="bg-card border rounded-2xl p-6 space-y-4 shadow-lg">
              {/* Location Input with Mapbox Autofill */}
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none z-10" />
                <Input
                  value={searchLocation}
                  onChange={handleSearchChange}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => {
                    setTimeout(() => setShowSuggestions(false), 200);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder={isLoadingLocation ? "Detecting your location..." : "Where are you going?"}
                  className="pl-12 pr-12 h-14 text-base border-muted bg-muted/30 rounded-xl"
                />
                {isLoadingLocation ? (
                  <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground animate-spin" />
                ) : (
                  <button
                    onClick={handleUseCurrentLocation}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
                    title="Use current location"
                  >
                    <Navigation className="h-5 w-5" />
                  </button>
                )}
                
                {/* Suggestions Dropdown */}
                {showSuggestions && (
                  <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-background border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {/* Use Current Location Option */}
                    <button
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleUseCurrentLocation();
                        setShowSuggestions(false);
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border/50 focus:outline-none focus:bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Navigation className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-primary">Use current location</p>
                          <p className="text-xs text-muted-foreground">Find parking near you</p>
                        </div>
                      </div>
                    </button>
                    
                    {/* Search Suggestions */}
                    {suggestions.map((suggestion, index) => (
                      <button
                        key={suggestion.mapbox_id || index}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectLocation(suggestion);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border/50 last:border-b-0 focus:outline-none focus:bg-muted/50"
                      >
                        <div className="flex items-start gap-3">
                          <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{suggestion.name}</p>
                            {suggestion.place_formatted && (
                              <p className="text-xs text-muted-foreground truncate">{suggestion.place_formatted}</p>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Time Selection */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setMobileStartPickerOpen(true)}
                  className="flex items-center gap-3 p-4 rounded-xl border border-muted bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                >
                  <Calendar className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground font-medium">Start time</div>
                    <div className="text-sm font-semibold truncate">
                      {format(startTime, 'MMM d, h:mm a')}
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setMobileEndPickerOpen(true)}
                  className="flex items-center gap-3 p-4 rounded-xl border border-muted bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                >
                  <Clock className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground font-medium">End time</div>
                    <div className="text-sm font-semibold truncate">
                      {format(endTime, 'MMM d, h:mm a')}
                    </div>
                  </div>
                </button>
              </div>

              {/* Search Button */}
              <Button onClick={handleSearch} size="lg" className="w-full h-14 text-base font-semibold rounded-xl">
                Find Parking Spots
              </Button>
            </div>

            {/* List Your Spot CTA */}
            <button 
              onClick={() => navigate('/list-spot')}
              className="flex items-center gap-2 text-primary hover:text-primary/80 transition-colors font-medium"
            >
              <DollarSign className="h-5 w-5" />
              <span>Earn money by listing your parking spot</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Right: Hero Image */}
          <div className="relative hidden lg:block">
            <div className="relative rounded-3xl overflow-hidden shadow-2xl">
              <img 
                src={heroImage} 
                alt="Modern parking spot in urban setting"
                className="w-full h-[560px] object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
            </div>
            
            {/* Floating Stats Card */}
            <div className="absolute -bottom-6 -left-6 bg-card border rounded-2xl p-6 shadow-xl">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">10K+</p>
                  <p className="text-sm text-muted-foreground">Secure bookings</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Benefits Row - Desktop */}
        <div className="hidden lg:grid grid-cols-3 gap-8 mt-20 pt-12 border-t">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Clock className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="font-semibold">Book Instantly</p>
              <p className="text-sm text-muted-foreground">Real-time availability updates</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="font-semibold">Secure Payment</p>
              <p className="text-sm text-muted-foreground">Protected transactions</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <MapPin className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="font-semibold">Perfect Location</p>
              <p className="text-sm text-muted-foreground">Near your destination</p>
            </div>
          </div>
        </div>
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
    </section>
  );
};

export default HeroSection;
