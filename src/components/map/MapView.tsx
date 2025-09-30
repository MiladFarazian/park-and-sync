import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Star, MapPin, Navigation } from 'lucide-react';
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
  onVisibleSpotsChange?: (count: number) => void;
}

const MapView = ({ spots, searchCenter, onVisibleSpotsChange }: MapViewProps) => {
  const navigate = useNavigate();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
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
      style: 'mapbox://styles/mapbox/streets-v12', 
      center: center,
      zoom: 14 // Start at neighborhood zoom level
    });

    // Add navigation controls
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    // Mark map as ready when loaded
    map.current.on('load', () => {
      setMapReady(true);
    });

    // Update visible spots count when map moves
    const updateVisibleSpots = () => {
      if (!map.current || !spots.length) return;
      
      const bounds = map.current.getBounds();
      const visibleSpots = spots.filter(spot => {
        const lat = Number(spot.lat);
        const lng = Number(spot.lng);
        return bounds.contains([lng, lat]);
      });
      
      onVisibleSpotsChange?.(visibleSpots.length);
    };

    map.current.on('moveend', updateVisibleSpots);
    map.current.on('zoomend', updateVisibleSpots);
    
    // Initial update after map loads
    map.current.on('idle', () => {
      updateVisibleSpots();
    });
  }, [mapboxToken, spots, onVisibleSpotsChange]);

  // Add markers for spots
  useEffect(() => {
    if (!map.current || !spots.length || !mapReady) return;

    // Clear existing HTML markers
    markers.current.forEach(marker => marker.remove());
    markers.current = [];

    // Remove old layers if they exist
    const sourceId = 'spots-source';
    const circleId = 'spots-circles';
    const shadowId = 'spots-circles-shadow';
    const labelId = 'spots-labels';

    if (map.current.getLayer(labelId)) map.current.removeLayer(labelId);
    if (map.current.getLayer(circleId)) map.current.removeLayer(circleId);
    if (map.current.getLayer(shadowId)) map.current.removeLayer(shadowId);
    if (map.current.getSource(sourceId)) map.current.removeSource(sourceId);

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

    (map.current as any).addSource(sourceId, { type: 'geojson', data } as any);

    const pinImageId = 'pin-blue';

    const addLayers = () => {
      // Symbol layer for the pin image (anchor at tip)
      (map.current as any).addLayer({
        id: circleId,
        type: 'symbol',
        source: sourceId,
        layout: {
          'icon-image': pinImageId,
          'icon-size': 1.5,
          'icon-allow-overlap': true,
          'icon-anchor': 'bottom'
        }
      } as any);

      // Price text centered inside the pin head
      (map.current as any).addLayer({
        id: labelId,
        type: 'symbol',
        source: sourceId,
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

      const onClick = (e: any) => {
        const f = e.features?.[0];
        if (!f) return;
        const spot = spots.find((s) => s.id === f.properties.id);
        if (spot) setSelectedSpot(spot);
      };
      (map.current as any).on('click', circleId, onClick);
      (map.current as any).on('click', labelId, onClick);

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
        <div className="absolute bottom-4 left-4 right-4 z-10">
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
                onClick={() => navigate(`/spot/${selectedSpot.id}`)}
              >
                View Details
              </Button>
              <Button 
                className="flex-1 text-sm"
                onClick={() => navigate(`/book/${selectedSpot.id}`)}
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