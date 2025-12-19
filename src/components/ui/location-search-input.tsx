import React, { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, X, Navigation, MapPin, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface LocationSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelectLocation: (location: { lat: number; lng: number; name: string }) => void;
  onClear?: () => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  isUsingCurrentLocation?: boolean;
  showPopularPOIs?: boolean;
}

interface POI {
  name: string;
  lat: number;
  lng: number;
  description: string;
}

interface RegionPOIs {
  [region: string]: POI[];
}

// Popular POIs by region
const POIS_BY_REGION: RegionPOIs = {
  'Los Angeles': [
    { name: 'LAX Airport', lat: 33.9425, lng: -118.4081, description: 'Los Angeles International Airport' },
    { name: 'Crypto.com Arena', lat: 34.0430, lng: -118.2673, description: 'Downtown Los Angeles' },
    { name: 'Hollywood Sign', lat: 34.1341, lng: -118.3215, description: 'Hollywood Hills' },
    { name: 'Santa Monica Pier', lat: 34.0100, lng: -118.4961, description: 'Santa Monica' },
    { name: 'Venice Beach', lat: 33.9850, lng: -118.4695, description: 'Venice' },
    { name: 'Dodger Stadium', lat: 34.0739, lng: -118.2400, description: 'Elysian Park' },
    { name: 'USC Campus', lat: 34.0224, lng: -118.2851, description: 'University Park' },
    { name: 'The Grove', lat: 34.0720, lng: -118.3576, description: 'Fairfax District' },
  ],
  'San Francisco': [
    { name: 'SFO Airport', lat: 37.6213, lng: -122.3790, description: 'San Francisco International Airport' },
    { name: 'Golden Gate Bridge', lat: 37.8199, lng: -122.4783, description: 'San Francisco' },
    { name: 'Fisherman\'s Wharf', lat: 37.8080, lng: -122.4177, description: 'San Francisco' },
    { name: 'Oracle Park', lat: 37.7786, lng: -122.3893, description: 'South Beach' },
    { name: 'Union Square', lat: 37.7879, lng: -122.4074, description: 'Downtown San Francisco' },
    { name: 'Pier 39', lat: 37.8087, lng: -122.4098, description: 'Fisherman\'s Wharf' },
    { name: 'Chinatown', lat: 37.7941, lng: -122.4078, description: 'San Francisco' },
    { name: 'AT&T Park', lat: 37.7786, lng: -122.3893, description: 'South Beach' },
  ],
  'San Diego': [
    { name: 'San Diego Airport', lat: 32.7338, lng: -117.1933, description: 'San Diego International Airport' },
    { name: 'San Diego Zoo', lat: 32.7353, lng: -117.1490, description: 'Balboa Park' },
    { name: 'Gaslamp Quarter', lat: 32.7120, lng: -117.1601, description: 'Downtown San Diego' },
    { name: 'La Jolla Cove', lat: 32.8506, lng: -117.2711, description: 'La Jolla' },
    { name: 'Petco Park', lat: 32.7076, lng: -117.1570, description: 'East Village' },
    { name: 'SeaWorld', lat: 32.7650, lng: -117.2263, description: 'Mission Bay' },
    { name: 'Coronado Beach', lat: 32.6859, lng: -117.1831, description: 'Coronado' },
    { name: 'USS Midway Museum', lat: 32.7137, lng: -117.1751, description: 'Downtown San Diego' },
  ],
  'New York': [
    { name: 'JFK Airport', lat: 40.6413, lng: -73.7781, description: 'John F. Kennedy International Airport' },
    { name: 'Times Square', lat: 40.7580, lng: -73.9855, description: 'Midtown Manhattan' },
    { name: 'Central Park', lat: 40.7829, lng: -73.9654, description: 'Manhattan' },
    { name: 'Madison Square Garden', lat: 40.7505, lng: -73.9934, description: 'Chelsea' },
    { name: 'Statue of Liberty', lat: 40.6892, lng: -74.0445, description: 'Liberty Island' },
    { name: 'Empire State Building', lat: 40.7484, lng: -73.9857, description: 'Midtown Manhattan' },
    { name: 'Brooklyn Bridge', lat: 40.7061, lng: -73.9969, description: 'Brooklyn' },
    { name: 'Yankee Stadium', lat: 40.8296, lng: -73.9262, description: 'Bronx' },
  ],
  'Chicago': [
    { name: 'O\'Hare Airport', lat: 41.9742, lng: -87.9073, description: 'O\'Hare International Airport' },
    { name: 'Millennium Park', lat: 41.8826, lng: -87.6226, description: 'The Loop' },
    { name: 'Navy Pier', lat: 41.8917, lng: -87.6086, description: 'Streeterville' },
    { name: 'Willis Tower', lat: 41.8789, lng: -87.6359, description: 'The Loop' },
    { name: 'Wrigley Field', lat: 41.9484, lng: -87.6553, description: 'Wrigleyville' },
    { name: 'Art Institute of Chicago', lat: 41.8796, lng: -87.6237, description: 'The Loop' },
    { name: 'Magnificent Mile', lat: 41.8950, lng: -87.6245, description: 'Near North Side' },
    { name: 'United Center', lat: 41.8807, lng: -87.6742, description: 'Near West Side' },
  ],
  'Miami': [
    { name: 'Miami Airport', lat: 25.7959, lng: -80.2870, description: 'Miami International Airport' },
    { name: 'South Beach', lat: 25.7826, lng: -80.1341, description: 'Miami Beach' },
    { name: 'Wynwood Walls', lat: 25.8010, lng: -80.1993, description: 'Wynwood' },
    { name: 'Bayside Marketplace', lat: 25.7782, lng: -80.1867, description: 'Downtown Miami' },
    { name: 'Little Havana', lat: 25.7654, lng: -80.2190, description: 'Miami' },
    { name: 'Vizcaya Museum', lat: 25.7444, lng: -80.2103, description: 'Coconut Grove' },
    { name: 'Ocean Drive', lat: 25.7819, lng: -80.1300, description: 'South Beach' },
    { name: 'Hard Rock Stadium', lat: 25.9580, lng: -80.2389, description: 'Miami Gardens' },
  ],
  'default': [
    { name: 'LAX Airport', lat: 33.9425, lng: -118.4081, description: 'Los Angeles International Airport' },
    { name: 'Crypto.com Arena', lat: 34.0430, lng: -118.2673, description: 'Downtown Los Angeles' },
    { name: 'Hollywood Sign', lat: 34.1341, lng: -118.3215, description: 'Hollywood Hills' },
    { name: 'Santa Monica Pier', lat: 34.0100, lng: -118.4961, description: 'Santa Monica' },
    { name: 'Venice Beach', lat: 33.9850, lng: -118.4695, description: 'Venice' },
    { name: 'Dodger Stadium', lat: 34.0739, lng: -118.2400, description: 'Elysian Park' },
    { name: 'USC Campus', lat: 34.0224, lng: -118.2851, description: 'University Park' },
    { name: 'The Grove', lat: 34.0720, lng: -118.3576, description: 'Fairfax District' },
  ],
};

const LocationSearchInput = ({
  value,
  onChange,
  onSelectLocation,
  onClear,
  placeholder = "Where are you going?",
  className = "",
  inputClassName = "",
  isUsingCurrentLocation = false,
  showPopularPOIs = false,
}: LocationSearchInputProps) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [mapboxToken, setMapboxToken] = useState('');
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [detectedRegion, setDetectedRegion] = useState<string>('default');
  const searchTimeoutRef = useRef<NodeJS.Timeout>();
  const sessionTokenRef = useRef<string>(crypto.randomUUID());
  const inputRef = useRef<HTMLInputElement>(null);
  const regionDetectedRef = useRef(false);

  // Get POIs for the detected region
  const popularPOIs = POIS_BY_REGION[detectedRegion] || POIS_BY_REGION['default'];

  // Detect user's region from cached or current location
  const detectUserRegion = async (lat: number, lng: number, token: string) => {
    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&types=place,region`
      );
      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        // Look for city name in the results
        for (const feature of data.features) {
          const placeName = feature.text || feature.place_name || '';
          
          // Check if it matches any of our supported regions
          for (const region of Object.keys(POIS_BY_REGION)) {
            if (region !== 'default' && placeName.toLowerCase().includes(region.toLowerCase())) {
              setDetectedRegion(region);
              return;
            }
          }
          
          // Also check context for city names
          if (feature.context) {
            for (const ctx of feature.context) {
              const ctxText = ctx.text || '';
              for (const region of Object.keys(POIS_BY_REGION)) {
                if (region !== 'default' && ctxText.toLowerCase().includes(region.toLowerCase())) {
                  setDetectedRegion(region);
                  return;
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error detecting region:', error);
    }
  };

  // Fetch Mapbox token and detect region on mount
  useEffect(() => {
    const init = async () => {
      try {
        const { data } = await supabase.functions.invoke('get-mapbox-token');
        if (data?.token) {
          setMapboxToken(data.token);
          
          // Try to detect region from cached location
          if (showPopularPOIs && !regionDetectedRef.current) {
            regionDetectedRef.current = true;
            
            const cachedLocation = localStorage.getItem('parkzy:lastLocation');
            if (cachedLocation) {
              try {
                const { lat, lng } = JSON.parse(cachedLocation);
                if (lat && lng) {
                  detectUserRegion(lat, lng, data.token);
                }
              } catch (e) {
                // Ignore parse errors
              }
            } else if (navigator.geolocation) {
              // Try to get current location for region detection
              navigator.geolocation.getCurrentPosition(
                (position) => {
                  detectUserRegion(position.coords.latitude, position.coords.longitude, data.token);
                },
                () => {
                  // Use default region if geolocation fails
                },
                { enableHighAccuracy: false, maximumAge: 300000, timeout: 5000 }
              );
            }
          }
        }
      } catch (error) {
        console.error('Error fetching Mapbox token:', error);
      }
    };
    init();
  }, [showPopularPOIs]);

  // Search for locations using Mapbox Search Box API
  const searchByQuery = async (query: string) => {
    if (!query.trim() || !mapboxToken) {
      setSuggestions([]);
      return;
    }
    
    setIsLoadingLocation(true);
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
      } else {
        setSuggestions([]);
      }
    } catch (error) {
      console.error('Search error:', error);
      setSuggestions([]);
    } finally {
      setIsLoadingLocation(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      searchByQuery(newValue);
    }, 300);
  };

  const handleSelectSuggestion = async (suggestion: any) => {
    if (!mapboxToken || !suggestion.mapbox_id) return;

    try {
      const retrieveUrl = `https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(suggestion.mapbox_id)}?access_token=${mapboxToken}&session_token=${sessionTokenRef.current}`;
      const response = await fetch(retrieveUrl);
      const data = await response.json();

      if (data?.features?.[0]?.geometry?.coordinates) {
        const [lng, lat] = data.features[0].geometry.coordinates;
        const placeName = suggestion.name || suggestion.place_formatted || suggestion.full_address;
        
        onSelectLocation({ lat, lng, name: placeName });
        setShowDropdown(false);
        setSuggestions([]);
        sessionTokenRef.current = crypto.randomUUID();
      }
    } catch (error) {
      console.error('Retrieve error:', error);
    }
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation || !mapboxToken) return;

    setIsDetectingLocation(true);
    setShowDropdown(false);

    const logGeoError = (label: string, error: GeolocationPositionError) => {
      console.log(label, { code: error.code, message: error.message });
    };

    const onSuccess = async (position: GeolocationPosition) => {
      const coords = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };

      try {
        const response = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${coords.lng},${coords.lat}.json?access_token=${mapboxToken}&types=address,neighborhood,place`
        );
        const data = await response.json();
        localStorage.setItem('parkzy:lastLocation', JSON.stringify({ ...coords, ts: Date.now() }));
        onSelectLocation({ ...coords, name: 'Current Location' });
      } catch (error) {
        console.error('Error reverse geocoding:', error);
        localStorage.setItem('parkzy:lastLocation', JSON.stringify({ ...coords, ts: Date.now() }));
        onSelectLocation({ ...coords, name: 'Current Location' });
      } finally {
        setIsDetectingLocation(false);
      }
    };

    const onError = (error: GeolocationPositionError) => {
      logGeoError('LocationSearchInput current location failed', error);

      // If GPS times out/unavailable, retry once without high accuracy
      if (error.code === 2 || error.code === 3) {
        navigator.geolocation.getCurrentPosition(
          onSuccess,
          (error2) => {
            logGeoError('LocationSearchInput current location fallback failed', error2);
            setIsDetectingLocation(false);
          },
          {
            enableHighAccuracy: false,
            maximumAge: 60000,
            timeout: 15000,
          }
        );
        return;
      }

      setIsDetectingLocation(false);
    };

    navigator.geolocation.getCurrentPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20000,
    });
  };

  const handleClear = () => {
    onChange('');
    setSuggestions([]);
    onClear?.();
    inputRef.current?.focus();
  };

  const handleFocus = () => {
    setShowDropdown(true);
  };

  const handleBlur = () => {
    setTimeout(() => setShowDropdown(false), 200);
  };

  const displayValue = isUsingCurrentLocation && !value ? 'Current Location' : value;
  const showClearButton = value.length > 0 || isUsingCurrentLocation;

  return (
    <div className={`relative ${className}`}>
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none z-10" />
      <Input
        ref={inputRef}
        value={displayValue}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && suggestions.length > 0) {
            handleSelectSuggestion(suggestions[0]);
          } else if (e.key === 'Escape') {
            setShowDropdown(false);
          }
        }}
        placeholder={isDetectingLocation ? "Detecting location..." : placeholder}
        className={`pl-12 pr-12 ${inputClassName}`}
      />
      
      {/* Right side button: Clear or Loading */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2">
        {isDetectingLocation ? (
          <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
        ) : showClearButton ? (
          <button
            onClick={handleClear}
            className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded-full hover:bg-muted"
            title="Clear"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-background border border-border rounded-xl shadow-lg max-h-72 overflow-y-auto">
          {/* Use Current Location Option - Always shown first */}
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              handleUseCurrentLocation();
            }}
            className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border/50 focus:outline-none focus:bg-muted/50"
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Navigation className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-primary">Use current location</p>
                <p className="text-xs text-muted-foreground">Find parking near you</p>
              </div>
            </div>
          </button>

          {/* Loading shimmer placeholders */}
          {isLoadingLocation && (
            <div className="animate-fade-in">
              {[1, 2, 3].map((i) => (
                <div key={i} className="px-4 py-3 border-b border-border/50 last:border-b-0">
                  <div className="flex items-start gap-3">
                    <Skeleton className="h-4 w-4 mt-0.5 rounded-full flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Search Suggestions */}
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.mapbox_id || index}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelectSuggestion(suggestion);
              }}
              className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border/50 last:border-b-0 focus:outline-none focus:bg-muted/50"
            >
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{suggestion.name}</p>
                  {suggestion.place_formatted && (
                    <p className="text-xs text-muted-foreground truncate">
                      {suggestion.place_formatted}
                    </p>
                  )}
                </div>
              </div>
            </button>
          ))}

          {/* Popular POIs - shown when no search query and showPopularPOIs is enabled */}
          {showPopularPOIs && !isLoadingLocation && suggestions.length === 0 && value.length === 0 && (
            <>
              <div className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide bg-muted/30">
                Popular in {detectedRegion === 'default' ? 'Los Angeles' : detectedRegion}
              </div>
              {popularPOIs.map((poi) => (
                <button
                  key={poi.name}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelectLocation({ lat: poi.lat, lng: poi.lng, name: poi.name });
                    setShowDropdown(false);
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border/50 last:border-b-0 focus:outline-none focus:bg-muted/50"
                >
                  <div className="flex items-start gap-3">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{poi.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{poi.description}</p>
                    </div>
                  </div>
                </button>
              ))}
            </>
          )}

          {/* No results message */}
          {!isLoadingLocation && suggestions.length === 0 && value.length > 2 && (
            <div className="px-4 py-3 text-sm text-muted-foreground text-center">
              No locations found. Try a different search.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LocationSearchInput;
