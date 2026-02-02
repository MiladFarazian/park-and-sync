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
import { logger } from '@/lib/logger';
import { calculateBookingTotal } from '@/lib/pricing';

// Scoped logger for Explore page
const log = logger.scope('Explore');
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
const TWO_MILE_RADIUS_METERS = 3219; // 2 miles in meters
const EXPANDED_RADIUS_METERS = 15000; // ~9.3 miles for expanded search

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
      log.debug('Cache hit', { key, age: `${Math.round((Date.now() - cached.timestamp) / 1000)}s` });
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
  
  // "No spots within 2 miles" fallback state
  const [showNoSpotsNearbyDialog, setShowNoSpotsNearbyDialog] = useState(false);
  const noSpotsNearbyShownRef = useRef(false);
  
  // Demand notification state - shows when hosts are being notified about driver search
  const [showDemandNotificationBanner, setShowDemandNotificationBanner] = useState(false);
  const [demandNotificationTimeoutId, setDemandNotificationTimeoutId] = useState<NodeJS.Timeout | null>(null);
  const demandNotificationShownRef = useRef(false);
  
  const latestRequestIdRef = useRef(0);
  
  // Guard to prevent duplicate initial fetches
  const didInitialFetchRef = useRef(false);

  // Ignore the first onMapMove fired by Mapbox on initial idle
  const ignoreFirstMapMoveRef = useRef(true);

  // Track when initial load + state updates are complete, so handleMapMove can safely fetch
  const initialLoadCompleteRef = useRef(false);
  
  // Track last fetched center to avoid redundant requests for small movements
  const lastFetchedCenterRef = useRef<{ lat: number; lng: number; radius: number } | null>(null);
  
  // Adaptive debounce - increases during rapid panning
  const consecutiveMoveCountRef = useRef(0);
  const lastMoveTimeRef = useRef(0);

  // "Search Here" button state - shows when map has been panned away from search location
  const [showSearchHereButton, setShowSearchHereButton] = useState(false);
  const [pendingMapCenter, setPendingMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [pendingMapRadius, setPendingMapRadius] = useState<number>(EXPANDED_RADIUS_METERS);
  const [isSearchingHere, setIsSearchingHere] = useState(false);

  // Real-time subscription for demand-driven spot availability updates
  useEffect(() => {
    if (!showDemandNotificationBanner || !searchLocation) return;

    // Subscribe to a global availability updates channel
    // Hosts broadcast here when they save availability for today
    const channel = supabase
      .channel('availability-updates-global')
      .on('broadcast', { event: 'spot_available' }, async (payload) => {
        const { spot_id, spot_lat, spot_lng } = payload.payload;
        
        log.debug('Received spot_available broadcast', { spot_id, spot_lat, spot_lng });
        
        // Calculate distance from search location to spot
        const R = 6371e3;
        const φ1 = searchLocation.lat * Math.PI / 180;
        const φ2 = spot_lat * Math.PI / 180;
        const Δφ = (spot_lat - searchLocation.lat) * Math.PI / 180;
        const Δλ = (spot_lng - searchLocation.lng) * Math.PI / 180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c;

        // Only process if within reasonable distance (2 miles = 3219m)
        if (distance > 3219) {
          log.debug('Spot too far from search location, ignoring', { distance });
          return;
        }

        // Re-fetch this specific spot to check if it matches our search criteria
        try {
          const { data, error } = await supabase.functions.invoke('search-spots-lite', {
            body: {
              latitude: searchLocation.lat,
              longitude: searchLocation.lng,
              radius: EXPANDED_RADIUS_METERS,
              start_time: startTime?.toISOString(),
              end_time: endTime?.toISOString(),
            }
          });

          if (error) {
            log.error('Failed to fetch updated spot', { error });
            return;
          }

          // Find the spot in results
          const matchingSpot = data?.spots?.find((s: any) => s.id === spot_id);
          if (matchingSpot) {
            // Transform and add to map
            const bookingHours = startTime && endTime
              ? Math.max(1, (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60))
              : null;

            // Driver rate equals host rate - no hidden upcharge
            const hostHourlyRate = matchingSpot.hourly_rate;
            const driverHourlyRate = hostHourlyRate;
            let totalPrice: number | undefined;
            if (bookingHours) {
              const driverSubtotal = driverHourlyRate * bookingHours;
              const hostEarnings = hostHourlyRate * bookingHours;
              const serviceFee = Math.max(hostEarnings * 0.20, 1.00);
              const evPremium = matchingSpot.ev_charging_premium_per_hour || 0;
              const evChargingFee = evChargerType && matchingSpot.has_ev_charging ? evPremium * bookingHours : 0;
              totalPrice = Math.round((driverSubtotal + serviceFee + evChargingFee) * 100) / 100;
            }

            const newSpot = {
              id: matchingSpot.id,
              title: matchingSpot.title,
              category: matchingSpot.category,
              address: matchingSpot.address,
              hourlyRate: driverHourlyRate,
              evChargingPremium: matchingSpot.ev_charging_premium_per_hour || 0,
              rating: matchingSpot.spot_rating || 0,
              reviews: matchingSpot.spot_review_count || 0,
              lat: parseFloat(matchingSpot.latitude),
              lng: parseFloat(matchingSpot.longitude),
              imageUrl: matchingSpot.primary_photo_url,
              distance: matchingSpot.distance ? `${(matchingSpot.distance / 1000).toFixed(1)} km` : undefined,
              amenities: [
                ...(matchingSpot.has_ev_charging ? ['EV Charging'] : []), 
                ...(matchingSpot.is_covered ? ['Covered'] : []), 
                ...(matchingSpot.is_secure ? ['Security Camera'] : []), 
                ...(matchingSpot.is_ada_accessible ? ['ADA Accessible'] : []),
              ],
              hostId: matchingSpot.host_id,
              sizeConstraints: matchingSpot.size_constraints || [],
              userBooking: null,
              instantBook: matchingSpot.instant_book !== false,
              evChargerType: matchingSpot.ev_charger_type,
              hasEvCharging: matchingSpot.has_ev_charging,
              totalPrice,
            };

            // Add to spots if not already present
            setParkingSpots(prev => {
              if (prev.some(s => s.id === newSpot.id)) return prev;
              log.info('New parking spot available from demand notification', { spotId: newSpot.id, title: newSpot.title });
              toast.success('New parking spot available!');
              return [...prev, newSpot];
            });
          }
        } catch (err) {
          log.error('Error processing spot availability update', { error: err });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [showDemandNotificationBanner, searchLocation, startTime, endTime, evChargerType]);
  const [skipFlyToSearchCenter, setSkipFlyToSearchCenter] = useState(false);

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
      log.error('Reverse geocode failed', { error: error instanceof Error ? error.message : error });
    }
    return null;
  };

  // Function to reverse geocode to area-level label (neighborhood/city, not street address)
  const reverseGeocodeArea = async (lat: number, lng: number) => {
    if (!mapboxToken) return null;
    
    try {
      // Request only neighborhood, locality, and place types for area-level label
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxToken}&types=neighborhood,locality,place`
      );
      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        // Return the most specific area name (neighborhood first, then locality, then place)
        return data.features[0].place_name;
      }
    } catch (error) {
      log.error('Reverse geocode area failed', { error: error instanceof Error ? error.message : error });
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
        fetchNearbySpots(desired, EXPANDED_RADIUS_METERS, true, { start: start ? startDate : null, end: end ? endDate : null }, chargerTypeParam);
      } else {
        // Check cache first for instant render (time-bucketed)
        const cachedSpots = findCoveringCache(desired.lat, desired.lng, EXPANDED_RADIUS_METERS, initialTimeKey);
        if (cachedSpots) {
          setParkingSpots(cachedSpots);
          setSpotsLoading(false);
          // Defer background refresh to next tick to ensure time state is committed
          setTimeout(() => {
            fetchNearbySpots(desired, EXPANDED_RADIUS_METERS, false, { start: start ? startDate : null, end: end ? endDate : null });
          }, 0);
        } else {
          fetchNearbySpots(desired, EXPANDED_RADIUS_METERS, true, { start: start ? startDate : null, end: end ? endDate : null });
        }
      }
    } else if (query?.toLowerCase().includes('current location') && navigator.geolocation) {
      // No lat/lng but query is "Current Location" - get GPS coordinates
      setSearchQuery('Current Location');
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const desired = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setSearchLocation(desired);
          setCurrentLocation(desired);
          fetchNearbySpots(desired, EXPANDED_RADIUS_METERS, true, { start: start ? startDate : null, end: end ? endDate : null });
          
          // Update URL with actual coordinates
          const newParams = new URLSearchParams(searchParams);
          newParams.set('lat', desired.lat.toString());
          newParams.set('lng', desired.lng.toString());
          navigate(`/explore?${newParams.toString()}`, { replace: true });
        },
        (error) => {
          log.warn('GPS failed on Explore page, using default location', { code: error.code });
          // Fallback to default LA location
          const defaultLocation = { lat: 34.0224, lng: -118.2851 };
          setSearchLocation(defaultLocation);
          setSearchQuery('University Park, Los Angeles');
          fetchNearbySpots(defaultLocation, EXPANDED_RADIUS_METERS, true, { start: start ? startDate : null, end: end ? endDate : null });
        },
        { enableHighAccuracy: true, maximumAge: 30000, timeout: 10000 }
      );
    } else {
      // No URL lat/lng: show empty state, user needs to search
      setSpotsLoading(false);
    }
  }, [mapboxToken]);

  // Mark initial load as complete once URL-derived times are committed to state
  // This allows handleMapMove to safely use the time state for subsequent fetches
  useEffect(() => {
    if (!didInitialFetchRef.current) return;
    // Once initial fetch has run and this effect fires, state updates are committed
    initialLoadCompleteRef.current = true;
  }, [startTime, endTime]);

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
        log.warn('Location watch failed', { code: error.code, message: error.message });
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
      log.error('Failed to fetch Mapbox token', { error: error instanceof Error ? error.message : error });
    }
  };
  const searchByQuery = async (query: string) => {
    if (!query.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    if (!mapboxToken) {
      log.debug('Mapbox token not ready yet');
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
      
      log.debug('Search Box API suggest request', { query });

      const response = await fetch(url);
      const data = await response.json();

      log.debug('Search Box API response', { suggestionCount: data.suggestions?.length || 0 });

      if (data.suggestions && data.suggestions.length > 0) {
        setSuggestions(data.suggestions);
        setShowSuggestions(true);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    } catch (error) {
      log.error('Search Box API suggest failed', { error: error instanceof Error ? error.message : error });
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
    
    // Hide "Search Here" button when a new search is performed
    setShowSearchHereButton(false);
    setPendingMapCenter(null);
    
    try {
      const retrieveUrl = `https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(location.mapbox_id)}?access_token=${mapboxToken}&session_token=${sessionTokenRef.current}`;

      log.debug('Search Box API retrieve request', { mapbox_id: location.mapbox_id });

      const response = await fetch(retrieveUrl);
      const data = await response.json();
      
      if (data?.features?.[0]?.geometry?.coordinates) {
        const [lng, lat] = data.features[0].geometry.coordinates;
        const placeName = location.name || location.place_formatted || location.full_address;
        
        const desired = { lat, lng };
        setSearchLocation(desired);
        setSearchQuery(placeName);
        setShowSuggestions(false);
        setSuggestions([]);
        
        // Fetch spots for the new search location (pass current time state)
        fetchNearbySpots(desired, EXPANDED_RADIUS_METERS, true, { start: startTime, end: endTime });

        // Regenerate session token for next search session
        sessionTokenRef.current = crypto.randomUUID();
        log.debug('Search session token regenerated');
      }
    } catch (error) {
      log.error('Search Box API retrieve failed', { error: error instanceof Error ? error.message : error });
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
      log.error('Location search failed', { error: error instanceof Error ? error.message : error });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearchSubmit();
    }
  };

  const handleGoToCurrentLocation = async () => {
    // Hide "Search Here" button when navigating to current location
    setShowSearchHereButton(false);
    setPendingMapCenter(null);
    
    // If we already have a cached current location, use it immediately
    if (currentLocation) {
      setSearchLocation(currentLocation);
      fetchNearbySpots(currentLocation, EXPANDED_RADIUS_METERS, true, { start: startTime, end: endTime });

      // Get address in background
      if (mapboxToken) {
        reverseGeocode(currentLocation.lat, currentLocation.lng).then((address) => {
          if (address) setSearchQuery(address);
        });
      }
      return;
    }

    const logGeoError = (label: string, error: GeolocationPositionError) => {
      log.warn(label, { code: error.code, message: error.message });
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

      fetchNearbySpots(deviceLoc, EXPANDED_RADIUS_METERS, true, { start: startTime, end: endTime });
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
        maximumAge: 30000, // Allow 30s cached location for faster response
        timeout: 15000,    // Reduced timeout
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
    radius = EXPANDED_RADIUS_METERS,
    isInitialLoad = true,
    timeOverride?: { start: Date | null; end: Date | null },
    evChargerTypeFilter?: string | null,
    skipTwoMileCheck = false, // When true, skip the 2-mile check (used for expanded searches)
    skipCache = false // When true, always make fresh API call (used for map movements)
  ) => {
    if (!center) return;

    const effectiveStartTime = timeOverride?.start ?? startTime;
    const effectiveEndTime = timeOverride?.end ?? endTime;

    // Guard: If URL has time params but we don't have effective times, skip this fetch
    // This prevents race conditions where stale closures call without times
    // Use window.location.search to get current URL state (not stale closure)
    const currentUrlParams = new URLSearchParams(window.location.search);
    const urlHasTimeParams = currentUrlParams.get('start') || currentUrlParams.get('end');
    if (urlHasTimeParams && !effectiveStartTime && !effectiveEndTime && !timeOverride) {
      console.log('[Explore] Skipping fetch - URL has time params but no effective times (stale closure)');
      return;
    }
    const timeKey = getTimeBucketKey(effectiveStartTime, effectiveEndTime);

    // Skip cache when EV filter is applied to get accurate fallback notification
    // Also skip cache when explicitly requested (map pan/zoom) to ensure pins update
    if (!evChargerTypeFilter && !skipCache) {
      // Check regional cache first - only for initial loads
      const cachedData = findCoveringCache(center.lat, center.lng, radius, timeKey);
      if (cachedData && isInitialLoad) {
        // Only use cache for initial loads - background refreshes should hit API for fresh data
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

      // For initial searches (not map panning), first try 2-mile radius
      const shouldCheckTwoMileFirst = isInitialLoad && !skipTwoMileCheck && radius >= EXPANDED_RADIUS_METERS;
      const searchRadius = shouldCheckTwoMileFirst ? TWO_MILE_RADIUS_METERS : Math.ceil(radius);

      // Use search-spots-lite for fast map pin loading
      // Pass time range to filter out already-booked spots
      console.log('[Explore] Calling search-spots-lite:', {
        requestId,
        startTime: effectiveStartTime?.toISOString() || null,
        endTime: effectiveEndTime?.toISOString() || null,
        stateStartTime: startTime?.toISOString() || null,
        stateEndTime: endTime?.toISOString() || null,
        isInitialLoad,
        hasTimeOverride: !!timeOverride,
        initialLoadComplete: initialLoadCompleteRef.current,
      });
      const { data, error } = await supabase.functions.invoke('search-spots-lite', {
        body: {
          latitude: center.lat,
          longitude: center.lng,
          radius: searchRadius,
          limit: 500,
          start_time: effectiveStartTime ? effectiveStartTime.toISOString() : undefined,
          end_time: effectiveEndTime ? effectiveEndTime.toISOString() : undefined,
          ev_charger_type: evChargerTypeFilter || undefined,
        }
      });

      // Check if this request is still the latest one
      if (requestId !== latestRequestIdRef.current) {
        log.debug('Discarding stale response', { requestId, latest: latestRequestIdRef.current });
        return;
      }

      if (error) {
        log.error('Spot search failed', { error: error.message });
        // Check for rate limit error (429)
        if (error.message?.includes('429') || error.message?.includes('Too many requests')) {
          toast.error('Too many requests. Please wait a moment and try again.', {
            duration: 5000,
          });
        }
        return;
      }

      const spots = data.spots || [];

      // Debug logging for availability filtering investigation
      if (data._debug) {
        console.log('[Explore] search-spots-lite response:', { requestId, latestRequestId: latestRequestIdRef.current, spotCount: spots.length, debug: data._debug });
      }

      // If API returns 0 spots and we had spots before, clear them immediately
      // This ensures stale cached data doesn't persist on the map
      if (spots.length === 0 && parkingSpots.length > 0) {
        console.log('[Explore] Clearing stale spots from map');
        setParkingSpots([]);
      }

      // If we searched with 2-mile radius and found no spots, show dialog and expand search
      if (shouldCheckTwoMileFirst && spots.length === 0) {
        console.log('[Explore] 2-mile search returned 0 spots, expanding to 15km...');
        // Prevent showing the dialog multiple times for the same search
        const noSpotsKey = `no-spots-nearby-v1:${center.lat.toFixed(4)}:${center.lng.toFixed(4)}:${timeKey}`;
        const alreadyShown = sessionStorage.getItem(noSpotsKey) === '1' || noSpotsNearbyShownRef.current;

        if (!alreadyShown) {
          sessionStorage.setItem(noSpotsKey, '1');
          noSpotsNearbyShownRef.current = true;
          setShowNoSpotsNearbyDialog(true);
        }

        // Clear any stale spots before expanding search
        setParkingSpots([]);

        // Fetch expanded results to show on the map
        await fetchNearbySpots(center, EXPANDED_RADIUS_METERS, isInitialLoad, timeOverride, evChargerTypeFilter, true);
        return;
      }

      // Handle demand notification response - show banner when hosts are being notified
      if (data.demand_notification_sent) {
        const demandKey = `demand-notification-v1:${center.lat.toFixed(4)}:${center.lng.toFixed(4)}:${timeKey}`;
        const alreadyShownDemand = sessionStorage.getItem(demandKey) === '1' || demandNotificationShownRef.current;

        if (!alreadyShownDemand) {
          sessionStorage.setItem(demandKey, '1');
          demandNotificationShownRef.current = true;
          setShowDemandNotificationBanner(true);
          
          // Clear any existing timeout
          if (demandNotificationTimeoutId) {
            clearTimeout(demandNotificationTimeoutId);
          }
          
          // Auto-hide banner after timeout (default 45 seconds)
          const timeoutSeconds = data.notification_timeout_seconds || 45;
          const timeoutId = setTimeout(() => {
            setShowDemandNotificationBanner(false);
          }, timeoutSeconds * 1000);
          setDemandNotificationTimeoutId(timeoutId);
        }
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

      // Calculate booking hours for total price display on map pins
      const bookingHours = effectiveStartTime && effectiveEndTime
        ? Math.max(1, (effectiveEndTime.getTime() - effectiveStartTime.getTime()) / (1000 * 60 * 60))
        : null;

      const transformedSpots = spots.map((spot: any) => {
        // spot.hourly_rate from lite endpoint is ALREADY the driver rate (host rate + markup)
        const driverHourlyRate = spot.hourly_rate;
        const evPremium = spot.ev_charging_premium_per_hour || 0;
        
        // Calculate total price for map pins (includes EV charging if EV filter is active)
        let totalPrice: number | undefined;
        if (bookingHours) {
          const willUseEvCharging = evChargerTypeFilter != null && spot.has_ev_charging;
          
          // Driver rate equals host rate - no hidden upcharge
          const hostHourlyRate = driverHourlyRate;
          const driverSubtotal = driverHourlyRate * bookingHours;
          const hostEarnings = hostHourlyRate * bookingHours;
          const serviceFee = Math.max(hostEarnings * 0.20, 1.00);
          const evChargingFee = willUseEvCharging ? evPremium * bookingHours : 0;
          
          totalPrice = Math.round((driverSubtotal + serviceFee + evChargingFee) * 100) / 100;
        }

        return {
          id: spot.id,
          title: spot.title,
          category: spot.category,
          address: spot.address,
          hourlyRate: driverHourlyRate, // Already includes platform fee from lite endpoint
          evChargingPremium: evPremium,
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
          hasEvCharging: spot.has_ev_charging,
          totalPrice, // Total booking cost for map pin display
          quantity: spot.quantity || 1,
          availableQuantity: spot.available_quantity ?? spot.quantity ?? 1,
        };
      }) || [];

      console.log('[Explore] Setting parkingSpots to', transformedSpots.length, 'spots');
      setParkingSpots(transformedSpots);

      // Cache the results for instant back/forward navigation (time-bucketed)
      // Skip caching when EV filter is applied to avoid stale fallback data
      if (!evChargerTypeFilter) {
        const cacheKey = getRegionalCacheKey(center.lat, center.lng, radius, timeKey);
        setCachedSpots(cacheKey, transformedSpots, center, radius);
      }
    } catch (err) {
      log.error('Unexpected error in fetchNearbySpots', { error: err instanceof Error ? err.message : err });
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
      fetchNearbySpots(searchLocation, EXPANDED_RADIUS_METERS, false, { start: startTime, end: endTime });
    } else if (chargerTypesChanged && filters.evChargerTypes && filters.evChargerTypes.length > 0) {
      // Charger type changed - refetch with new filter
      const newChargerType = filters.evChargerTypes[0]; // Use first selected type for API
      setEvChargerType(newChargerType);
      fetchNearbySpots(searchLocation, EXPANDED_RADIUS_METERS, false, { start: startTime, end: endTime }, newChargerType);
    }
  }, [filters.evCharging, filters.evChargerTypes, searchLocation, fetchNearbySpots, startTime, endTime]);

  const evFallbackDismissedRef = useRef(false);

  // Open EV fallback dialog only after the map/list has rendered (prevents a "black" backdrop flash)
  useEffect(() => {
    if (!pendingEvFallbackDialog) return;
    if (spotsLoading) return;

    evFallbackDismissedRef.current = false;
    setShowEvFallbackDialog(true);
    setPendingEvFallbackDialog(false);
  }, [pendingEvFallbackDialog, spotsLoading]);

  const dismissEvFallbackAndClearFilters = useCallback(() => {
    // Prevent double-processing (AlertDialogAction closes + onOpenChange fires)
    if (evFallbackDismissedRef.current) return;
    evFallbackDismissedRef.current = true;

    setShowEvFallbackDialog(false);

    // Clear EV filter state
    setEvChargerType(null);
    setFilters((prev) => ({
      ...prev,
      evCharging: false,
      evChargerTypes: [],
    }));

    // Also remove EV filters from the URL (otherwise the page still "looks filtered")
    const params = new URLSearchParams(window.location.search);
    params.delete('ev');
    params.delete('chargerType');

    const qs = params.toString();
    navigate(`/explore${qs ? `?${qs}` : ''}`, { replace: true });
  }, [navigate]);

  const handleMapMove = (center: {
    lat: number;
    lng: number;
  }, radiusMeters: number) => {
    // Ignore the first automatic map move fired on initial load
    if (ignoreFirstMapMoveRef.current) {
      ignoreFirstMapMoveRef.current = false;
      return;
    }

    // Don't trigger fetches until initial load is complete and state is ready
    // This prevents race conditions where map moves before URL params are committed to state
    if (!initialLoadCompleteRef.current) {
      return;
    }
    
    // Check if map has moved significantly from the original search location to show "Search Here" button
    if (searchLocation) {
      const latDiffFromSearch = Math.abs(center.lat - searchLocation.lat) * 111000;
      const lngDiffFromSearch = Math.abs(center.lng - searchLocation.lng) * 111000 * Math.cos(center.lat * Math.PI / 180);
      const distanceFromSearch = Math.sqrt(latDiffFromSearch ** 2 + lngDiffFromSearch ** 2);
      
      // Show "Search Here" if moved more than 15% of the current radius or 500m, whichever is larger
      const threshold = Math.max(radiusMeters * 0.15, 500);
      
      if (distanceFromSearch > threshold) {
        setPendingMapCenter(center);
        setPendingMapRadius(radiusMeters);
        setShowSearchHereButton(true);
      } else {
        setShowSearchHereButton(false);
        setPendingMapCenter(null);
      }
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
      // Pass skipCache=true to ensure fresh API call for map movements
      // Pass current times to maintain availability filtering during map pan/zoom
      fetchNearbySpots(center, radiusMeters, false, { start: startTime, end: endTime }, undefined, false, true);
    }, debounceDelay);
  };

  // Handle "Search Here" button click - searches for spots in the entire visible map area
  const handleSearchHere = useCallback(async () => {
    if (!pendingMapCenter || !mapboxToken) return;
    
    setIsSearchingHere(true);
    
    const savedCenter = pendingMapCenter;
    const savedRadius = pendingMapRadius;
    
    // Set skip flag BEFORE updating searchLocation to prevent MapView from flying/zooming
    setSkipFlyToSearchCenter(true);
    
    // Update the search location to the new map center (won't trigger flyTo due to skip flag)
    setSearchLocation(savedCenter);
    setShowSearchHereButton(false);
    setPendingMapCenter(null);
    
    // Get area-level label for the new location (neighborhood/city, not street address)
    const areaLabel = await reverseGeocodeArea(savedCenter.lat, savedCenter.lng);
    if (areaLabel) {
      setSearchQuery(areaLabel);
    }
    
    // Update URL with new coordinates and area label
    const params = new URLSearchParams();
    params.set('lat', savedCenter.lat.toString());
    params.set('lng', savedCenter.lng.toString());
    if (startTime) params.set('start', startTime.toISOString());
    if (endTime) params.set('end', endTime.toISOString());
    if (areaLabel) params.set('q', areaLabel);
    navigate(`/explore?${params.toString()}`, { replace: true });
    
    // Update lastFetchedCenterRef to prevent handleMapMove from triggering another fetch
    lastFetchedCenterRef.current = { lat: savedCenter.lat, lng: savedCenter.lng, radius: savedRadius };

    // Fetch spots for the entire visible map area using the current map radius (no zoom)
    await fetchNearbySpots(savedCenter, savedRadius, false, { start: startTime, end: endTime });

    setIsSearchingHere(false);
    
    // Reset skip flag after a short delay to allow normal behavior for future searches
    setTimeout(() => setSkipFlyToSearchCenter(false), 100);
  }, [pendingMapCenter, pendingMapRadius, mapboxToken, reverseGeocodeArea, navigate, startTime, endTime, fetchNearbySpots]);
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
    fetchNearbySpots(searchLocation, EXPANDED_RADIUS_METERS, false, {
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
          {/* Search Here Button - Desktop */}
          {showSearchHereButton && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
              <Button
                variant="secondary"
                onClick={handleSearchHere}
                disabled={isSearchingHere}
                className="rounded-full bg-background/95 backdrop-blur-sm shadow-lg hover:bg-accent animate-in fade-in slide-in-from-top-2 duration-200"
              >
                {isSearchingHere ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Search className="h-4 w-4 mr-2" />
                )}
                Search this area
              </Button>
            </div>
          )}
          
          {/* Non-blocking loading indicator */}
          {spotsLoading && !showSearchHereButton && (
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

          {/* Demand Notification Banner - Desktop */}
          {showDemandNotificationBanner && (
            <div className="absolute top-32 left-1/2 -translate-x-1/2 z-10 max-w-md w-full px-4">
              <Card className="p-3 bg-primary/10 border-primary/20 backdrop-blur-sm shadow-lg">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-primary flex-shrink-0" />
                  <p className="text-sm text-foreground">
                    Hosts nearby have been notified to update their availability to provide you with more options.
                  </p>
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
              skipFlyToSearchCenter={skipFlyToSearchCenter}
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
      {/* Loading state is shown via map markers loading - removed redundant overlay indicator */}
      
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
        
        {/* Filter Button and Search Here - Below time selector */}
        <div className="flex justify-end gap-2 px-4">
          {showSearchHereButton && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSearchHere}
              disabled={isSearchingHere}
              className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg animate-in fade-in slide-in-from-top-2 duration-200"
            >
              {isSearchingHere ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Search className="h-4 w-4 mr-1.5" />
              )}
              Search Here
            </Button>
          )}
          <MobileFilterSheet
            filters={filters}
            onFiltersChange={setFilters}
            totalSpots={parkingSpots.length}
            filteredCount={filteredSpots.length}
          />
        </div>
        
        {/* Demand Notification Banner - Shows when hosts are being notified */}
        {showDemandNotificationBanner && (
          <div className="max-w-md mx-auto mt-2">
            <Card className="p-3 bg-primary/10 border-primary/20 backdrop-blur-sm shadow-lg">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary flex-shrink-0" />
                <p className="text-sm text-foreground">
                  Hosts nearby have been notified to update their availability to provide you with more options.
                </p>
              </div>
            </Card>
          </div>
        )}
      </div>
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
          skipFlyToSearchCenter={skipFlyToSearchCenter}
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

      {/* No Spots Within 2 Miles Dialog */}
      <AlertDialog 
        open={showNoSpotsNearbyDialog} 
        onOpenChange={(open) => {
          if (!open) {
            setShowNoSpotsNearbyDialog(false);
          }
        }}
      >
        <AlertDialogContent className="max-w-[320px] rounded-2xl p-6 gap-0">
          <AlertDialogHeader className="space-y-4">
            <div className="flex items-center justify-center">
              <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center shadow-sm">
                <MapPin className="h-7 w-7 text-muted-foreground" />
              </div>
            </div>
            <AlertDialogTitle className="text-center text-lg font-semibold">
              No Spots Within 2 Miles
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center text-sm leading-relaxed">
              There are no parking spots available within 2 miles of your search location.
              <span className="block mt-3 text-xs text-muted-foreground">
                Showing the nearest spots so you can explore the map.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-5 sm:justify-center">
            <AlertDialogAction
              className="rounded-full px-6"
              onClick={() => setShowNoSpotsNearbyDialog(false)}
            >
              Got it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* EV Charger Fallback Dialog */}
      <AlertDialog 
        open={showEvFallbackDialog} 
        onOpenChange={(open) => {
          if (!open) {
            dismissEvFallbackAndClearFilters();
            return;
          }
          evFallbackDismissedRef.current = false;
          setShowEvFallbackDialog(true);
        }}
      >
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
              onClick={dismissEvFallbackAndClearFilters}
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