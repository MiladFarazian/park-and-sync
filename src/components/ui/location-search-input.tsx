import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, X, Navigation, MapPin, Loader2, Clock, Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/lib/logger';
import { getCurrentPosition, GeolocationError } from '@/lib/geolocation';

const log = logger.scope('LocationSearchInput');

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

interface RecentSearch {
  name: string;
  lat: number;
  lng: number;
  timestamp: number;
}

interface FavoriteLocation {
  id?: string; // Database ID for synced favorites
  name: string;
  address: string;
  lat: number;
  lng: number;
}

interface RegionPOIs {
  [region: string]: POI[];
}

const HISTORY_STORAGE_KEY = 'parkzy:searchHistory';
const FAVORITES_STORAGE_KEY = 'parkzy:favoriteLocations';
const MAX_HISTORY_ITEMS = 5;
const MAX_FAVORITES = 10;

// Helper to load search history from localStorage
const loadSearchHistory = (): RecentSearch[] => {
  try {
    const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    // Ignore parse errors
  }
  return [];
};

// Helper to save search history to localStorage
const saveSearchHistory = (history: RecentSearch[]) => {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch (e) {
    // Ignore storage errors
  }
};

// Add a location to search history
const addToSearchHistory = (location: { name: string; lat: number; lng: number }) => {
  // Don't save "Current Location"
  if (location.name === 'Current Location') return;
  
  const history = loadSearchHistory();
  
  // Remove duplicate if exists (by name)
  const filtered = history.filter(item => item.name !== location.name);
  
  // Add new item at the beginning
  const newHistory: RecentSearch[] = [
    { ...location, timestamp: Date.now() },
    ...filtered
  ].slice(0, MAX_HISTORY_ITEMS);
  
  saveSearchHistory(newHistory);
};

// Helper to load favorites from localStorage (for guests)
const loadLocalFavorites = (): FavoriteLocation[] => {
  try {
    const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Ensure address field exists for older data
      return parsed.map((fav: any) => ({
        ...fav,
        address: fav.address || fav.name
      }));
    }
  } catch (e) {
    // Ignore parse errors
  }
  return [];
};

// Helper to save favorites to localStorage (for guests)
const saveLocalFavorites = (favorites: FavoriteLocation[]) => {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
  } catch (e) {
    // Ignore storage errors
  }
};

// Check if a location is favorited
const isFavorite = (name: string, favorites: FavoriteLocation[]): boolean => {
  return favorites.some(fav => fav.name === name);
};

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
  const { user } = useAuth();
  const [showDropdown, setShowDropdown] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [mapboxToken, setMapboxToken] = useState('');
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [detectedRegion, setDetectedRegion] = useState<string>('default');
  const [searchHistory, setSearchHistory] = useState<RecentSearch[]>([]);
  const [favorites, setFavorites] = useState<FavoriteLocation[]>([]);
  const [isSyncingFavorites, setIsSyncingFavorites] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout>();
  const sessionTokenRef = useRef<string>(crypto.randomUUID());
  const inputRef = useRef<HTMLInputElement>(null);
  const regionDetectedRef = useRef(false);
  const blurTimeoutRef = useRef<NodeJS.Timeout>();
  const ignoreBlurRef = useRef(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load favorites from database for logged-in users, localStorage for guests
  const loadFavorites = useCallback(async () => {
    if (user) {
      try {
        const { data, error } = await supabase
          .from('favorite_locations')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        const dbFavorites: FavoriteLocation[] = (data || []).map(row => ({
          id: row.id,
          name: row.name,
          address: row.address,
          lat: row.latitude,
          lng: row.longitude
        }));
        
        setFavorites(dbFavorites);
        
        // Also sync to localStorage as backup
        saveLocalFavorites(dbFavorites);
      } catch (error) {
        log.error('Error loading favorites from database:', error);
        // Fall back to localStorage
        setFavorites(loadLocalFavorites());
      }
    } else {
      setFavorites(loadLocalFavorites());
    }
  }, [user]);

  // Add favorite to database or localStorage
  const addFavorite = useCallback(async (location: { name: string; lat: number; lng: number }) => {
    const newFavorite: FavoriteLocation = {
      name: location.name,
      address: location.name,
      lat: location.lat,
      lng: location.lng
    };

    if (user) {
      setIsSyncingFavorites(true);
      try {
        const { data, error } = await supabase
          .from('favorite_locations')
          .insert({
            user_id: user.id,
            name: location.name,
            address: location.name,
            latitude: location.lat,
            longitude: location.lng
          })
          .select()
          .single();
        
        if (error) {
          // Check if it's a duplicate error
          if (error.code === '23505') {
            // Location already favorited, just reload
            await loadFavorites();
            return;
          }
          throw error;
        }
        
        const addedFavorite: FavoriteLocation = {
          id: data.id,
          name: data.name,
          address: data.address,
          lat: data.latitude,
          lng: data.longitude
        };
        
        setFavorites(prev => [addedFavorite, ...prev].slice(0, MAX_FAVORITES));
      } catch (error) {
        log.error('Error adding favorite to database:', error);
        // Fall back to localStorage
        const updated = [newFavorite, ...favorites].slice(0, MAX_FAVORITES);
        saveLocalFavorites(updated);
        setFavorites(updated);
      } finally {
        setIsSyncingFavorites(false);
      }
    } else {
      const updated = [newFavorite, ...favorites].slice(0, MAX_FAVORITES);
      saveLocalFavorites(updated);
      setFavorites(updated);
    }
  }, [user, favorites, loadFavorites]);

  // Remove favorite from database or localStorage
  const removeFavorite = useCallback(async (name: string) => {
    const favoriteToRemove = favorites.find(f => f.name === name);
    
    if (user && favoriteToRemove?.id) {
      setIsSyncingFavorites(true);
      try {
        const { error } = await supabase
          .from('favorite_locations')
          .delete()
          .eq('id', favoriteToRemove.id);
        
        if (error) throw error;
        
        setFavorites(prev => prev.filter(f => f.name !== name));
      } catch (error) {
        log.error('Error removing favorite from database:', error);
      } finally {
        setIsSyncingFavorites(false);
      }
    } else {
      const updated = favorites.filter(f => f.name !== name);
      saveLocalFavorites(updated);
      setFavorites(updated);
    }
  }, [user, favorites]);

  // Toggle favorite status
  const toggleFavoriteLocation = useCallback(async (location: { name: string; lat: number; lng: number }) => {
    const exists = isFavorite(location.name, favorites);
    
    if (exists) {
      await removeFavorite(location.name);
    } else {
      await addFavorite(location);
    }
  }, [favorites, addFavorite, removeFavorite]);

  // Load search history and favorites on mount and when user changes
  useEffect(() => {
    setSearchHistory(loadSearchHistory());
    loadFavorites();
  }, [loadFavorites]);

  // Migrate localStorage favorites to database when user logs in
  useEffect(() => {
    const migrateLocalFavorites = async () => {
      if (!user) return;
      
      const localFavorites = loadLocalFavorites();
      if (localFavorites.length === 0) return;
      
      // Check if user already has favorites in database
      const { data: existingFavorites } = await supabase
        .from('favorite_locations')
        .select('name')
        .eq('user_id', user.id);
      
      if (existingFavorites && existingFavorites.length > 0) {
        // User already has favorites, don't overwrite
        return;
      }
      
      // Migrate local favorites to database
      const toInsert = localFavorites.slice(0, MAX_FAVORITES).map(fav => ({
        user_id: user.id,
        name: fav.name,
        address: fav.address || fav.name,
        latitude: fav.lat,
        longitude: fav.lng
      }));
      
      const { error } = await supabase
        .from('favorite_locations')
        .insert(toInsert);
      
      if (!error) {
        // Clear localStorage after successful migration
        localStorage.removeItem(FAVORITES_STORAGE_KEY);
        // Reload favorites from database
        loadFavorites();
      }
    };
    
    migrateLocalFavorites();
  }, [user, loadFavorites]);

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
      log.error('Error detecting region:', error);
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
            } else {
              // Try to get current location for region detection using native plugin
              getCurrentPosition({ enableHighAccuracy: false, maximumAge: 300000, timeout: 5000 })
                .then((position) => {
                  detectUserRegion(position.coords.latitude, position.coords.longitude, data.token);
                })
                .catch(() => {
                  // Use default region if geolocation fails
                });
            }
          }
        }
      } catch (error) {
        log.error('Error fetching Mapbox token:', error);
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
      log.error('Search error:', error);
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
        
        // Save to history
        addToSearchHistory({ lat, lng, name: placeName });
        setSearchHistory(loadSearchHistory());
        
        onSelectLocation({ lat, lng, name: placeName });
        setShowDropdown(false);
        setSuggestions([]);
        sessionTokenRef.current = crypto.randomUUID();
      }
    } catch (error) {
      log.error('Retrieve error:', error);
    }
  };

  const handleSelectFromHistory = (item: RecentSearch) => {
    // Save to history again to update timestamp (moves to top)
    addToSearchHistory({ lat: item.lat, lng: item.lng, name: item.name });
    setSearchHistory(loadSearchHistory());
    
    onSelectLocation({ lat: item.lat, lng: item.lng, name: item.name });
    setShowDropdown(false);
    setSuggestions([]);
  };

  const handleClearHistory = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    localStorage.removeItem(HISTORY_STORAGE_KEY);
    setSearchHistory([]);
  };

  const handleRemoveHistoryItem = (e: React.SyntheticEvent, name: string) => {
    e.preventDefault();
    e.stopPropagation();
    const filtered = searchHistory.filter(item => item.name !== name);
    saveSearchHistory(filtered);
    setSearchHistory(filtered);
  };

  const handleToggleFavorite = async (e: React.SyntheticEvent, location: { name: string; lat: number; lng: number }) => {
    e.preventDefault();
    e.stopPropagation();
    await toggleFavoriteLocation(location);
  };

  const handleSelectFavorite = (item: FavoriteLocation) => {
    onSelectLocation({ lat: item.lat, lng: item.lng, name: item.name });
    setShowDropdown(false);
    setSuggestions([]);
  };

  const handleRemoveFavorite = async (e: React.SyntheticEvent, name: string) => {
    e.preventDefault();
    e.stopPropagation();
    await removeFavorite(name);
  };

  const handleUseCurrentLocation = async () => {
    if (!mapboxToken) return;

    setIsDetectingLocation(true);
    setShowDropdown(false);

    const logGeoError = (label: string, error: GeolocationError) => {
      log.debug(label, { code: error.code, message: error.message });
    };

    const processLocation = async (lat: number, lng: number) => {
      const coords = { lat, lng };
      try {
        await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${coords.lng},${coords.lat}.json?access_token=${mapboxToken}&types=address,neighborhood,place`
        );
        localStorage.setItem('parkzy:lastLocation', JSON.stringify({ ...coords, ts: Date.now() }));
        onSelectLocation({ ...coords, name: 'Current Location' });
      } catch (error) {
        log.error('Error reverse geocoding:', error);
        localStorage.setItem('parkzy:lastLocation', JSON.stringify({ ...coords, ts: Date.now() }));
        onSelectLocation({ ...coords, name: 'Current Location' });
      } finally {
        setIsDetectingLocation(false);
      }
    };

    try {
      // Use native geolocation - much faster on iOS
      const position = await getCurrentPosition({
        enableHighAccuracy: true,
        maximumAge: 30000, // Allow 30s cached location for faster response
        timeout: 10000,    // Native is faster
      });
      await processLocation(position.coords.latitude, position.coords.longitude);
    } catch (error) {
      const geoError = error as GeolocationError;
      logGeoError('LocationSearchInput current location failed', geoError);

      // If GPS times out/unavailable, retry once without high accuracy
      if (geoError.code === 2 || geoError.code === 3) {
        try {
          const fallbackPosition = await getCurrentPosition({
            enableHighAccuracy: false,
            maximumAge: 60000,
            timeout: 15000,
          });
          await processLocation(fallbackPosition.coords.latitude, fallbackPosition.coords.longitude);
        } catch (fallbackError) {
          logGeoError('LocationSearchInput current location fallback failed', fallbackError as GeolocationError);
          setIsDetectingLocation(false);
        }
        return;
      }

      setIsDetectingLocation(false);
    }
  };

  const handleClear = () => {
    // Cancel any pending blur timeout
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = undefined;
    }
    
    onChange('');
    setSuggestions([]);
    // Reset session token to ensure fresh searches work
    sessionTokenRef.current = crypto.randomUUID();
    onClear?.();
    // Show dropdown immediately after clearing
    setShowDropdown(true);
    
    // Use requestAnimationFrame to ensure focus happens after React updates
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

  const handleClearMouseDown = (e: React.MouseEvent) => {
    // Prevent the input from losing focus when clicking clear button
    e.preventDefault();
    // Mark that we should ignore the next blur event
    ignoreBlurRef.current = true;
  };

  const handleFocus = () => {
    // Cancel any pending blur timeout when focusing
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = undefined;
    }
    
    setShowDropdown(true);
    // Trigger search if there's already a value (e.g., user clicked back into input)
    if (value.trim() && suggestions.length === 0) {
      searchByQuery(value);
    }
  };

  // Track touch start position to differentiate tap from scroll
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    ignoreBlurRef.current = true;
  };

  // Check if touch ended without significant movement (tap vs scroll)
  const isTap = (e: React.TouchEvent): boolean => {
    if (!touchStartRef.current) return false;
    const touch = e.changedTouches[0];
    const dx = Math.abs(touch.clientX - touchStartRef.current.x);
    const dy = Math.abs(touch.clientY - touchStartRef.current.y);
    touchStartRef.current = null;
    // If moved less than 10px in any direction, it's a tap
    return dx < 10 && dy < 10;
  };

  // Create a handler that works for both mouse and touch
  const createItemHandler = (action: () => void) => ({
    onMouseDown: (e: React.MouseEvent) => {
      e.preventDefault();
      ignoreBlurRef.current = true;
    },
    onClick: (e: React.MouseEvent) => {
      // Only fire for mouse clicks (not touch - touch uses onTouchEnd)
      if (e.detail > 0) {
        action();
      }
    },
    onTouchStart: handleTouchStart,
    onTouchEnd: (e: React.TouchEvent) => {
      if (isTap(e)) {
        e.preventDefault();
        action();
      }
      // Reset blur flag after a delay
      window.setTimeout(() => {
        ignoreBlurRef.current = false;
      }, 100);
    },
  });

  const handleBlur = () => {
    // If we're interacting with a dropdown item, ignore this blur
    if (ignoreBlurRef.current) {
      ignoreBlurRef.current = false;
      return;
    }
    
    // Clear any existing timeout before setting a new one
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
    }
    
    // Use a longer timeout to handle mobile touch events properly
    blurTimeoutRef.current = setTimeout(() => {
      setShowDropdown(false);
      blurTimeoutRef.current = undefined;
    }, 250);
  };

  // Only show "Current Location" text if there's actual content in value field, not auto-pre-fill
  const displayValue = value;
  const showClearButton = value.length > 0;

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
        className={`pl-12 ${showClearButton || isDetectingLocation ? 'pr-10' : 'pr-4'} ${inputClassName}`}
      />
      
      {/* Right side button: Clear or Loading */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2">
        {isDetectingLocation ? (
          <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
        ) : showClearButton ? (
          <button
            onMouseDown={handleClearMouseDown}
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
        <div ref={dropdownRef} className="absolute top-full left-0 right-0 z-50 mt-1 bg-background border border-border rounded-xl shadow-lg max-h-72 overflow-y-auto">
          {/* Use Current Location Option - Always shown first */}
          <button
            type="button"
            {...createItemHandler(handleUseCurrentLocation)}
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
              type="button"
              key={suggestion.mapbox_id || index}
              {...createItemHandler(() => handleSelectSuggestion(suggestion))}
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

          {/* Favorites - shown when no search query and favorites exist */}
          {!isLoadingLocation && suggestions.length === 0 && value.length === 0 && favorites.length > 0 && (
            <>
              <div className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide bg-muted/30">
                Saved locations
              </div>
              {favorites.map((item) => (
                <button
                  type="button"
                  key={item.name}
                  {...createItemHandler(() => handleSelectFavorite(item))}
                  className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border/50 last:border-b-0 focus:outline-none focus:bg-muted/50 group"
                >
                  <div className="flex items-center gap-3">
                    <Star className="h-4 w-4 text-yellow-500 fill-yellow-500 flex-shrink-0" />
                    <p className="text-sm font-medium truncate flex-1">{item.name}</p>
                    <button
                      type="button"
                      {...createItemHandler(() => void handleRemoveFavorite({} as any, item.name))}
                      onClick={(e) => e.stopPropagation()}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity p-1 -m-1"
                      title="Remove from favorites"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </button>
              ))}
            </>
          )}

          {/* Recent Searches - shown when no search query and history exists */}
          {!isLoadingLocation && suggestions.length === 0 && value.length === 0 && searchHistory.length > 0 && (
            <>
              <div className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide bg-muted/30 flex items-center justify-between">
                <span>Recent searches</span>
                <button
                  type="button"
                  {...createItemHandler(() => void handleClearHistory({} as any))}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear all
                </button>
              </div>
              {searchHistory.map((item) => (
                <button
                  type="button"
                  key={item.name}
                  {...createItemHandler(() => handleSelectFromHistory(item))}
                  className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border/50 last:border-b-0 focus:outline-none focus:bg-muted/50 group"
                >
                  <div className="flex items-center gap-3">
                    <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <p className="text-sm font-medium truncate flex-1">{item.name}</p>
                    <button
                      type="button"
                      {...createItemHandler(() => void handleToggleFavorite({} as any, item))}
                      onClick={(e) => e.stopPropagation()}
                      className={`p-1 -m-1 transition-opacity ${isFavorite(item.name, favorites) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                      title={isFavorite(item.name, favorites) ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      <Star className={`h-3.5 w-3.5 ${isFavorite(item.name, favorites) ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground hover:text-yellow-500'}`} />
                    </button>
                    <button
                      type="button"
                      {...createItemHandler(() => handleRemoveHistoryItem({} as any, item.name))}
                      onClick={(e) => e.stopPropagation()}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity p-1 -m-1"
                      title="Remove"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </button>
              ))}
            </>
          )}

          {/* Popular POIs - shown when no search query, no history, and showPopularPOIs is enabled */}
          {showPopularPOIs && !isLoadingLocation && suggestions.length === 0 && value.length === 0 && searchHistory.length === 0 && (
            <>
              <div className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide bg-muted/30">
                Popular in {detectedRegion === 'default' ? 'Los Angeles' : detectedRegion}
              </div>
              {popularPOIs.map((poi) => (
                <button
                  type="button"
                  key={poi.name}
                  {...createItemHandler(() => {
                    // Save POI selection to history too
                    addToSearchHistory({ lat: poi.lat, lng: poi.lng, name: poi.name });
                    setSearchHistory(loadSearchHistory());
                    onSelectLocation({ lat: poi.lat, lng: poi.lng, name: poi.name });
                    setShowDropdown(false);
                  })}
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
