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
  onSpotHover?: (spotId: string | null) => void;
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

const MapView = ({ spots, searchCenter, currentLocation, onVisibleSpotsChange, onMapMove, searchQuery, exploreParams, highlightedSpotId, onSpotHover, hideCarousel }: MapViewProps) => {
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
  const spotLayersInitializedRef = useRef(false); // Track if spot layers/handlers are set up
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [nearestSpotId, setNearestSpotId] = useState<string | null>(null);
  const [userSelectedSpot, setUserSelectedSpot] = useState(false);
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [sortedSpots, setSortedSpots] = useState<Spot[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  
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
    if (sortedSpots[index]) {
      setSelectedSpot(sortedSpots[index]);
      setUserSelectedSpot(true);
      
      // Pan map to selected spot
      if (map.current) {
        map.current.flyTo({
          center: [sortedSpots[index].lng, sortedSpots[index].lat],
          zoom: Math.max(map.current.getZoom(), 14),
          duration: 500
        });
      }
    }
  }, [emblaApi, sortedSpots]);

  // Set up embla event listeners
  useEffect(() => {
    if (!emblaApi) return;
    
    emblaApi.on('select', onSelect);
    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi, onSelect]);

  // Scroll carousel to spot when marker is clicked
  const scrollToSpot = useCallback((spotId: string) => {
    if (!emblaApi || !sortedSpots.length) return;
    const index = sortedSpots.findIndex(s => s.id === spotId);
    if (index !== -1) {
      emblaApi.scrollTo(index);
    }
  }, [emblaApi, sortedSpots]);

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

    // Debounced version for zoom events (fires during zooming)
    let zoomTimeout: NodeJS.Timeout | null = null;
    const debouncedUpdateOnZoom = () => {
      if (zoomTimeout) clearTimeout(zoomTimeout);
      zoomTimeout = setTimeout(updateVisibleSpots, 150);
    };

    map.current.on('moveend', updateVisibleSpots);
    map.current.on('zoomend', updateVisibleSpots);
    map.current.on('zoom', debouncedUpdateOnZoom); // Fire during zooming for faster feedback
    
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
    const pinImageId = 'pin-blue';
    
    // Helper function to ensure pin image exists
    const ensurePinImage = (callback: () => void) => {
      if (!map.current) return;
      
      if (map.current.hasImage(pinImageId)) {
        callback();
        return;
      }
      
      const svg = `
        <svg width="50" height="60" viewBox="0 0 50 60" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.35)" />
            </filter>
          </defs>
          <g filter="url(#shadow)">
            <path d="M 25 2 C 15 2 7 10 7 20 C 7 30 25 58 25 58 C 25 58 43 30 43 20 C 43 10 35 2 25 2 Z" 
                  fill="hsl(250, 100%, 65%)" stroke="white" stroke-width="2.5"/>
            <circle cx="25" cy="20" r="13" fill="white" opacity="0.95"/>
          </g>
        </svg>`;
      const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      const img = new Image(50, 60);
      img.onload = () => {
        try {
          if (map.current && !map.current.hasImage(pinImageId)) {
            map.current.addImage(pinImageId, img, { pixelRatio: 2 });
          }
          callback();
        } catch (e) {
          console.warn('addImage error:', e);
          callback(); // Still try to proceed
        }
      };
      img.onerror = () => {
        console.error('Failed to load pin image');
        callback(); // Proceed anyway
      };
      img.src = url;
    };
    
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
    const layersExist = (map.current as any).getLayer(circleId);
    
    if (existingSource && layersExist) {
      // Just update the data instead of removing and re-adding everything
      existingSource.setData(data);
      // Still ensure the pin image exists (may have been cleared on style change)
      ensurePinImage(() => {
        // Layers already exist, just need to make sure image is available
        console.log('Updated spots data,', features.length, 'spots');
      });
      return; // Exit early, layers already exist
    }
    
    // If source exists but layers don't (e.g., after style change), remove and recreate
    if (existingSource && !layersExist) {
      try {
        (map.current as any).removeSource(sourceId);
      } catch (e) {
        console.warn('Could not remove old source:', e);
      }
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

    // pinImageId already defined above

    const addLayers = () => {
      const layersExist = (map.current as any).getLayer('cluster-pulse');
      
      // Only add layers if they don't exist yet
      if (!layersExist) {
      
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
          'circle-radius': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            22,
            0
          ],
          'circle-color': 'hsl(250, 100%, 65%)',
          'circle-opacity': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            0.25,
            0
          ],
          'circle-translate': [0, -20] // Offset to align with pin head
        }
      } as any);

      // Add unclustered point layer (individual pins)
      (map.current as any).addLayer({
        id: circleId,
        type: 'symbol',
        source: sourceId,
        filter: ['!', ['has', 'point_count']],
        layout: {
          'icon-image': pinImageId,
          'icon-size': 1.5,
          'icon-allow-overlap': true,
          'icon-anchor': 'bottom'
        },
        paint: {
          'icon-opacity': 0.95
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
          'text-color': 'hsl(250, 100%, 65%)',
          'text-halo-color': '#ffffff',
          'text-halo-width': 0.5,
          'text-opacity': 1
        }
      } as any);
      } // End of if (!layersExist)

      // Track hover state for smooth animations
      let hoveredSpotId: string | null = null;

      // Only add event handlers once
      if (!spotLayersInitializedRef.current) {
        spotLayersInitializedRef.current = true;
        
        // Handle cluster clicks - smooth zoom animation to expand
        (map.current as any).on('click', 'clusters', (e: any) => {
          const features = (map.current as any).queryRenderedFeatures(e.point, {
            layers: ['clusters']
          });
          if (!features?.length) return;
          const clusterId = features[0].properties.cluster_id;
          const source = (map.current as any).getSource(sourceId);
          if (!source) return;
          source.getClusterExpansionZoom(
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
            // Scroll carousel to this spot
            scrollToSpot(spot.id);
          } else {
            console.error('[MapView] Spot not found in spots array for ID:', f.properties.id);
          }
        };
        (map.current as any).on('click', circleId, onClick);
        (map.current as any).on('click', labelId, onClick);

        // Change cursor on hover for clusters
        (map.current as any).on('mouseenter', 'clusters', () => {
          if (map.current) (map.current as any).getCanvas().style.cursor = 'pointer';
        });
        (map.current as any).on('mouseleave', 'clusters', () => {
          if (map.current) (map.current as any).getCanvas().style.cursor = '';
        });

        // Track if hovering over any spot layer to prevent cursor flickering
        let isOverSpot = false;

        // Change cursor and notify on hover for spots (both layers)
        const handleSpotEnter = (e: any) => {
          isOverSpot = true;
          if (map.current) (map.current as any).getCanvas().style.cursor = 'pointer';
          const f = e.features?.[0];
          if (f?.properties?.id) {
            onSpotHover?.(f.properties.id);
          }
        };
        
        const handleSpotLeave = () => {
          // Use a small delay to prevent flickering between overlapping layers
          setTimeout(() => {
            if (!isOverSpot && map.current) {
              (map.current as any).getCanvas().style.cursor = '';
              onSpotHover?.(null);
            }
          }, 10);
          isOverSpot = false;
        };

        (map.current as any).on('mouseenter', circleId, handleSpotEnter);
        (map.current as any).on('mouseleave', circleId, handleSpotLeave);
        (map.current as any).on('mouseenter', labelId, handleSpotEnter);
        (map.current as any).on('mouseleave', labelId, handleSpotLeave);
      }

      // Trigger visible spots count update after rendering
      setTimeout(() => {
        if (!map.current) return;
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

    // Ensure the pin image is available, then add layers
    ensurePinImage(() => {
      addLayers();
    });
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
          {/* Navigation arrows and counter */}
          <div className="flex items-center justify-between px-4 mb-2">
            <button
              onClick={scrollPrev}
              disabled={currentSlideIndex === 0}
              className="p-2 rounded-full bg-background/90 backdrop-blur-sm shadow-md disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="text-sm font-medium bg-background/90 backdrop-blur-sm px-3 py-1 rounded-full shadow-md">
              {currentSlideIndex + 1} / {sortedSpots.length}
            </span>
            <button
              onClick={scrollNext}
              disabled={currentSlideIndex === sortedSpots.length - 1}
              className="p-2 rounded-full bg-background/90 backdrop-blur-sm shadow-md disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {/* Carousel */}
          <div ref={emblaRef} className="overflow-hidden px-4">
            <div className="flex gap-3">
              {sortedSpots.map((spot, index) => (
                <div 
                  key={spot.id} 
                  className="flex-[0_0_100%] min-w-0"
                >
                  <Card className="p-4 bg-background/95 backdrop-blur-sm">
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
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span>{calculateDistance(searchCenter.lat, searchCenter.lng, spot.lat, spot.lng).toFixed(1)} mi</span>
                            <Footprints className="h-3 w-3" />
                            <span>{calculateWalkTime(calculateDistance(searchCenter.lat, searchCenter.lng, spot.lat, spot.lng))} min walk</span>
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
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MapView;