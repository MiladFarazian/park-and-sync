import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Star, MapPin, Navigation, Footprints, Pencil, ChevronLeft, ChevronRight, Zap, Heart } from 'lucide-react';
import { EVChargerBadge } from '@/components/ev/EVChargerBadge';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useMode } from '@/contexts/ModeContext';
import { useAuth } from '@/contexts/AuthContext';
import useEmblaCarousel from 'embla-carousel-react';
import { useFavoriteSpots } from '@/hooks/useFavoriteSpots';
import { cn } from '@/lib/utils';

interface UserBooking {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
}

interface Spot {
  id: string;
  title: string;
  category?: string;
  address: string;
  hourlyRate: number;
  evChargingPremium?: number;
  hasEvCharging?: boolean;
  evChargerType?: string;
  lat: number;
  lng: number;
  rating?: number;
  reviews?: number;
  imageUrl?: string;
  hostId?: string;
  userBooking?: UserBooking | null;
}

interface MapViewProps {
  spots: Spot[];
  searchCenter?: { lat: number; lng: number };
  currentLocation?: { lat: number; lng: number };
  onVisibleSpotsChange?: (count: number) => void;
  onMapMove?: (center: { lat: number; lng: number }, radiusMeters: number) => void;
  searchQuery?: string;
  exploreParams?: {
    lat?: string;
    lng?: string;
    start?: string;
    end?: string;
    q?: string;
  };
  highlightedSpotId?: string | null;
  selectedSpotId?: string | null; // For selected spot visual differentiation
  onSpotHover?: (spotId: string | null) => void;
  onSpotSelect?: (spotId: string) => void; // Callback when a marker is clicked
  hideCarousel?: boolean;
}

// Calculate distance between two coordinates using Haversine formula (returns miles)
const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Calculate walk time in minutes (assuming 3 mph walking speed)
const calculateWalkTime = (distanceMiles: number): number => {
  return Math.round((distanceMiles / 3) * 60);
};

const MapView = ({ spots, searchCenter, currentLocation, onVisibleSpotsChange, onMapMove, searchQuery, exploreParams, highlightedSpotId, selectedSpotId: propSelectedSpotId, onSpotHover, onSpotSelect, hideCarousel }: MapViewProps) => {
  const navigate = useNavigate();
  const { mode, setMode } = useMode();
  const { user } = useAuth();
  const { isFavorite, toggleFavorite, isLoading: isFavoriteLoading } = useFavoriteSpots();
  
  const buildSpotUrl = (spotId: string) => {
    const params = new URLSearchParams({ from: 'explore' });
    if (exploreParams?.lat) params.set('lat', exploreParams.lat);
    if (exploreParams?.lng) params.set('lng', exploreParams.lng);
    if (exploreParams?.start) params.set('start', exploreParams.start);
    if (exploreParams?.end) params.set('end', exploreParams.end);
    if (exploreParams?.q) params.set('q', exploreParams.q);
    return `/spot/${spotId}?${params.toString()}`;
  };

  const buildBookingUrl = (spotId: string) => {
    const params = new URLSearchParams();
    if (exploreParams?.start) params.set('start', exploreParams.start);
    if (exploreParams?.end) params.set('end', exploreParams.end);
    return `/book/${spotId}${params.toString() ? `?${params.toString()}` : ''}`;
  };
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const searchMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const spotsRef = useRef<Spot[]>([]); // Keep current spots for event handlers
  const isCarouselNavigationRef = useRef(false); // Track carousel-initiated map movements
  const skipNextMapMoveRef = useRef(false); // Prevent refetch on programmatic flyTo (carousel/marker)
  const pendingCarouselSpotIdRef = useRef<string | null>(null); // Ensure marker-click selection always syncs to carousel
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [nearestSpotId, setNearestSpotId] = useState<string | null>(null);
  const [userSelectedSpot, setUserSelectedSpot] = useState(false);
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [sortedSpots, setSortedSpots] = useState<Spot[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [animatingSlideIndex, setAnimatingSlideIndex] = useState<number | null>(null);
  
  // Embla carousel for swipeable spot cards
  const [emblaRef, emblaApi] = useEmblaCarousel({ 
    loop: false,
    align: 'center',
    containScroll: 'trimSnaps'
  });

  // Update spots ref whenever spots change
  useEffect(() => {
    spotsRef.current = spots;
  }, [spots]);

  // Sort spots by distance when spots or searchCenter change
  useEffect(() => {
    if (!spots.length || !searchCenter) {
      setSortedSpots([]);
      return;
    }

    const sorted = [...spots].sort((a, b) => {
      const distA = calculateDistance(searchCenter.lat, searchCenter.lng, Number(a.lat), Number(a.lng));
      const distB = calculateDistance(searchCenter.lat, searchCenter.lng, Number(b.lat), Number(b.lng));
      return distA - distB;
    });

    setSortedSpots(sorted);
    
    // Set the nearest spot ID (first in sorted array)
    if (sorted.length > 0) {
      setNearestSpotId(sorted[0].id);
    }
  }, [spots, searchCenter]);

  // Auto-select nearest spot when sorted spots are ready (only if user hasn't manually selected)
  useEffect(() => {
    if (!sortedSpots.length || !mapReady || userSelectedSpot) return;
    
    setSelectedSpot(sortedSpots[0]);
    setCurrentSlideIndex(0);
  }, [sortedSpots, mapReady, userSelectedSpot]);

  // Sync carousel with embla on select
  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    const index = emblaApi.selectedScrollSnap();
    setCurrentSlideIndex(index);
    
    // Trigger pulse animation for 3 seconds
    setAnimatingSlideIndex(index);
    setTimeout(() => setAnimatingSlideIndex(null), 3000);
    
    if (sortedSpots[index]) {
      setSelectedSpot(sortedSpots[index]);
      setUserSelectedSpot(true);
      
        // Pan map to selected spot - mark as carousel navigation to prevent refetch
        if (map.current) {
          isCarouselNavigationRef.current = true;
          skipNextMapMoveRef.current = true;

          // IMPORTANT: keep the guard enabled until the next 'idle' event.
          // Otherwise Mapbox's global `idle` listener will fire after flyTo and
          // trigger `onMapMove`, which can refetch a narrower result set and make
          // it look like only the last card exists.
          map.current.once('idle', () => {
            requestAnimationFrame(() => {
              isCarouselNavigationRef.current = false;
            });
          });

          map.current.flyTo({
            center: [sortedSpots[index].lng, sortedSpots[index].lat],
            zoom: Math.min(map.current.getZoom(), 13), // Zoom out to 13 max for better context
            duration: 500
          });
        }
    }
  }, [emblaApi, sortedSpots]);

  // Sync carousel index when spots array changes - try to preserve current selection
  useEffect(() => {
    if (!emblaApi || !sortedSpots.length) return;
    
    // If we have a selected spot, try to find it in the new sorted spots
    if (selectedSpot) {
      const newIndex = sortedSpots.findIndex(s => s.id === selectedSpot.id);
      if (newIndex !== -1 && newIndex !== currentSlideIndex) {
        setCurrentSlideIndex(newIndex);
        emblaApi.scrollTo(newIndex, true); // instant scroll, no animation
        return;
      }
    }
    
    // If current index is out of bounds, reset to 0
    if (currentSlideIndex >= sortedSpots.length) {
      setCurrentSlideIndex(0);
      emblaApi.scrollTo(0);
      if (sortedSpots[0]) {
        setSelectedSpot(sortedSpots[0]);
      }
    }
  }, [sortedSpots, emblaApi, currentSlideIndex, selectedSpot]);

  // Set up embla event listeners
  useEffect(() => {
    if (!emblaApi) return;
    
    emblaApi.on('select', onSelect);
    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi, onSelect]);

  const syncCarouselToSpotId = useCallback(
    (spotId: string) => {
      if (!emblaApi || !sortedSpots.length) return false;

      const index = sortedSpots.findIndex((s) => s.id === spotId);
      if (index === -1) return false;

      if (emblaApi.selectedScrollSnap() !== index) {
        emblaApi.scrollTo(index);
      }
      setCurrentSlideIndex(index);
      return true;
    },
    [emblaApi, sortedSpots]
  );

  // Scroll carousel to spot when marker is clicked (and keep it synced through any refetch/re-sort)
  const scrollToSpot = useCallback(
    (spotId: string) => {
      pendingCarouselSpotIdRef.current = spotId;
      syncCarouselToSpotId(spotId);
    },
    [syncCarouselToSpotId]
  );

  // If spots re-fetch or re-sort happens after a marker click, force the carousel to the selected spot
  useEffect(() => {
    if (!emblaApi || !sortedSpots.length) return;

    const targetId = pendingCarouselSpotIdRef.current ?? selectedSpot?.id;
    if (!targetId) return;

    const didSync = syncCarouselToSpotId(targetId);
    if (didSync && pendingCarouselSpotIdRef.current === targetId) {
      pendingCarouselSpotIdRef.current = null;
    }
  }, [emblaApi, sortedSpots.length, selectedSpot?.id, syncCarouselToSpotId]);

  // Navigation handlers
  const scrollPrev = useCallback(() => {
    if (emblaApi) emblaApi.scrollPrev();
  }, [emblaApi]);

  const scrollNext = useCallback(() => {
    if (emblaApi) emblaApi.scrollNext();
  }, [emblaApi]);

  // Fetch Mapbox token
  useEffect(() => {
    const fetchMapboxToken = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('get-mapbox-token');
        if (error) throw error;
        setMapboxToken(data.token);
      } catch (error) {
        console.error('Error fetching Mapbox token:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMapboxToken();
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || !mapboxToken || map.current) return;

    mapboxgl.accessToken = mapboxToken;

    // Use search center if provided, otherwise calculate from spots
    const center: [number, number] = searchCenter 
      ? [searchCenter.lng, searchCenter.lat]
      : spots.length > 0 
      ? [
          spots.reduce((sum, spot) => sum + Number(spot.lng), 0) / spots.length,
          spots.reduce((sum, spot) => sum + Number(spot.lat), 0) / spots.length
        ]
      : [-118.2437, 34.0522]; // Default to central LA
    
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: center,
      zoom: 14 // Start at neighborhood zoom level
    });

    // Enable smooth transitions for hover effects
    map.current.once('styledata', () => {
      if (map.current) {
        const styleSpec = map.current.getStyle();
        if (styleSpec && styleSpec.transition) {
          styleSpec.transition.duration = 300; // 300ms transitions
          styleSpec.transition.delay = 0;
        }
      }
    });

    // Don't add navigation controls to avoid overlap with search bar

    // Mark map as ready when loaded
    map.current.on('load', () => {
      setMapReady(true);
      
      // Defensive cleanup: remove any orphaned HTML markers
      mapContainer.current?.querySelectorAll('.mapboxgl-marker').forEach(marker => marker.remove());
      
      // Modern map style - no customization needed

      // Add user location source and layers
      if (map.current && !map.current.getSource('user-location')) {
        map.current.addSource('user-location', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: []
          }
        });

        // Static outer ring (Apple Maps style)
        map.current.addLayer({
          id: 'user-location-outer',
          type: 'circle',
          source: 'user-location',
          paint: {
            'circle-radius': 20,
            'circle-color': '#4A90E2',
            'circle-opacity': 0.2
          }
        });

        // Inner solid dot (Apple Maps style)
        map.current.addLayer({
          id: 'user-location-inner',
          type: 'circle',
          source: 'user-location',
          paint: {
            'circle-radius': 8,
            'circle-color': '#4A90E2',
            'circle-opacity': 1,
            'circle-stroke-width': 3,
            'circle-stroke-color': 'white'
          }
        });
      }

      // Add destination location source and layers
      if (map.current && !map.current.getSource('destination-location')) {
        map.current.addSource('destination-location', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: []
          }
        });

        // Load destination pin image (modern purple pin without shadow)
        const destPinSvg = `
          <svg width="36" height="44" viewBox="0 0 36 44" xmlns="http://www.w3.org/2000/svg">
            <path d="M 18 2 C 10 2 4 8 4 16 C 4 26 18 42 18 42 C 18 42 32 26 32 16 C 32 8 26 2 18 2 Z" 
                  fill="#f0edfe" stroke="#694dff" stroke-width="2"/>
            <circle cx="18" cy="16" r="6" fill="#694dff"/>
          </svg>`;
        const destPinUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(destPinSvg);
        const destImg = new Image(36, 44);
        destImg.onload = () => {
          try {
            if (!map.current?.hasImage('pin-destination')) {
              map.current?.addImage('pin-destination', destImg, { pixelRatio: 2 });
            }
          } catch (e) {
            console.warn('Destination pin image error:', e);
          }
        };
        destImg.src = destPinUrl;

        // Destination pin layer
        map.current.addLayer({
          id: 'destination-pin',
          type: 'symbol',
          source: 'destination-location',
          layout: {
            'icon-image': 'pin-destination',
            'icon-size': 1.2,
            'icon-allow-overlap': true,
            'icon-anchor': 'bottom'
          },
          paint: {
            'icon-opacity': 1
          }
        });
      }
    });

    // Also add layers on style.load (in case style changes)
    map.current.on('style.load', () => {
      if (map.current && !map.current.getSource('user-location')) {
        map.current.addSource('user-location', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: []
          }
        });

        map.current.addLayer({
          id: 'user-location-outer',
          type: 'circle',
          source: 'user-location',
          paint: {
            'circle-radius': 20,
            'circle-color': '#4A90E2',
            'circle-opacity': 0.2
          }
        });

        map.current.addLayer({
          id: 'user-location-inner',
          type: 'circle',
          source: 'user-location',
          paint: {
            'circle-radius': 8,
            'circle-color': '#4A90E2',
            'circle-opacity': 1,
            'circle-stroke-width': 3,
            'circle-stroke-color': 'white'
          }
        });
      }

      if (map.current && !map.current.getSource('destination-location')) {
        map.current.addSource('destination-location', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: []
          }
        });

        const destPinSvg = `
          <svg width="36" height="44" viewBox="0 0 36 44" xmlns="http://www.w3.org/2000/svg">
            <path d="M 18 2 C 10 2 4 8 4 16 C 4 26 18 42 18 42 C 18 42 32 26 32 16 C 32 8 26 2 18 2 Z" 
                  fill="#f0edfe" stroke="#694dff" stroke-width="2"/>
            <circle cx="18" cy="16" r="6" fill="#694dff"/>
          </svg>`;
        const destPinUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(destPinSvg);
        const destImg = new Image(36, 44);
        destImg.onload = () => {
          try {
            if (!map.current?.hasImage('pin-destination')) {
              map.current?.addImage('pin-destination', destImg, { pixelRatio: 2 });
            }
          } catch (e) {
            console.warn('Destination pin image error (alt):', e);
          }
        };
        destImg.src = destPinUrl;

        map.current.addLayer({
          id: 'destination-pin',
          type: 'symbol',
          source: 'destination-location',
          layout: {
            'icon-image': 'pin-destination',
            'icon-size': 1.2,
            'icon-allow-overlap': true,
            'icon-anchor': 'bottom'
          },
          paint: {
            'icon-opacity': 1
          }
        });
      }
    });

    // Update visible spots count and notify parent when map moves
    const updateVisibleSpots = () => {
      if (!map.current) return;

      // Skip the next map-move update when the movement was triggered by us (carousel/marker)
      if (skipNextMapMoveRef.current) {
        skipNextMapMoveRef.current = false;
        return;
      }

      // Skip API call if this movement was from carousel navigation
      if (isCarouselNavigationRef.current) {
        return;
      }
      
      const bounds = map.current.getBounds();
      const center = map.current.getCenter();
      
      // Calculate radius based on viewport bounds (distance from center to corner)
      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();
      const centerLat = center.lat;
      const centerLng = center.lng;
      
      // Calculate approximate radius in meters (distance from center to corner)
      const latDiff = ne.lat - centerLat;
      const lngDiff = ne.lng - centerLng;
      const radiusMeters = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff) * 111320; // Convert to meters
      
      // Notify parent of map movement with center and radius
      onMapMove?.({ lat: centerLat, lng: centerLng }, Math.max(5000, radiusMeters)); // Min 5km
      
      // Update visible spots count
      if (spots.length) {
        const visibleSpots = spots.filter(spot => {
          const lat = Number(spot.lat);
          const lng = Number(spot.lng);
          return bounds.contains([lng, lat]);
        });
        onVisibleSpotsChange?.(visibleSpots.length);
      }
    };

    map.current.on('moveend', updateVisibleSpots);
    map.current.on('zoomend', updateVisibleSpots);
    
    // Initial update after map loads
    map.current.on('idle', () => {
      updateVisibleSpots();
    });

    // Cleanup function
    return () => {
      // Remove any orphaned HTML markers on cleanup
      mapContainer.current?.querySelectorAll('.mapboxgl-marker').forEach(marker => marker.remove());
    };
  }, [mapboxToken]);

  // Fly to search center when it changes (destination location)
  useEffect(() => {
    if (!map.current || !mapReady || !searchCenter) return;

    const { lat, lng } = searchCenter;
    if (
      typeof lat !== 'number' || typeof lng !== 'number' ||
      !isFinite(lat) || !isFinite(lng) ||
      lat < -90 || lat > 90 ||
      lng < -180 || lng > 180
    ) {
      console.warn('Invalid search center coordinates:', lat, lng);
      return;
    }

    // Always fly to the destination (searchCenter), not current location
    map.current.flyTo({
      center: [lng, lat],
      zoom: 14,
      essential: true,
      duration: 1500
    });
  }, [searchCenter, mapReady]);

  // Update current location GeoJSON source when currentLocation changes
  useEffect(() => {
    if (!map.current || !mapReady || !currentLocation) return;

    // Validate coordinates
    const { lat, lng } = currentLocation;
    if (
      typeof lat !== 'number' || typeof lng !== 'number' ||
      !isFinite(lat) || !isFinite(lng) ||
      lat < -90 || lat > 90 ||
      lng < -180 || lng > 180
    ) {
      console.warn('Invalid current location coordinates:', lat, lng);
      return;
    }

    const source = map.current.getSource('user-location');
    if (source && 'setData' in source) {
      (source as mapboxgl.GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [lng, lat]
            },
            properties: {}
          }
        ]
      });
    }
  }, [currentLocation, mapReady]);

  // Update destination location GeoJSON source when searchCenter changes
  useEffect(() => {
    if (!map.current || !mapReady || !searchCenter) return;

    // Validate coordinates
    const { lat, lng } = searchCenter;
    if (
      typeof lat !== 'number' || typeof lng !== 'number' ||
      !isFinite(lat) || !isFinite(lng) ||
      lat < -90 || lat > 90 ||
      lng < -180 || lng > 180
    ) {
      console.warn('Invalid search center coordinates:', lat, lng);
      return;
    }

    const source = map.current.getSource('destination-location');
    if (source && 'setData' in source) {
      (source as mapboxgl.GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [lng, lat]
            },
            properties: {}
          }
        ]
      });
    }
  }, [searchCenter, mapReady]);

  // Add markers for spots
  useEffect(() => {
    if (!map.current || !mapReady) return;
    
    const sourceId = 'spots-source';
    const circleId = 'spots-circles';
    const labelId = 'spots-labels';
    
    // If spots array is empty, just update the source to be empty
    if (!spots.length) {
      const source = map.current.getSource(sourceId);
      if (source && 'setData' in source) {
        (source as any).setData({ type: 'FeatureCollection', features: [] });
      }
      return;
    }

    // Clear existing HTML markers
    markers.current.forEach(marker => marker.remove());
    markers.current = [];

    // Render spots using Mapbox layers with pin shape
    const features = spots
      .map((spot) => {
        const rawLat = Number(spot.lat);
        const rawLng = Number(spot.lng);
        const latOk = !isNaN(rawLat) && rawLat >= -90 && rawLat <= 90;
        const lngOk = !isNaN(rawLng) && rawLng >= -180 && rawLng <= 180;
        let lat = rawLat;
        let lng = rawLng;
        if (!latOk || !lngOk) {
          if (!isNaN(rawLng) && rawLng >= -90 && rawLng <= 90 && !isNaN(rawLat) && rawLat >= -180 && rawLat <= 180) {
            lat = rawLng;
            lng = rawLat;
          } else {
            console.warn('Skipping invalid coords for spot', spot.title, rawLat, rawLng);
            return null;
          }
        }
        return {
          type: 'Feature',
          id: spot.id, // Add id at feature level for feature-state to work
          properties: { id: spot.id, title: spot.title, price: `$${spot.hourlyRate}` },
          geometry: { type: 'Point', coordinates: [lng, lat] as [number, number] },
        } as any;
      })
      .filter(Boolean);

    const data = { type: 'FeatureCollection', features } as any;

    // Update existing source or create new one
    const existingSource = (map.current as any).getSource(sourceId);
    if (existingSource) {
      // Just update the data instead of removing and re-adding everything
      existingSource.setData(data);
      return; // Exit early, layers already exist
    }

    // First time: Add source with clustering enabled
    (map.current as any).addSource(sourceId, { 
      type: 'geojson', 
      data,
      cluster: true,
      clusterMaxZoom: 12, // Max zoom to cluster points on (lower = less clustering)
      clusterRadius: 25, // Radius of each cluster when clustering points
      promoteId: 'id' // Use the 'id' property for feature-state
    } as any);

    const pinImageIdWhite = 'pin-white';
    const pinImageIdPurple = 'pin-purple';

    const addLayers = () => {
      // Add cluster pulse/glow layer (behind the main cluster circle)
      (map.current as any).addLayer({
        id: 'cluster-pulse',
        type: 'circle',
        source: sourceId,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step',
            ['get', 'point_count'],
            'hsl(250, 100%, 65%)', // Blue for small clusters
            10,
            'hsl(270, 100%, 60%)', // Purple for medium clusters
            25,
            'hsl(290, 100%, 55%)'  // Darker purple for large clusters
          ],
          'circle-radius': [
            'step',
            ['get', 'point_count'],
            28,  // Small clusters pulse
            10,
            42,  // Medium clusters pulse
            25,
            56   // Large clusters pulse
          ],
          'circle-opacity': 0.4,
          'circle-blur': 0.5
        }
      } as any);

      // Add cluster circle layer
      (map.current as any).addLayer({
        id: 'clusters',
        type: 'circle',
        source: sourceId,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step',
            ['get', 'point_count'],
            'hsl(250, 100%, 65%)', // Blue for small clusters
            10,
            'hsl(270, 100%, 60%)', // Purple for medium clusters
            25,
            'hsl(290, 100%, 55%)'  // Darker purple for large clusters
          ],
          'circle-radius': [
            'step',
            ['get', 'point_count'],
            20,  // Small clusters
            10,
            30,  // Medium clusters
            25,
            40   // Large clusters
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff'
        }
      } as any);
      
      // Animate the pulse layer
      let pulseDirection = 1;
      let pulseRadius = 0;
      
      const animatePulse = () => {
        if (!map.current || !map.current.getLayer('cluster-pulse')) return;
        
        pulseRadius += 0.02 * pulseDirection;
        if (pulseRadius >= 1) pulseDirection = -1;
        if (pulseRadius <= 0) pulseDirection = 1;
        
        const opacityValue = 0.15 + (0.25 * (1 - pulseRadius));
        const radiusMultiplier = 1 + (0.2 * pulseRadius);
        
        map.current.setPaintProperty('cluster-pulse', 'circle-opacity', opacityValue);
        map.current.setPaintProperty('cluster-pulse', 'circle-radius', [
          'step',
          ['get', 'point_count'],
          28 * radiusMultiplier,  // Small
          10,
          42 * radiusMultiplier,  // Medium
          25,
          56 * radiusMultiplier   // Large
        ]);
        
        requestAnimationFrame(animatePulse);
      };
      
      animatePulse();

      // Add cluster count label
      (map.current as any).addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: sourceId,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 14
        },
        paint: {
          'text-color': '#ffffff'
        }
      } as any);

      // Add highlight circle layer (shows on hover) - BEFORE the pin layer
      (map.current as any).addLayer({
        id: 'spots-highlight',
        type: 'circle',
        source: sourceId,
        filter: ['!', ['has', 'point_count']],
        paint: {
          // Hover-only subtle glow (no glow for selected - we use ring instead)
          'circle-radius': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            0, // No filled glow for selected
            ['boolean', ['feature-state', 'hover'], false],
            14, // Subtle glow for hover
            0
          ],
          'circle-color': 'hsl(250, 100%, 70%)', // Parkzy purple for hover
          'circle-opacity': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            0.2,
            0
          ],
          'circle-translate': [0, -20] // Offset to align with pin head
        }
      } as any);

      // Add unclustered point layer - WHITE pins (default/unselected)
      // Show at full opacity when not selected, hide when selected
      (map.current as any).addLayer({
        id: circleId,
        type: 'symbol',
        source: sourceId,
        filter: ['!', ['has', 'point_count']],
        layout: {
          'icon-image': pinImageIdWhite,
          'icon-size': 1.5,
          'icon-allow-overlap': true,
          'icon-anchor': 'bottom'
        },
        paint: {
          'icon-opacity': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            0, // Hide white pin when selected
            0.95
          ],
          'icon-translate': [0, -30] // Start offset for bounce animation
        }
      } as any);

      // Add unclustered point layer - PURPLE pins (selected only)
      // Show only when selected
      (map.current as any).addLayer({
        id: 'spots-circles-selected',
        type: 'symbol',
        source: sourceId,
        filter: ['!', ['has', 'point_count']],
        layout: {
          'icon-image': pinImageIdPurple,
          'icon-size': 1.5,
          'icon-allow-overlap': true,
          'icon-anchor': 'bottom'
        },
        paint: {
          'icon-opacity': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            0.95, // Show purple pin when selected
            0
          ],
          'icon-translate': [0, -30] // Start offset for bounce animation
        }
      } as any);
      
      // Bounce animation for pins when they first appear
      let bounceFrame: number;
      let bounceProgress = 0;
      const bounceDuration = 400; // ms
      const bounceStartTime = Date.now();
      
      const animateBounce = () => {
        if (!map.current) return;
        
        const elapsed = Date.now() - bounceStartTime;
        bounceProgress = Math.min(elapsed / bounceDuration, 1);
        
        // Easing function with overshoot for bounce effect
        // Using elastic-out-like easing
        const easeOutBounce = (t: number) => {
          const c4 = (2 * Math.PI) / 3;
          return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
        };
        
        const easedProgress = easeOutBounce(bounceProgress);
        const translateY = -30 * (1 - easedProgress); // Animate from -30 to 0
        
        try {
          (map.current as any).setPaintProperty(circleId, 'icon-translate', [0, translateY]);
          (map.current as any).setPaintProperty('spots-circles-selected', 'icon-translate', [0, translateY]);
        } catch (e) {
          // Layers might not exist
        }
        
        if (bounceProgress < 1) {
          bounceFrame = requestAnimationFrame(animateBounce);
        }
      };
      
      animateBounce();

      // Price text centered inside the pin head (unclustered only)
      // Pin is 54px tall, circle center at y=18, icon-anchor is bottom
      // Text offset in ems from the anchor point (bottom of pin)
      (map.current as any).addLayer({
        id: labelId,
        type: 'symbol',
        source: sourceId,
        filter: ['!', ['has', 'point_count']],
        layout: {
          'text-field': ['get', 'price'],
          'text-size': 11,
          'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'],
          'text-allow-overlap': true,
          'text-anchor': 'center',
          'text-offset': [0, -2.4] // Offset to center in the circle (18px from bottom = ~2.4em at 11px font)
        },
        paint: {
          'text-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            '#6B4EFF', // Parkzy purple text for selected
            '#374151' // Dark gray text for unselected
          ],
          'text-halo-color': '#ffffff',
          'text-halo-width': 0.5,
          'text-opacity': 1
        }
      } as any);

      // Track hover state for smooth animations
      let hoveredSpotId: string | null = null;

      // Handle cluster clicks - smooth zoom animation to expand
      (map.current as any).on('click', 'clusters', (e: any) => {
        const features = (map.current as any).queryRenderedFeatures(e.point, {
          layers: ['clusters']
        });
        const clusterId = features[0].properties.cluster_id;
        (map.current as any).getSource(sourceId).getClusterExpansionZoom(
          clusterId,
          (err: any, zoom: number) => {
            if (err) return;
            (map.current as any).flyTo({
              center: features[0].geometry.coordinates,
              zoom: zoom,
              duration: 800,
              essential: true,
              curve: 1.2,
              easing: (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
            });
          }
        );
      });

      // Handle unclustered point clicks - show spot details
      const onClick = (e: any) => {
        const f = e.features?.[0];
        console.log('[MapView] Pin clicked:', { 
          featureId: f?.properties?.id, 
          featureTitle: f?.properties?.title,
          hasFeature: !!f 
        });
        
        if (!f) {
          console.warn('[MapView] No feature found on click');
          return;
        }
        
        // Use spotsRef.current to get the most recent spots array
        const spot = spotsRef.current.find((s) => s.id === f.properties.id);
        console.log('[MapView] Spot lookup result:', { 
          spotId: f.properties.id, 
          foundSpot: !!spot,
          spotTitle: spot?.title,
          totalSpotsInRef: spotsRef.current.length
        });
        
        if (spot) {
          console.log('[MapView] Setting selected spot:', spot.id);
          setUserSelectedSpot(true); // Mark that user manually selected a spot
          setSelectedSpot(spot);
          // Notify parent of selection
          onSpotSelect?.(spot.id);
          // Scroll carousel to this spot
          scrollToSpot(spot.id);
          
          // Center map on the clicked spot without zooming in too much
          if (map.current) {
            isCarouselNavigationRef.current = true;
            skipNextMapMoveRef.current = true;

            // Keep guard through the map's next idle so we don't refetch and shrink results.
            map.current.once('idle', () => {
              requestAnimationFrame(() => {
                isCarouselNavigationRef.current = false;
              });
            });

            map.current.flyTo({
              center: [spot.lng, spot.lat],
              zoom: Math.min(map.current.getZoom(), 13), // Keep zoomed out for context
              duration: 500
            });
          }
        } else {
          console.error('[MapView] Spot not found in spots array for ID:', f.properties.id);
        }
      };
      (map.current as any).on('click', circleId, onClick);
      (map.current as any).on('click', 'spots-circles-selected', onClick);
      (map.current as any).on('click', labelId, onClick);

      // Change cursor on hover for clusters
      (map.current as any).on('mouseenter', 'clusters', () => {
        (map.current as any).getCanvas().style.cursor = 'pointer';
      });
      (map.current as any).on('mouseleave', 'clusters', () => {
        (map.current as any).getCanvas().style.cursor = '';
      });

      // Change cursor and notify on hover for spots (white pins)
      (map.current as any).on('mouseenter', circleId, (e: any) => {
        (map.current as any).getCanvas().style.cursor = 'pointer';
        const f = e.features?.[0];
        if (f?.properties?.id) {
          onSpotHover?.(f.properties.id);
        }
      });
      (map.current as any).on('mouseleave', circleId, () => {
        (map.current as any).getCanvas().style.cursor = '';
        onSpotHover?.(null);
      });

      // Change cursor and notify on hover for spots (purple selected pins)
      (map.current as any).on('mouseenter', 'spots-circles-selected', (e: any) => {
        (map.current as any).getCanvas().style.cursor = 'pointer';
        const f = e.features?.[0];
        if (f?.properties?.id) {
          onSpotHover?.(f.properties.id);
        }
      });
      (map.current as any).on('mouseleave', 'spots-circles-selected', () => {
        (map.current as any).getCanvas().style.cursor = '';
        onSpotHover?.(null);
      });

      (map.current as any).on('mouseenter', labelId, (e: any) => {
        (map.current as any).getCanvas().style.cursor = 'pointer';
        const f = e.features?.[0];
        if (f?.properties?.id) {
          onSpotHover?.(f.properties.id);
        }
      });
      (map.current as any).on('mouseleave', labelId, () => {
        (map.current as any).getCanvas().style.cursor = '';
        onSpotHover?.(null);
      });

      // Trigger visible spots count update after rendering
      setTimeout(() => {
        const bounds = (map.current as any).getBounds();
        const visibleSpots = spots.filter(spot => {
          const lat = Number(spot.lat);
          const lng = Number(spot.lng);
          return bounds.contains([lng, lat]);
        });
        onVisibleSpotsChange?.(visibleSpots.length);
      }, 100);

      console.log('Rendered', features.length, 'spot pins via layers');
    };

    // Ensure both pin images are available, then add layers
    const hasWhite = (map.current as any).hasImage?.(pinImageIdWhite);
    const hasPurple = (map.current as any).hasImage?.(pinImageIdPurple);
    
    if (!hasWhite || !hasPurple) {
      let loadedCount = 0;
      const checkAndAddLayers = () => {
        loadedCount++;
        if (loadedCount >= 2) {
          addLayers();
        }
      };
      
      // White pin (default for unselected) - clean modern design
      if (!hasWhite) {
        const whiteSvg = `
          <svg width="44" height="54" viewBox="0 0 44 54" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <filter id="shadow-w" x="-20%" y="-10%" width="140%" height="130%">
                <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="#000" flood-opacity="0.12"/>
              </filter>
            </defs>
            <path d="M22 52 C22 52 40 32 40 18 C40 8.059 31.941 0 22 0 C12.059 0 4 8.059 4 18 C4 32 22 52 22 52Z" 
                  fill="white" filter="url(#shadow-w)"/>
            <circle cx="22" cy="18" r="13" fill="white" stroke="#E5E7EB" stroke-width="1"/>
          </svg>`;
        const whiteUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(whiteSvg);
        const whiteImg = new Image(44, 54);
        whiteImg.onload = () => {
          try {
            (map.current as any).addImage(pinImageIdWhite, whiteImg, { pixelRatio: 2 });
          } catch (e) {
            console.warn('addImage error (white pin may already exist):', e);
          }
          checkAndAddLayers();
        };
        whiteImg.src = whiteUrl;
      } else {
        checkAndAddLayers();
      }
      
      // Purple pin (for selected) - clean modern design
      if (!hasPurple) {
        const purpleSvg = `
          <svg width="44" height="54" viewBox="0 0 44 54" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <filter id="shadow-p" x="-20%" y="-10%" width="140%" height="130%">
                <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#6B4EFF" flood-opacity="0.3"/>
              </filter>
            </defs>
            <path d="M22 52 C22 52 40 32 40 18 C40 8.059 31.941 0 22 0 C12.059 0 4 8.059 4 18 C4 32 22 52 22 52Z" 
                  fill="#6B4EFF" filter="url(#shadow-p)"/>
            <circle cx="22" cy="18" r="13" fill="white"/>
          </svg>`;
        const purpleUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(purpleSvg);
        const purpleImg = new Image(44, 54);
        purpleImg.onload = () => {
          try {
            (map.current as any).addImage(pinImageIdPurple, purpleImg, { pixelRatio: 2 });
          } catch (e) {
            console.warn('addImage error (purple pin may already exist):', e);
          }
          checkAndAddLayers();
        };
        purpleImg.src = purpleUrl;
      } else {
        checkAndAddLayers();
      }
    } else {
      addLayers();
    }
  }, [spots, mapReady, onSpotHover]);

  // Update feature-state when highlightedSpotId changes (from list hover)
  const prevHighlightedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!map.current || !mapReady) return;
    
    const sourceId = 'spots-source';
    const source = map.current.getSource(sourceId);
    if (!source) return;

    // Remove highlight from previous spot
    if (prevHighlightedRef.current) {
      map.current.setFeatureState(
        { source: sourceId, id: prevHighlightedRef.current },
        { hover: false }
      );
    }

    // Add highlight to new spot
    if (highlightedSpotId) {
      map.current.setFeatureState(
        { source: sourceId, id: highlightedSpotId },
        { hover: true }
      );
    }

    prevHighlightedRef.current = highlightedSpotId || null;
  }, [highlightedSpotId, mapReady]);

  // Update feature-state when propSelectedSpotId OR internal selectedSpot changes
  const prevSelectedRef = useRef<string | null>(null);
  
  // Determine the effective selected spot ID (prioritize internal selection from carousel)
  const effectiveSelectedId = selectedSpot?.id || propSelectedSpotId || null;
  
  useEffect(() => {
    if (!map.current || !mapReady) return;
    
    const sourceId = 'spots-source';
    const source = map.current.getSource(sourceId);
    if (!source) return;

    // Remove selected state from previous spot
    if (prevSelectedRef.current && prevSelectedRef.current !== effectiveSelectedId) {
      map.current.setFeatureState(
        { source: sourceId, id: prevSelectedRef.current },
        { selected: false }
      );
    }

    // Add selected state to new spot
    if (effectiveSelectedId) {
      map.current.setFeatureState(
        { source: sourceId, id: effectiveSelectedId },
        { selected: true }
      );
    }

    prevSelectedRef.current = effectiveSelectedId;
  }, [effectiveSelectedId, mapReady]);

  const handleSpotClick = (spot: Spot) => {
    setSelectedSpot(spot);
  };

  if (isLoading) {
    return (
      <div className="relative w-full h-full flex items-center justify-center bg-muted">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-sm text-muted-foreground">Loading map...</p>
        </div>
      </div>
    );
  }

  if (!mapboxToken) {
    return (
      <div className="relative w-full h-full flex items-center justify-center bg-muted">
        <div className="text-center p-4">
          <p className="text-sm text-muted-foreground mb-2">Map not available</p>
          <p className="text-xs text-muted-foreground">Please configure Mapbox token</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {/* Map Container */}
      <div 
        ref={mapContainer} 
        className="absolute inset-0"
      />

      {/* Swipeable Spot Cards Carousel - Hidden on desktop split view */}
      {sortedSpots.length > 0 && !hideCarousel && (
        <div className="absolute bottom-[calc(4rem+env(safe-area-inset-bottom)+32px)] md:bottom-4 left-0 right-0 z-10">
          {/* Navigation arrows and counter - only show if more than 1 spot */}
          {sortedSpots.length > 1 && (
            <div className="flex items-center justify-between px-4 mb-2">
              <button
                onClick={scrollPrev}
                disabled={currentSlideIndex === 0}
                className="p-2 rounded-full bg-background/90 backdrop-blur-sm shadow-md disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="text-sm font-medium bg-background/90 backdrop-blur-sm px-3 py-1 rounded-full shadow-md">
                {Math.min(currentSlideIndex + 1, sortedSpots.length)} / {sortedSpots.length}
              </span>
              <button
                onClick={scrollNext}
                disabled={currentSlideIndex === sortedSpots.length - 1}
                className="p-2 rounded-full bg-background/90 backdrop-blur-sm shadow-md disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          )}

          {/* Carousel */}
          <div ref={emblaRef} className="overflow-hidden px-4">
            <div className="flex gap-3">
              {sortedSpots.map((spot, index) => {
                const isCurrentSlide = index === currentSlideIndex;
                const isAnimating = index === animatingSlideIndex;
                return (
                <div 
                  key={spot.id} 
                  className="flex-[0_0_100%] min-w-0"
                >
                  <Card className={`p-4 bg-background/95 backdrop-blur-sm transition-all duration-200 ${
                    isAnimating ? 'animate-selection-pulse' : ''
                  }`}>
                    <div className="flex gap-3 cursor-pointer" onClick={() => navigate(buildSpotUrl(spot.id))}>
                      <div className="w-20 h-20 rounded-lg bg-muted flex-shrink-0 relative">
                        <img 
                          src={spot.imageUrl || "/placeholder.svg"}
                          alt="Parking spot"
                          className="w-full h-full object-cover rounded-lg"
                        />
                        {/* Favorite Heart Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(spot.id);
                          }}
                          disabled={isFavoriteLoading}
                          className="absolute top-1 right-1 p-1 rounded-full bg-background/80 backdrop-blur-sm hover:bg-background transition-colors shadow-sm"
                          aria-label={isFavorite(spot.id) ? "Remove from favorites" : "Add to favorites"}
                        >
                          <Heart
                            className={cn(
                              "h-3.5 w-3.5 transition-colors",
                              isFavorite(spot.id)
                                ? "fill-red-500 text-red-500"
                                : "text-muted-foreground hover:text-red-500"
                            )}
                          />
                        </button>
                      </div>
                      
                      <div className="flex-1 space-y-2 min-w-0">
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex-1 flex flex-wrap gap-1 min-h-[22px]">
                            {spot.category && (
                              <Badge variant="secondary" className="text-xs px-2 py-0.5">
                                {spot.category}
                              </Badge>
                            )}
                            {spot.userBooking && (
                              <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 text-xs px-2 py-0.5">
                                Your Booking
                              </Badge>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0">
                            {spot.hasEvCharging && (spot.evChargingPremium ?? 0) > 0 ? (
                              // Spot has EV charging: show base rate + charging add-on option
                              <>
                                <p className="font-bold text-primary text-lg">${spot.hourlyRate.toFixed(2)}/hr</p>
                                <p className="text-xs text-green-600 flex items-center justify-end gap-0.5">
                                  <Zap className="h-3 w-3" />
                                  +${(spot.evChargingPremium ?? 0).toFixed(2)} charging
                                </p>
                              </>
                            ) : (
                              <p className="font-bold text-primary text-lg">${spot.hourlyRate.toFixed(2)}/hr</p>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-start gap-1 text-sm text-muted-foreground">
                          <MapPin className="h-3 w-3 flex-shrink-0 mt-0.5" />
                          <span className="leading-tight line-clamp-1">{spot.address}</span>
                        </div>
                        
                        {searchCenter && (
                          <div className="flex items-center gap-4 text-base">
                            <div className="flex items-center gap-1">
                              <MapPin className="h-4 w-4 text-primary" />
                              <span className="font-semibold text-foreground">{calculateDistance(searchCenter.lat, searchCenter.lng, spot.lat, spot.lng).toFixed(1)} mi</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Footprints className="h-4 w-4 text-primary" />
                              <span className="font-semibold text-foreground">{calculateWalkTime(calculateDistance(searchCenter.lat, searchCenter.lng, spot.lat, spot.lng))} min walk</span>
                            </div>
                          </div>
                        )}
                        
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1">
                              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                              <span className="font-medium text-sm">{spot.rating || 'New'}</span>
                              <span className="text-muted-foreground text-sm">({spot.reviews || 0})</span>
                            </div>
                            {spot.hasEvCharging && spot.evChargerType && (
                              <EVChargerBadge chargerType={spot.evChargerType} size="sm" />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex gap-3 mt-4">
                      <Button 
                        variant="outline" 
                        className="flex-1 text-sm"
                        onClick={() => navigate(buildSpotUrl(spot.id))}
                      >
                        View Details
                      </Button>
                      {user && spot.hostId === user.id ? (
                        <Button 
                          className="flex-1 text-sm"
                          onClick={() => {
                            if (mode !== 'host') {
                              setMode('host');
                            }
                            navigate(`/edit-spot/${spot.id}`);
                          }}
                        >
                          <Pencil className="h-4 w-4 mr-1" />
                          Edit Spot
                        </Button>
                      ) : spot.userBooking ? (
                        <Button 
                          className="flex-1 text-sm"
                          variant="secondary"
                          onClick={() => navigate(`/booking/${spot.userBooking!.id}`)}
                        >
                          View Booking
                        </Button>
                      ) : (
                        <Button 
                          className="flex-1 text-sm"
                          onClick={() => navigate(buildBookingUrl(spot.id))}
                        >
                          <Navigation className="h-4 w-4 mr-1" />
                          Book Now
                        </Button>
                      )}
                    </div>
                  </Card>
                </div>
              );
              })}

            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MapView;