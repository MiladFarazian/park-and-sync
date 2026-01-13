import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Loader2, Search, X, MapPin, Calendar, Clock, ArrowRight, Navigation, BatteryCharging, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import MapView from '@/components/map/MapView';
import DesktopSpotList, { SpotFilters } from '@/components/explore/DesktopSpotList';
import MobileFilterSheet from '@/components/explore/MobileFilterSheet';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { format, isToday } from 'date-fns';
import { MobileTimePicker } from '@/components/booking/MobileTimePicker';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from 'sonner';
import { evChargerTypes, getChargerDisplayName } from '@/lib/evChargerTypes';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// Session cache utilities for instant back/forward navigation and regional caching
const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

// Grid-based cache key - divides the map into ~1km tiles for efficient regional caching
// At this scale, nearby areas share cache keys, reducing redundant API calls
const getRegionalCacheKey = (lat: number, lng: number, radius: number, timeKey = ''): string => {
  // Use different grid sizes based on zoom level (radius)
  // Smaller radius = more zoomed in = finer grid
  const gridSize = radius < 5000 ? 0.01 : radius < 15000 ? 0.02 : 0.05; // ~1km, ~2km, ~5km tiles
  const gridLat = Math.floor(lat / gridSize) * gridSize;
  const gridLng = Math.floor(lng / gridSize) * gridSize;
  const radiusBucket = radius < 5000 ? 'sm' : radius < 15000 ? 'md' : 'lg';
  const timeSuffix = timeKey ? `-${timeKey}` : '';
  return `explore-region-${gridLat.toFixed(3)}-${gridLng.toFixed(3)}-${radiusBucket}${timeSuffix}`;
};

// Bucket time ranges so cache stays useful but doesn't serve stale availability
const getTimeBucketKey = (start?: Date | null, end?: Date | null): string => {
  if (!start || !end) return '';

  const to15MinBucket = (d: Date) => {
    const dt = new Date(d);
    const minutes = dt.getUTCMinutes();
    const bucketMinutes = Math.floor(minutes / 15) * 15;
    dt.setUTCMinutes(bucketMinutes, 0, 0);
    // YYYY-MM-DDTHH:MM (UTC)
    return dt.toISOString().slice(0, 16);
  };

  return `t-${to15MinBucket(start)}-${to15MinBucket(end)}`;
};

// Get all cache keys that might contain spots for a given region
const getNearbyCacheKeys = (lat: number, lng: number, radius: number, timeKey = ''): string[] => {
  const gridSize = radius < 5000 ? 0.01 : radius < 15000 ? 0.02 : 0.05;
  const keys: string[] = [];

  // Check current tile and adjacent tiles (3x3 grid)
  for (let latOffset = -1; latOffset <= 1; latOffset++) {
    for (let lngOffset = -1; lngOffset <= 1; lngOffset++) {
      const checkLat = lat + latOffset * gridSize;
      const checkLng = lng + lngOffset * gridSize;
      keys.push(getRegionalCacheKey(checkLat, checkLng, radius, timeKey));
    }
  }
  return keys;
};

interface CachedRegion {
  data: any[];
  timestamp: number;
  center: { lat: number; lng: number };
  radius: number;
}

const getCachedSpots = (key: string): CachedRegion | null => {
  try {
    const cached = sessionStorage.getItem(key);
    if (!cached) return null;
    const parsed: CachedRegion = JSON.parse(cached);
    if (Date.now() - parsed.timestamp > CACHE_EXPIRY_MS) {
      sessionStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const setCachedSpots = (key: string, spots: any[], center: { lat: number; lng: number }, radius: number): void => {
  try {
    const cacheData: CachedRegion = {
      data: spots,
      timestamp: Date.now(),
      center,
      radius
    };
    sessionStorage.setItem(key, JSON.stringify(cacheData));
  } catch {
    // Ignore storage errors (quota exceeded, etc.)
  }
};

// Check if a cached region covers the requested area
const findCoveringCache = (lat: number, lng: number, radius: number, timeKey = ''): any[] | null => {
  const keys = getNearbyCacheKeys(lat, lng, radius, timeKey);

  for (const key of keys) {
    const cached = getCachedSpots(key);
    if (!cached) continue;

    // Check if the cached region's center is close enough and radius is large enough
    const latDiff = Math.abs(cached.center.lat - lat) * 111000;
    const lngDiff = Math.abs(cached.center.lng - lng) * 111000 * Math.cos(lat * Math.PI / 180);
    const distance = Math.sqrt(latDiff ** 2 + lngDiff ** 2);

    // If we're within 30% of the cached radius from its center, the cache likely covers our area
    if (distance < cached.radius * 0.3 && cached.radius >= radius * 0.7) {
      console.log('[Cache] Hit! Using cached data from', key);
      return cached.data;
    }
  }

  return null;
};

const Explore = () => {
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [parkingSpots, setParkingSpots] = useState<any[]>([]);
  const [spotsLoading, setSpotsLoading] = useState(true);

  // Physical device location (blue dot)
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Desired search location / map center (red destination pin)
  // Initialize from URL params if available, otherwise null until user searches
  const initialLat = searchParams.get('lat');
  const initialLng = searchParams.get('lng');
  const [searchLocation, setSearchLocation] = useState<{ lat: number; lng: number } | null>(
    initialLat && initialLng 
      ? { lat: parseFloat(initialLat), lng: parseFloat(initialLng) }
      : null
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mapboxToken, setMapboxToken] = useState('');
  const searchTimeoutRef = useRef<NodeJS.Timeout>();
  const sessionTokenRef = useRef<string>(crypto.randomUUID());
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [endTime, setEndTime] = useState<Date | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [mobileStartPickerOpen, setMobileStartPickerOpen] = useState(false);
  const [mobileEndPickerOpen, setMobileEndPickerOpen] = useState(false);
  
  // Desktop-specific state
  const [sortBy, setSortBy] = useState('distance');
  const [hoveredSpotId, setHoveredSpotId] = useState<string | null>(null);
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);
  const [filters, setFilters] = useState<SpotFilters>({
    covered: false,
    securityCamera: false,
    twentyFourSevenAccess: false,
    evCharging: false,
    evChargerTypes: [],
    easyAccess: false,
    wellLit: false,
    adaAccessible: false,
    instantBook: false,
    vehicleSize: null,
  });
  
  // EV charger filter state (from URL params)
  const [evChargerType, setEvChargerType] = useState<string | null>(null);
  const [evFilterFallbackShown, setEvFilterFallbackShown] = useState(false);
  const evFilterFallbackShownRef = useRef(false);
  const [pendingEvFallbackDialog, setPendingEvFallbackDialog] = useState(false);
  const [showEvFallbackDialog, setShowEvFallbackDialog] = useState(false);
  const [evFallbackChargerName, setEvFallbackChargerName] = useState('');
  
  const latestRequestIdRef = useRef(0);
  
  // Guard to prevent duplicate initial fetches
  const didInitialFetchRef = useRef(false);

  // Ignore the first onMapMove fired by Mapbox on initial idle
  const ignoreFirstMapMoveRef = useRef(true);
  
  // Track last fetched center to avoid redundant requests for small movements
  const lastFetchedCenterRef = useRef<{ lat: number; lng: number; radius: number } | null>(null);
  
  // Adaptive debounce - increases during rapid panning
  const consecutiveMoveCountRef = useRef(0);
  const lastMoveTimeRef = useRef(0);

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

  // Fetch Mapbox token once on mount
  useEffect(() => {
    fetchMapboxToken();
  }, []);

  // Initial load effect - runs once when mapbox token is ready
  useEffect(() => {
    if (!mapboxToken) return;
    if (didInitialFetchRef.current) return;
    didInitialFetchRef.current = true;

    // Check for URL parameters
    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');
    const start = searchParams.get('start');
    const end = searchParams.get('end');
    const query = searchParams.get('q');
    const evParam = searchParams.get('ev');
    const chargerTypeParam = searchParams.get('chargerType');

    // Set EV filter state from URL
    if (evParam === 'true' && chargerTypeParam) {
      setEvChargerType(chargerTypeParam);
      // Also set in the filters for UI sync
      setFilters(prev => ({
        ...prev,
        evCharging: true,
        evChargerTypes: [chargerTypeParam],
      }));
    }

    // Parse times first
    const startDate = start ? new Date(start) : new Date();
    const endDate = end ? new Date(end) : new Date(Date.now() + 24 * 60 * 60 * 1000);
    if (start) setStartTime(startDate);
    if (end) setEndTime(endDate);

    const initialTimeKey = getTimeBucketKey(start ? startDate : null, end ? endDate : null);

    // Only load spots if URL has a lat/lng (searched location)
    if (lat && lng) {
      const desired = {
        lat: parseFloat(lat),
        lng: parseFloat(lng)
      };
      setSearchLocation(desired);

      if (query) {
        setSearchQuery(query);
      } else {
        // Get address label for the desired location
        reverseGeocode(desired.lat, desired.lng).then(address => {
          if (address) setSearchQuery(address);
        });
      }

      // Skip cache when EV filter is applied to get accurate fallback notification
      if (evParam === 'true' && chargerTypeParam) {
        fetchNearbySpots(desired, 15000, true, { start: start ? startDate : null, end: end ? endDate : null }, chargerTypeParam);
      } else {
        // Check cache first for instant render (time-bucketed)
        const cachedSpots = findCoveringCache(desired.lat, desired.lng, 15000, initialTimeKey);
        if (cachedSpots) {
          setParkingSpots(cachedSpots);
          setSpotsLoading(false);
          // Still fetch fresh data in background
          fetchNearbySpots(desired, 15000, false, { start: start ? startDate : null, end: end ? endDate : null });
        } else {
          fetchNearbySpots(desired, 15000, true, { start: start ? startDate : null, end: end ? endDate : null });
        }
      }
    } else {
      // No URL lat/lng: show empty state, user needs to search
      setSpotsLoading(false);
    }
  }, [mapboxToken]);

  // Continuously watch and update the user's physical location (blue dot marker)
  useEffect(() => {
    if (!navigator.geolocation) return;
    
    // Use high accuracy for precise GPS location
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setCurrentLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      },
      (error) => {
        console.error('Error watching location:', error);
      },
      {
        enableHighAccuracy: true, // Use GPS for accurate location
        maximumAge: 10000, // Accept position up to 10 seconds old
        timeout: 15000
      }
    );

    // Cleanup: stop watching when component unmounts
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);
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
  const searchByQuery = async (query: string) => {
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
      searchByQuery(value);
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
        
        const desired = { lat, lng };
        setSearchLocation(desired);
        setSearchQuery(placeName);
        setShowSuggestions(false);
        setSuggestions([]);
        
        // Fetch spots for the new search location
        fetchNearbySpots(desired, 15000, false);
        
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

  const handleGoToCurrentLocation = async () => {
    // If we already have a cached current location, use it immediately
    if (currentLocation) {
      setSearchLocation(currentLocation);
      fetchNearbySpots(currentLocation, 15000, false);

      // Get address in background
      if (mapboxToken) {
        reverseGeocode(currentLocation.lat, currentLocation.lng).then((address) => {
          if (address) setSearchQuery(address);
        });
      }
      return;
    }

    const logGeoError = (label: string, error: GeolocationPositionError) => {
      console.log(label, { code: error.code, message: error.message });
    };

    const onSuccess = async (position: GeolocationPosition) => {
      const deviceLoc = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };

      setCurrentLocation(deviceLoc);
      setSearchLocation(deviceLoc);

      if (mapboxToken) {
        const address = await reverseGeocode(deviceLoc.lat, deviceLoc.lng);
        if (address) setSearchQuery(address);
      }

      fetchNearbySpots(deviceLoc, 15000, false);
      setIsLoadingLocation(false);
    };

    const onError = (error: GeolocationPositionError) => {
      logGeoError('Explore current location failed', error);

      // If GPS times out/unavailable, retry once without high accuracy
      if (error.code === 2 || error.code === 3) {
        navigator.geolocation.getCurrentPosition(
          onSuccess,
          (error2) => {
            logGeoError('Explore current location fallback failed', error2);
            setIsLoadingLocation(false);
          },
          {
            enableHighAccuracy: false,
            maximumAge: 60000,
            timeout: 15000,
          }
        );
        return;
      }

      setIsLoadingLocation(false);
    };

    setIsLoadingLocation(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(onSuccess, onError, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20000,
      });
    }
  };
  const clearSearch = () => {
    setSearchQuery('');
    setSuggestions([]);
    setShowSuggestions(false);
  };
  const fetchNearbySpots = useCallback(async (
    center: { lat: number; lng: number },
    radius = 15000,
    isInitialLoad = true,
    timeOverride?: { start: Date | null; end: Date | null },
    evChargerTypeFilter?: string | null
  ) => {
    if (!center) return;

    const effectiveStartTime = timeOverride?.start ?? startTime;
    const effectiveEndTime = timeOverride?.end ?? endTime;
    const timeKey = getTimeBucketKey(effectiveStartTime, effectiveEndTime);

    // Skip cache when EV filter is applied to get accurate fallback notification
    if (!evChargerTypeFilter) {
      // Check regional cache first - skip API call if we have fresh data
      const cachedData = findCoveringCache(center.lat, center.lng, radius, timeKey);
      if (cachedData && !isInitialLoad) {
        // For map movements, use cache silently without API call
        setParkingSpots(cachedData);
        setSpotsLoading(false);
        return;
      }
    }

    // Increment request ID and capture it for this request
    const requestId = ++latestRequestIdRef.current;

    try {
      // Only show loading spinner on initial load when no cached data
      if (isInitialLoad && parkingSpots.length === 0) {
        setSpotsLoading(true);
      }
      // Note: We do NOT clear parkingSpots here - "stale-while-revalidate" behavior

      // Use search-spots-lite for fast map pin loading
      // Pass time range to filter out already-booked spots
      const { data, error } = await supabase.functions.invoke('search-spots-lite', {
        body: {
          latitude: center.lat,
          longitude: center.lng,
          radius: Math.ceil(radius),
          limit: 500,
          start_time: effectiveStartTime ? effectiveStartTime.toISOString() : undefined,
          end_time: effectiveEndTime ? effectiveEndTime.toISOString() : undefined,
          ev_charger_type: evChargerTypeFilter || undefined,
        }
      });

      // Check if this request is still the latest one
      if (requestId !== latestRequestIdRef.current) {
        console.log('[Explore] Discarding stale response', { requestId, latest: latestRequestIdRef.current });
        return;
      }

      if (error) {
        console.error('Search error:', error);
        // Check for rate limit error (429)
        if (error.message?.includes('429') || error.message?.includes('Too many requests')) {
          toast.error('Too many requests. Please wait a moment and try again.', {
            duration: 5000,
          });
        }
        return;
      }

      // Show fallback dialog if EV filter was applied but no matches found
      if (data.ev_filter_applied && data.ev_match_count === 0) {
        // Persist across React 18 StrictMode remounts so it cannot appear twice
        const evKey = evChargerTypeFilter
          ? `ev-fallback-v1:${center.lat.toFixed(4)}:${center.lng.toFixed(4)}:${timeKey}:${evChargerTypeFilter}`
          : null;

        const alreadyShownForThisSearch = evKey ? sessionStorage.getItem(evKey) === '1' : evFilterFallbackShownRef.current;

        if (!alreadyShownForThisSearch) {
          if (evKey) sessionStorage.setItem(evKey, '1');
          evFilterFallbackShownRef.current = true;
          setEvFilterFallbackShown(true);
          setEvFallbackChargerName(getChargerDisplayName(evChargerTypeFilter));
          setPendingEvFallbackDialog(true);
        }
      }

      const transformedSpots = data.spots?.map((spot: any) => ({
        id: spot.id,
        title: spot.title,
        category: spot.category,
        address: spot.address,
        hourlyRate: spot.hourly_rate, // Already includes platform fee from lite endpoint
        evChargingPremium: spot.ev_charging_premium_per_hour || 0,
        rating: spot.spot_rating || 0,
        reviews: spot.spot_review_count || 0,
        lat: parseFloat(spot.latitude),
        lng: parseFloat(spot.longitude),
        imageUrl: spot.primary_photo_url,
        distance: spot.distance ? `${(spot.distance / 1000).toFixed(1)} km` : undefined,
        amenities: [
          ...(spot.has_ev_charging ? ['EV Charging'] : []), 
          ...(spot.is_covered ? ['Covered'] : []), 
          ...(spot.is_secure ? ['Security Camera'] : []), 
          ...(spot.is_ada_accessible ? ['ADA Accessible'] : []),
          // Note: 24/7 Access, Easy Access, Well Lit are not stored in DB yet
        ],
        hostId: spot.host_id,
        sizeConstraints: spot.size_constraints || [],
        userBooking: null, // Not available in lite endpoint
        instantBook: spot.instant_book !== false,
        evChargerType: spot.ev_charger_type,
        hasEvCharging: spot.has_ev_charging
      })) || [];

      setParkingSpots(transformedSpots);

      // Cache the results for instant back/forward navigation (time-bucketed)
      // Skip caching when EV filter is applied to avoid stale fallback data
      if (!evChargerTypeFilter) {
        const cacheKey = getRegionalCacheKey(center.lat, center.lng, radius, timeKey);
        setCachedSpots(cacheKey, transformedSpots, center, radius);
      }
    } catch (err) {
      console.error('Unexpected error:', err);
    } finally {
      setSpotsLoading(false);
    }
  }, [parkingSpots.length, startTime, endTime]);

  // Re-fetch spots when EV filter is toggled - ensures we get full results when filter is removed
  const prevEvChargingRef = useRef(filters.evCharging);
  const prevEvChargerTypesRef = useRef(filters.evChargerTypes);
  
  useEffect(() => {
    const prevEvCharging = prevEvChargingRef.current;
    const prevEvChargerTypes = prevEvChargerTypesRef.current;
    
    // Update refs
    prevEvChargingRef.current = filters.evCharging;
    prevEvChargerTypesRef.current = filters.evChargerTypes;
    
    // Skip on initial mount or if no search location
    if (!searchLocation) return;
    if (!didInitialFetchRef.current) return;
    
    // Detect if EV filter was toggled off (was on, now off)
    const evWasOn = prevEvCharging || (prevEvChargerTypes && prevEvChargerTypes.length > 0);
    const evIsNowOff = !filters.evCharging && (!filters.evChargerTypes || filters.evChargerTypes.length === 0);
    
    // Detect if EV charger types changed
    const chargerTypesChanged = JSON.stringify(prevEvChargerTypes) !== JSON.stringify(filters.evChargerTypes);
    
    if (evWasOn && evIsNowOff) {
      // EV filter removed - refetch without EV filter to get all spots
      setEvChargerType(null);
      fetchNearbySpots(searchLocation, 15000, false);
    } else if (chargerTypesChanged && filters.evChargerTypes && filters.evChargerTypes.length > 0) {
      // Charger type changed - refetch with new filter
      const newChargerType = filters.evChargerTypes[0]; // Use first selected type for API
      setEvChargerType(newChargerType);
      fetchNearbySpots(searchLocation, 15000, false, undefined, newChargerType);
    }
  }, [filters.evCharging, filters.evChargerTypes, searchLocation, fetchNearbySpots]);

  // Open EV fallback dialog only after the map/list has rendered (prevents a "black" backdrop flash)
  useEffect(() => {
    if (!pendingEvFallbackDialog) return;
    if (spotsLoading) return;

    setShowEvFallbackDialog(true);
    setPendingEvFallbackDialog(false);
  }, [pendingEvFallbackDialog, spotsLoading]);
  
  const handleMapMove = (center: {
    lat: number;
    lng: number;
  }, radiusMeters: number) => {
    // Ignore the first automatic map move fired on initial load
    if (ignoreFirstMapMoveRef.current) {
      ignoreFirstMapMoveRef.current = false;
      return;
    }
    
    // Check if we've moved enough to warrant a new fetch (at least 10% of radius)
    const minMoveThreshold = radiusMeters * 0.1; // 10% of visible radius
    if (lastFetchedCenterRef.current) {
      const { lat: lastLat, lng: lastLng, radius: lastRadius } = lastFetchedCenterRef.current;
      const latDiff = Math.abs(center.lat - lastLat) * 111000; // ~111km per degree lat
      const lngDiff = Math.abs(center.lng - lastLng) * 111000 * Math.cos(center.lat * Math.PI / 180);
      const distance = Math.sqrt(latDiff ** 2 + lngDiff ** 2);
      
      // Skip if movement is too small AND radius hasn't changed significantly
      if (distance < minMoveThreshold && Math.abs(radiusMeters - lastRadius) < lastRadius * 0.3) {
        return;
      }
    }
    
    // Adaptive debounce: increase delay during rapid panning
    const now = Date.now();
    if (now - lastMoveTimeRef.current < 500) {
      consecutiveMoveCountRef.current++;
    } else {
      consecutiveMoveCountRef.current = 0;
    }
    lastMoveTimeRef.current = now;
    
    // Base 300ms, increases up to 800ms during rapid panning
    const debounceDelay = Math.min(300 + consecutiveMoveCountRef.current * 100, 800);

    // Debounce map movement
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }
    fetchTimeoutRef.current = setTimeout(() => {
      // Store the center we're about to fetch
      lastFetchedCenterRef.current = { lat: center.lat, lng: center.lng, radius: radiusMeters };
      consecutiveMoveCountRef.current = 0; // Reset after successful fetch
      fetchNearbySpots(center, radiusMeters, false);
    }, debounceDelay);
  };
  const handleDateTimeUpdate = (newStartTime?: Date, newEndTime?: Date) => {
    if (!searchLocation) return;

    const effectiveStartTime = newStartTime || startTime;
    const effectiveEndTime = newEndTime || endTime;

    // Update URL params
    const params = new URLSearchParams();
    params.set('lat', searchLocation.lat.toString());
    params.set('lng', searchLocation.lng.toString());
    if (effectiveStartTime) params.set('start', effectiveStartTime.toISOString());
    if (effectiveEndTime) params.set('end', effectiveEndTime.toISOString());
    if (searchQuery) params.set('q', searchQuery);
    navigate(`/explore?${params.toString()}`, { replace: true });

    // Refetch spots with the effective time range
    fetchNearbySpots(searchLocation, 15000, false, {
      start: effectiveStartTime ?? null,
      end: effectiveEndTime ?? null,
    });
  };
  const formatDateDisplay = (date: Date) => {
    return isToday(date) ? 'Today' : format(date, 'MMM dd');
  };
  // Filter spots based on selected filters (for both desktop list and mobile carousel)
  const filteredSpots = useMemo(() => {
    return parkingSpots.filter((spot) => {
      if (filters.covered && !spot.amenities?.includes('Covered')) return false;
      if (filters.evCharging && !spot.amenities?.includes('EV Charging')) return false;
      // Filter by specific EV charger types if any are selected
      if (filters.evChargerTypes?.length > 0) {
        if (!spot.evChargerType || !filters.evChargerTypes.includes(spot.evChargerType)) {
          return false;
        }
      }
      if (filters.securityCamera && !spot.amenities?.includes('Security Camera')) return false;
      if (filters.twentyFourSevenAccess && !spot.amenities?.includes('24/7 Access')) return false;
      if (filters.easyAccess && !spot.amenities?.includes('Easy Access')) return false;
      if (filters.wellLit && !spot.amenities?.includes('Well Lit')) return false;
      if (filters.adaAccessible && !spot.amenities?.includes('ADA Accessible')) return false;
      if (filters.instantBook && !spot.instantBook) return false;
      if (filters.vehicleSize && spot.sizeConstraints && !spot.sizeConstraints.includes(filters.vehicleSize)) return false;
      return true;
    });
  }, [parkingSpots, filters]);

  const exploreParams = searchLocation ? {
    lat: searchLocation.lat.toString(),
    lng: searchLocation.lng.toString(),
    start: startTime?.toISOString(),
    end: endTime?.toISOString(),
    q: searchQuery
  } : undefined;

  // Desktop Layout: Split View with List on Left, Map on Right
  if (!isMobile) {
    return (
      <div className="h-full flex">
        {/* Left Panel - Spot List */}
        <div className="w-[420px] flex-shrink-0 h-full">
          <DesktopSpotList
            spots={parkingSpots}
            searchCenter={searchLocation}
            selectedSpotId={selectedSpotId || undefined}
            hoveredSpotId={hoveredSpotId}
            onSpotHover={setHoveredSpotId}
            onSpotClick={setSelectedSpotId}
            sortBy={sortBy}
            onSortChange={setSortBy}
            filters={filters}
            onFiltersChange={setFilters}
            exploreParams={exploreParams}
            isLoading={spotsLoading}
          />
        </div>

        {/* Right Panel - Map */}
        <div className="flex-1 relative">
          {/* Non-blocking loading indicator */}
          {spotsLoading && (
            <div className="absolute top-4 right-4 z-20">
              <div className="bg-background/95 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground">Updating spots…</span>
              </div>
            </div>
          )}
          
          {/* Search Bar */}
          <div className="absolute top-4 left-4 right-20 z-10">
            <div className="max-w-lg">
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
                  {searchQuery && (
                    <button 
                      onClick={clearSearch} 
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <button 
                  onClick={handleSearchSubmit}
                  className="flex-shrink-0 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors shadow-lg"
                >
                  <Search className="h-4 w-4" />
                </button>
                
                {showSuggestions && suggestions.length > 0 && (
                  <Card className="absolute top-full mt-2 w-full bg-background shadow-lg max-h-80 overflow-y-auto z-20">
                    {suggestions.map((suggestion, index) => (
                      <button 
                        type="button"
                        key={index} 
                        onMouseDown={e => {
                          e.preventDefault();
                          handleSelectLocation(suggestion);
                        }} 
                        className="w-full text-left p-3 active:bg-accent transition-colors border-b border-border last:border-0 touch-scroll-safe"
                      >
                        <div className="font-medium text-sm">{suggestion.name}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {suggestion.place_formatted || suggestion.full_address}
                        </div>
                      </button>
                    ))}
                  </Card>
                )}
              </div>
            </div>
          </div>

          {/* Time Display */}
          {(startTime || endTime) && (
            <div className="absolute top-16 left-4 z-10">
              <Card className="p-2.5 bg-background/95 backdrop-blur-sm shadow-lg">
                <div className="flex items-center gap-2 text-sm">
                  {startTime && (
                    <button 
                      type="button"
                      onClick={() => setMobileStartPickerOpen(true)}
                      onMouseDown={e => e.preventDefault()}
                      className="flex items-center gap-1 active:bg-accent/50 rounded px-2 py-1.5 transition-colors touch-scroll-safe"
                    >
                      <Calendar className="h-3 w-3 text-muted-foreground" />
                      <span className="whitespace-nowrap text-xs">{formatDateDisplay(startTime)}</span>
                      <Clock className="h-3 w-3 text-muted-foreground ml-1" />
                      <span className="whitespace-nowrap text-xs">{format(startTime, 'h:mma')}</span>
                    </button>
                  )}
                  
                  {startTime && endTime && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
                  
                  {endTime && (
                    <button 
                      type="button"
                      onClick={() => setMobileEndPickerOpen(true)}
                      onMouseDown={e => e.preventDefault()}
                      className="flex items-center gap-1 active:bg-accent/50 rounded px-2 py-1.5 transition-colors touch-scroll-safe"
                    >
                      <Calendar className="h-3 w-3 text-muted-foreground" />
                      <span className="whitespace-nowrap text-xs">{formatDateDisplay(endTime)}</span>
                      <Clock className="h-3 w-3 text-muted-foreground ml-1" />
                      <span className="whitespace-nowrap text-xs">{format(endTime, 'h:mma')}</span>
                    </button>
                  )}
                </div>
              </Card>
            </div>
          )}

          {/* Current Location Button */}
          <button
            type="button"
            onClick={handleGoToCurrentLocation}
            disabled={isLoadingLocation}
            onMouseDown={e => e.preventDefault()}
            className="absolute bottom-6 right-4 z-10 p-3 bg-background/95 backdrop-blur-sm shadow-lg rounded-full active:bg-accent transition-colors disabled:opacity-50 touch-scroll-safe"
            title="Go to current location"
          >
            {isLoadingLocation ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Navigation className="h-5 w-5" />
            )}
          </button>

          {searchLocation && (
            <MapView 
              spots={filteredSpots} 
              searchCenter={searchLocation} 
              currentLocation={currentLocation || searchLocation}
              onVisibleSpotsChange={() => {}} 
              onMapMove={handleMapMove}
              searchQuery={searchQuery}
              exploreParams={exploreParams}
              highlightedSpotId={hoveredSpotId}
              selectedSpotId={selectedSpotId}
              onSpotHover={setHoveredSpotId}
              onSpotSelect={setSelectedSpotId}
              hideCarousel={true}
            />
          )}
        </div>

        {/* Time Pickers */}
        {mobileStartPickerOpen && startTime && (
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

        {mobileEndPickerOpen && endTime && (
          <MobileTimePicker
            isOpen={mobileEndPickerOpen}
            onClose={() => setMobileEndPickerOpen(false)}
            onConfirm={(date) => {
              handleEndTimeChange(date);
              setMobileEndPickerOpen(false);
            }}
            mode="end"
            startTime={startTime || undefined}
            initialValue={endTime}
          />
        )}
      </div>
    );
  }

  // Mobile Layout: Full-screen map with overlay controls
  return (
    <div className="h-full overflow-hidden relative">
      {/* Non-blocking loading indicator for mobile */}
      {spotsLoading && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20">
          <div className="bg-background/95 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">Loading spots…</span>
          </div>
        </div>
      )}
      
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
              {searchQuery && (
                <button 
                  onClick={clearSearch} 
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <button 
              onClick={handleSearchSubmit}
              className="flex-shrink-0 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors shadow-lg"
            >
              <Search className="h-4 w-4" />
            </button>
            
            {showSuggestions && suggestions.length > 0 && (
              <Card className="absolute top-full mt-2 w-full bg-background shadow-lg max-h-80 overflow-y-auto z-20">
                {suggestions.map((suggestion, index) => (
                  <button 
                    type="button"
                    key={index} 
                    onMouseDown={e => {
                      e.preventDefault();
                      handleSelectLocation(suggestion);
                    }} 
                    className="w-full text-left p-3 active:bg-accent transition-colors border-b border-border last:border-0 touch-scroll-safe"
                  >
                    <div className="font-medium text-sm">{suggestion.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {suggestion.place_formatted || suggestion.full_address}
                    </div>
                  </button>
                ))}
              </Card>
            )}
          </div>
        </div>
        
        {/* Time Selector */}
        {(startTime || endTime) && (
          <div className="max-w-md mx-auto">
            <Card className="p-2.5 bg-background/95 backdrop-blur-sm shadow-lg">
              <div className="flex items-center gap-2 text-sm justify-center">
                {startTime && (
                  <button 
                    type="button"
                    onClick={() => setMobileStartPickerOpen(true)}
                    onMouseDown={e => e.preventDefault()}
                    className="flex items-center gap-1 active:bg-accent/50 rounded px-2 py-1.5 transition-colors flex-shrink-0 touch-scroll-safe"
                  >
                    <Calendar className="h-3 w-3 text-muted-foreground" />
                    <span className="whitespace-nowrap text-xs">{formatDateDisplay(startTime)}</span>
                    <Clock className="h-3 w-3 text-muted-foreground ml-1" />
                    <span className="whitespace-nowrap text-xs">{format(startTime, 'h:mma')}</span>
                  </button>
                )}
                
                {startTime && endTime && <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                
                {endTime && (
                  <button 
                    type="button"
                    onClick={() => setMobileEndPickerOpen(true)}
                    onMouseDown={e => e.preventDefault()}
                    className="flex items-center gap-1 active:bg-accent/50 rounded px-2 py-1.5 transition-colors flex-shrink-0 touch-scroll-safe"
                  >
                    <Calendar className="h-3 w-3 text-muted-foreground" />
                    <span className="whitespace-nowrap text-xs">{formatDateDisplay(endTime)}</span>
                    <Clock className="h-3 w-3 text-muted-foreground ml-1" />
                    <span className="whitespace-nowrap text-xs">{format(endTime, 'h:mma')}</span>
                  </button>
                )}
              </div>
            </Card>
          </div>
        )}
        
        {/* Filter Button - Below time selector */}
        <div className="flex justify-end px-4">
          <MobileFilterSheet
            filters={filters}
            onFiltersChange={setFilters}
            totalSpots={parkingSpots.length}
            filteredCount={filteredSpots.length}
          />
        </div>
      </div>

      {/* Current Location Button */}
      <button
        type="button"
        onClick={handleGoToCurrentLocation}
        disabled={isLoadingLocation}
        onMouseDown={e => e.preventDefault()}
        className="absolute bottom-28 right-4 z-10 p-3 bg-background/95 backdrop-blur-sm shadow-lg rounded-full active:bg-accent transition-colors disabled:opacity-50 touch-scroll-safe"
        title="Go to current location"
      >
        {isLoadingLocation ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Navigation className="h-5 w-5" />
        )}
      </button>

      {searchLocation && (
        <MapView 
          spots={filteredSpots} 
          searchCenter={searchLocation} 
          currentLocation={currentLocation || searchLocation}
          onVisibleSpotsChange={() => {}} 
          onMapMove={handleMapMove}
          searchQuery={searchQuery}
          exploreParams={exploreParams}
          selectedSpotId={selectedSpotId}
        />
      )}

      {/* Mobile Time Pickers */}
      {mobileStartPickerOpen && startTime && (
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

      {mobileEndPickerOpen && endTime && (
        <MobileTimePicker
          isOpen={mobileEndPickerOpen}
          onClose={() => setMobileEndPickerOpen(false)}
          onConfirm={(date) => {
            handleEndTimeChange(date);
            setMobileEndPickerOpen(false);
          }}
          mode="end"
          startTime={startTime || undefined}
          initialValue={endTime}
        />
      )}

      {/* EV Charger Fallback Dialog */}
      <AlertDialog open={showEvFallbackDialog} onOpenChange={setShowEvFallbackDialog}>
        <AlertDialogContent className="max-w-[320px] rounded-2xl p-6 gap-0">
          <AlertDialogHeader className="space-y-4">
            <div className="flex items-center justify-center">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-100 to-yellow-200 dark:from-amber-900/40 dark:to-yellow-800/30 flex items-center justify-center shadow-sm">
                <BatteryCharging className="h-7 w-7 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
            <AlertDialogTitle className="text-center text-lg font-semibold">
              No {evFallbackChargerName} Chargers
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center text-sm leading-relaxed">
              No spots with <span className="font-medium text-foreground">{evFallbackChargerName}</span> chargers are available for this time.
              <span className="block mt-3 text-xs text-muted-foreground">
                Showing parking-only spots instead.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-5 sm:justify-center">
            <AlertDialogAction 
              className="rounded-full px-6"
              onClick={() => setShowEvFallbackDialog(false)}
            >
              Got it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Explore;