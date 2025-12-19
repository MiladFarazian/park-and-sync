import React, { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
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
}

const LocationSearchInput = ({
  value,
  onChange,
  onSelectLocation,
  onClear,
  placeholder = "Where are you going?",
  className = "",
  inputClassName = "",
  isUsingCurrentLocation = false,
}: LocationSearchInputProps) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [mapboxToken, setMapboxToken] = useState('');
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout>();
  const sessionTokenRef = useRef<string>(crypto.randomUUID());
  const inputRef = useRef<HTMLInputElement>(null);

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

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        try {
          const response = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${coords.lng},${coords.lat}.json?access_token=${mapboxToken}&types=address,neighborhood,place`
          );
          const data = await response.json();
          const address = data.features?.[0]?.place_name || 'Current location';

          localStorage.setItem('parkzy:lastLocation', JSON.stringify({ ...coords, ts: Date.now() }));
          onSelectLocation({ ...coords, name: address });
        } catch (error) {
          console.error('Error reverse geocoding:', error);
          localStorage.setItem('parkzy:lastLocation', JSON.stringify({ ...coords, ts: Date.now() }));
          onSelectLocation({ ...coords, name: 'Current location' });
        } finally {
          setIsDetectingLocation(false);
        }
      },
      (error) => {
        console.error('Error getting location:', error);
        setIsDetectingLocation(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 60000,
        timeout: 15000,
      }
    );
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

  const displayValue = isUsingCurrentLocation && !value ? 'Current location' : value;
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

          {/* Loading indicator */}
          {isLoadingLocation && (
            <div className="px-4 py-3 flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Searching...</span>
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
