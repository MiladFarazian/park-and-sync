import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Star, MapPin, Navigation, Footprints, Pencil, ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useMode } from '@/contexts/ModeContext';
import { useAuth } from '@/contexts/AuthContext';
import useEmblaCarousel from 'embla-carousel-react';

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
        map.current.flyTo({
          center: [sortedSpots[index].lng, sortedSpots[index].lat],
          zoom: Math.min(map.current.getZoom(), 13), // Zoom out to 13 max for better context
          duration: 500
        });
        // Reset flag after animation completes
        map.current.once('moveend', () => {
          isCarouselNavigationRef.current = false;
        });
      }
    }
  }, [emblaApi, sortedSpots]);

  // Reset carousel index when spots array changes and index is out of bounds
  useEffect(() => {
    if (!emblaApi || !sortedSpots.length) return;
    
    // If current index is out of bounds, reset to 0
    if (currentSlideIndex >= sortedSpots.length) {
      setCurrentSlideIndex(0);
      emblaApi.scrollTo(0);
      if (sortedSpots[0]) {
        setSelectedSpot(sortedSpots[0]);
      }
    }
  }, [sortedSpots.length, emblaApi, currentSlideIndex]);

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

        // Load destination pin image (purple pin)
        const destPinSvg = `
          <svg width="50" height="60" viewBox="0 0 50 60" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <filter id="shadow-dest" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.4)" />
              </filter>
            </defs>
            <g filter="url(#shadow-dest)">
              <path d="M 25 2 C 15 2 7 10 7 20 C 7 30 25 58 25 58 C 25 58 43 30 43 20 C 43 10 35 2 25 2 Z" 
                    fill="#f0edfe" stroke="#694dff" stroke-width="3"/>
              <circle cx="25" cy="20" r="8" fill="#694dff" opacity="1"/>
            </g>
          </svg>`;
        const destPinUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(destPinSvg);
        const destImg = new Image(50, 60);
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
          <svg width="50" height="60" viewBox="0 0 50 60" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <filter id="shadow-dest-alt" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.4)" />
              </filter>
            </defs>
            <g filter="url(#shadow-dest-alt)">
              <path d="M 25 2 C 15 2 7 10 7 20 C 7 30 25 58 25 58 C 25 58 43 30 43 20 C 43 10 35 2 25 2 Z" 
                    fill="#f0edfe" stroke="#694dff" stroke-width="3"/>
              <circle cx="25" cy="20" r="8" fill="#694dff" opacity="1"/>
            </g>
          </svg>`;
        const destPinUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(destPinSvg);
        const destImg = new Image(50, 60);
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
      
      // Add selected spot pulse animation layer (replaces ring)
      (map.current as any).addLayer({
        id: 'spots-selected-pulse',
        type: 'circle',
        source: sourceId,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            20,
            0
          ],
          'circle-color': 'hsl(250, 100%, 65%)', // Parkzy purple
          'circle-opacity': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            0.3,
            0
          ],
          'circle-translate': [0, -20]
        }
      } as any);
      
      // Start pulse animation for selected spots (stops after 3 seconds)
      let selectedPulseFrame: number;
      let selectedPulseDirection = 1;
      let selectedPulseRadius = 16;
      const selectedMinRadius = 14;
      const selectedMaxRadius = 22;
      const selectedPulseSpeed = 0.15;
      let pulseStartTime = Date.now();
      const pulseDuration = 3000; // 3 seconds
      
      const animateSelectedPulse = () => {
        if (!map.current) return;
        
        // Stop animation after 3 seconds
        if (Date.now() - pulseStartTime > pulseDuration) {
          // Set final static state
          try {
            (map.current as any).setPaintProperty('spots-selected-pulse', 'circle-radius', [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              16,
              0
            ]);
            (map.current as any).setPaintProperty('spots-selected-pulse', 'circle-opacity', [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              0.25,
              0
            ]);
          } catch (e) {}
          return; // Stop the animation loop
        }
        
        selectedPulseRadius += selectedPulseDirection * selectedPulseSpeed;
        if (selectedPulseRadius >= selectedMaxRadius) {
          selectedPulseDirection = -1;
        } else if (selectedPulseRadius <= selectedMinRadius) {
          selectedPulseDirection = 1;
        }
        
        try {
          (map.current as any).setPaintProperty('spots-selected-pulse', 'circle-radius', [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            selectedPulseRadius,
            0
          ]);
          
          // Fade opacity as it expands
          const opacityRange = (selectedPulseRadius - selectedMinRadius) / (selectedMaxRadius - selectedMinRadius);
          const opacity = 0.35 - (opacityRange * 0.2);
          (map.current as any).setPaintProperty('spots-selected-pulse', 'circle-opacity', [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            opacity,
            0
          ]);
        } catch (e) {
          // Layer might not exist yet
        }
        
        selectedPulseFrame = requestAnimationFrame(animateSelectedPulse);
      };
      
      animateSelectedPulse();
      
      // Restart pulse animation when selection changes
      const restartPulse = () => {
        pulseStartTime = Date.now();
        selectedPulseRadius = 16;
        selectedPulseDirection = 1;
        cancelAnimationFrame(selectedPulseFrame);
        animateSelectedPulse();
      };

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
          ]
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
          ]
        }
      } as any);

      // Price text centered inside the pin head (unclustered only)
      (map.current as any).addLayer({
        id: labelId,
        type: 'symbol',
        source: sourceId,
        filter: ['!', ['has', 'point_count']],
        layout: {
          'text-field': ['get', 'price'],
          'text-size': 11,
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-allow-overlap': true,
          'text-offset': [0, -2.8]
        },
        paint: {
          'text-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            'hsl(250, 60%, 45%)', // Darker purple text for selected
            '#666666' // Dark gray text for unselected (on white pin)
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
      
      // White pin (default for unselected)
      if (!hasWhite) {
        const whiteSvg = `
          <svg width="50" height="60" viewBox="0 0 50 60" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <filter id="shadow-white" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.35)" />
              </filter>
            </defs>
            <g filter="url(#shadow-white)">
              <path d="M 25 2 C 15 2 7 10 7 20 C 7 30 25 58 25 58 C 25 58 43 30 43 20 C 43 10 35 2 25 2 Z" 
                    fill="white" stroke="#e0e0e0" stroke-width="2"/>
              <circle cx="25" cy="20" r="13" fill="#f5f5f5" opacity="0.95"/>
            </g>
          </svg>`;
        const whiteUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(whiteSvg);
        const whiteImg = new Image(50, 60);
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
      
      // Purple pin (for selected)
      if (!hasPurple) {
        const purpleSvg = `
          <svg width="50" height="60" viewBox="0 0 50 60" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <filter id="shadow-purple" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.35)" />
              </filter>
            </defs>
            <g filter="url(#shadow-purple)">
              <path d="M 25 2 C 15 2 7 10 7 20 C 7 30 25 58 25 58 C 25 58 43 30 43 20 C 43 10 35 2 25 2 Z" 
                    fill="hsl(250, 100%, 65%)" stroke="white" stroke-width="2.5"/>
              <circle cx="25" cy="20" r="13" fill="white" opacity="0.95"/>
            </g>
          </svg>`;
        const purpleUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(purpleSvg);
        const purpleImg = new Image(50, 60);
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
        <div className="absolute bottom-[calc(5rem+env(safe-area-inset-bottom)+1rem)] md:bottom-4 left-0 right-0 z-10">
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
                    <div className="flex gap-3">
                      <div className="w-20 h-20 rounded-lg bg-muted flex-shrink-0">
                        <img 
                          src={spot.imageUrl || "/placeholder.svg"}
                          alt="Parking spot"
                          className="w-full h-full object-cover rounded-lg"
                        />
                      </div>
                      
                      <div className="flex-1 space-y-2 min-w-0">
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex-1 flex flex-wrap gap-1">
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
                            {index === 0 && !spot.userBooking && (
                              <Badge className="bg-primary/10 text-primary border-primary/20 text-xs px-2 py-0.5">
                                Nearest
                              </Badge>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="font-bold text-primary text-lg">${spot.hourlyRate}/hr</p>
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
                          <div className="flex items-center gap-1">
                            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                            <span className="font-medium text-sm">{spot.rating || 'New'}</span>
                            <span className="text-muted-foreground text-sm">({spot.reviews || 0})</span>
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