import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Star, MapPin, Navigation, PersonStanding } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

interface Spot {
  id: string;
  title: string;
  address: string;
  hourlyRate: number;
  lat: number;
  lng: number;
  rating?: number;
  reviews?: number;
  imageUrl?: string;
}

interface MapViewProps {
  spots: Spot[];
  searchCenter?: { lat: number; lng: number };
  currentLocation?: { lat: number; lng: number };
  onVisibleSpotsChange?: (count: number) => void;
  onMapMove?: (center: { lat: number; lng: number }, radiusMeters: number) => void;
  exploreParams?: {
    lat?: string;
    lng?: string;
    start?: string;
    end?: string;
    q?: string;
  };
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

const MapView = ({ spots, searchCenter, currentLocation, onVisibleSpotsChange, onMapMove, exploreParams }: MapViewProps) => {
  const navigate = useNavigate();
  
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
  const searchMarker = useRef<mapboxgl.Marker | null>(null);
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);

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
      style: 'mapbox://styles/mapbox/navigation-guidance-night-v4', 
      center: center,
      zoom: 14 // Start at neighborhood zoom level
    });

    // Don't add navigation controls to avoid overlap with search bar

    // Mark map as ready when loaded
    map.current.on('load', () => {
      setMapReady(true);
      
      // Customize water color to deep blue
      if (map.current?.getLayer('water')) {
        map.current.setPaintProperty('water', 'fill-color', '#004e89');
      }

      // Add user location source and layers
      if (map.current && !map.current.getSource('user-location')) {
        map.current.addSource('user-location', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: []
          }
        });

        // Outer pulsing ring
        map.current.addLayer({
          id: 'user-location-outer',
          type: 'circle',
          source: 'user-location',
          paint: {
            'circle-radius': 16,
            'circle-color': 'hsl(217, 91%, 60%)',
            'circle-opacity': 0.3,
            'circle-stroke-width': 2,
            'circle-stroke-color': 'white',
            'circle-stroke-opacity': 0.8
          }
        });

        // Inner solid dot
        map.current.addLayer({
          id: 'user-location-inner',
          type: 'circle',
          source: 'user-location',
          paint: {
            'circle-radius': 8,
            'circle-color': 'hsl(217, 91%, 60%)',
            'circle-opacity': 1,
            'circle-stroke-width': 2,
            'circle-stroke-color': 'white'
          }
        });
      }
    });

    // Also add user location layers on style.load (in case style changes)
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
            'circle-radius': 16,
            'circle-color': 'hsl(217, 91%, 60%)',
            'circle-opacity': 0.3,
            'circle-stroke-width': 2,
            'circle-stroke-color': 'white',
            'circle-stroke-opacity': 0.8
          }
        });

        map.current.addLayer({
          id: 'user-location-inner',
          type: 'circle',
          source: 'user-location',
          paint: {
            'circle-radius': 8,
            'circle-color': 'hsl(217, 91%, 60%)',
            'circle-opacity': 1,
            'circle-stroke-width': 2,
            'circle-stroke-color': 'white'
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

    map.current.on('moveend', updateVisibleSpots);
    map.current.on('zoomend', updateVisibleSpots);
    
    // Initial update after map loads
    map.current.on('idle', () => {
      updateVisibleSpots();
    });
  }, [mapboxToken]);

  // Move map when search center changes
  useEffect(() => {
    if (!map.current || !mapReady || !searchCenter) return;
    
    // Remove existing search marker if any
    if (searchMarker.current) {
      searchMarker.current.remove();
    }

    // Create a custom element for the search marker
    const el = document.createElement('div');
    el.className = 'search-location-marker';
    el.style.width = '40px';
    el.style.height = '40px';
    
    // Create the marker HTML
    el.innerHTML = `
      <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
        <circle cx="20" cy="20" r="18" fill="hsl(250, 100%, 65%)" stroke="white" stroke-width="3" opacity="0.9"/>
        <circle cx="20" cy="20" r="8" fill="white"/>
        <circle cx="20" cy="20" r="4" fill="hsl(250, 100%, 65%)"/>
      </svg>
    `;

    // Add pulsing animation
    const style = document.createElement('style');
    if (!document.getElementById('marker-pulse-style')) {
      style.id = 'marker-pulse-style';
      style.textContent = `
        @keyframes marker-pulse {
          0%, 100% { 
            opacity: 1; 
            transform: scale(1); 
          }
          50% { 
            opacity: 0.8; 
            transform: scale(1.15); 
          }
        }
        .search-location-marker {
          animation: marker-pulse 2s ease-in-out infinite;
        }
      `;
      document.head.appendChild(style);
    }

    // Fly to the new search center location first
    map.current.flyTo({
      center: [searchCenter.lng, searchCenter.lat],
      zoom: 14,
      essential: true,
      duration: 1500
    });

    // Add marker after map finishes moving (more reliable than timeout)
    const addMarkerAfterMove = () => {
      if (map.current && searchCenter) {
        searchMarker.current = new mapboxgl.Marker({
          element: el,
          anchor: 'center'
        })
          .setLngLat([searchCenter.lng, searchCenter.lat])
          .addTo(map.current);
        
        console.log('Search marker added at:', searchCenter.lat, searchCenter.lng);
      }
      // Remove listener after adding marker
      map.current?.off('moveend', addMarkerAfterMove);
    };
    
    map.current.once('moveend', addMarkerAfterMove);

    // Cleanup function
    return () => {
      if (searchMarker.current) {
        searchMarker.current.remove();
        searchMarker.current = null;
      }
    };
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

    // Update the user-location source with the new coordinates
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
      console.log('Current location updated at:', lat, lng);
    }
  }, [currentLocation, mapReady]);

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
      clusterMaxZoom: 16, // Max zoom to cluster points on
      clusterRadius: 50 // Radius of each cluster when clustering points
    } as any);

    const pinImageId = 'pin-blue';

    const addLayers = () => {
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
          'text-halo-width': 0.5
        }
      } as any);

      // Handle cluster clicks - zoom in
      (map.current as any).on('click', 'clusters', (e: any) => {
        const features = (map.current as any).queryRenderedFeatures(e.point, {
          layers: ['clusters']
        });
        const clusterId = features[0].properties.cluster_id;
        (map.current as any).getSource(sourceId).getClusterExpansionZoom(
          clusterId,
          (err: any, zoom: number) => {
            if (err) return;
            (map.current as any).easeTo({
              center: features[0].geometry.coordinates,
              zoom: zoom
            });
          }
        );
      });

      // Handle unclustered point clicks - show spot details
      const onClick = (e: any) => {
        const f = e.features?.[0];
        if (!f) return;
        const spot = spots.find((s) => s.id === f.properties.id);
        if (spot) setSelectedSpot(spot);
      };
      (map.current as any).on('click', circleId, onClick);
      (map.current as any).on('click', labelId, onClick);

      // Change cursor on hover
      (map.current as any).on('mouseenter', 'clusters', () => {
        (map.current as any).getCanvas().style.cursor = 'pointer';
      });
      (map.current as any).on('mouseleave', 'clusters', () => {
        (map.current as any).getCanvas().style.cursor = '';
      });
      (map.current as any).on('mouseenter', circleId, () => {
        (map.current as any).getCanvas().style.cursor = 'pointer';
      });
      (map.current as any).on('mouseleave', circleId, () => {
        (map.current as any).getCanvas().style.cursor = '';
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

    // Ensure the pin image is available, then add layers
    if (!(map.current as any).hasImage?.(pinImageId)) {
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
          (map.current as any).addImage(pinImageId, img, { pixelRatio: 2 });
        } catch (e) {
          console.warn('addImage error (may already exist):', e);
        }
        addLayers();
      };
      img.src = url;
    } else {
      addLayers();
    }
  }, [spots, mapReady]);

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

      {/* Selected Spot Details Card */}
      {selectedSpot && (
        <div className="absolute bottom-24 md:bottom-4 left-4 right-4 z-10">
          <Card className="p-4 bg-background/95 backdrop-blur-sm">
            <div className="flex gap-3">
              <div className="w-20 h-20 rounded-lg bg-muted flex-shrink-0">
                <img 
                  src={selectedSpot.imageUrl || "/placeholder.svg"}
                  alt={selectedSpot.title}
                  className="w-full h-full object-cover rounded-lg"
                />
              </div>
              
              <div className="flex-1 space-y-2 min-w-0">
                <div className="flex justify-between items-start gap-2">
                  <h3 className="font-semibold text-base leading-tight">{selectedSpot.title}</h3>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-primary text-lg">${selectedSpot.hourlyRate}/hr</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-1 text-sm text-muted-foreground">
                  <MapPin className="h-3 w-3 flex-shrink-0 mt-0.5" />
                  <span className="leading-tight">{selectedSpot.address}</span>
                </div>
                
                {searchCenter && (
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{calculateDistance(searchCenter.lat, searchCenter.lng, selectedSpot.lat, selectedSpot.lng).toFixed(1)} mi</span>
                    <PersonStanding className="h-3 w-3" />
                    <span>{calculateWalkTime(calculateDistance(searchCenter.lat, searchCenter.lng, selectedSpot.lat, selectedSpot.lng))} min walk</span>
                  </div>
                )}
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    <span className="font-medium text-sm">{selectedSpot.rating || 'New'}</span>
                    <span className="text-muted-foreground text-sm">({selectedSpot.reviews || 0})</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex gap-3 mt-4">
              <Button 
                variant="outline" 
                className="flex-1 text-sm"
                onClick={() => navigate(buildSpotUrl(selectedSpot.id))}
              >
                View Details
              </Button>
              <Button 
                className="flex-1 text-sm"
                onClick={() => navigate(buildBookingUrl(selectedSpot.id))}
              >
                <Navigation className="h-4 w-4 mr-1" />
                Book Now
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default MapView;