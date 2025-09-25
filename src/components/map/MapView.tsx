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
}

const MapView = ({ spots }: MapViewProps) => {
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

    // Calculate center point for all of LA
    const laCenter: [number, number] = [-118.2437, 34.0522]; // Central LA coordinates
    
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12', 
      center: laCenter,
      zoom: 10
    });

    // Add navigation controls
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    // Mark map as ready when loaded
    map.current.on('load', () => {
      setMapReady(true);
    });
  }, [mapboxToken, spots]);

  // Add markers for spots
  useEffect(() => {
    if (!map.current || !spots.length || !mapReady) return;

    // Render spots using Mapbox layers (stable on zoom)
    const sourceId = 'spots-source';
    const circleId = 'spots-circles';
    const labelId = 'spots-labels';

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

    if (map.current.getSource(sourceId)) {
      (map.current.getSource(sourceId) as any).setData(data);
    } else {
      map.current.addSource(sourceId, { type: 'geojson', data } as any);
      map.current.addLayer({
        id: circleId,
        type: 'circle',
        source: sourceId,
        paint: {
          'circle-radius': 14,
          'circle-color': '#1f2937',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      } as any);
      map.current.addLayer({
        id: labelId,
        type: 'symbol',
        source: sourceId,
        layout: {
          'text-field': ['get', 'price'],
          'text-size': 11,
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'text-allow-overlap': true,
        },
        paint: { 'text-color': '#ffffff' },
      } as any);

      const onClick = (e: any) => {
        const f = e.features?.[0];
        if (!f) return;
        const spot = spots.find((s) => s.id === f.properties.id);
        if (spot) setSelectedSpot(spot);
      };
      map.current.on('click', circleId, onClick);
      map.current.on('click', labelId, onClick);
    }

    // Fit bounds to all features
    const layerBounds = new mapboxgl.LngLatBounds();
    (features as any).forEach((f: any) => layerBounds.extend(f.geometry.coordinates as [number, number]));
    if (!layerBounds.isEmpty()) {
      map.current.fitBounds(layerBounds, { padding: 80, maxZoom: 13, duration: 400 });
    }

    console.log('Rendered spots via layers:', (features as any).length);
    return;

    // Clear existing markers
    markers.current.forEach(marker => marker.remove());
    markers.current = [];

    const bounds = new mapboxgl.LngLatBounds();

    spots.forEach((spot) => {
      console.log('Creating marker for spot:', spot.title, 'at lat:', spot.lat, 'lng:', spot.lng);
      
      // Validate and normalize coordinates
      const rawLat = Number(spot.lat);
      const rawLng = Number(spot.lng);

      const withinLat = (v: number) => v >= -90 && v <= 90;
      const withinLng = (v: number) => v >= -180 && v <= 180;

      let lat = rawLat;
      let lng = rawLng;

      if (!withinLat(lat) || !withinLng(lng)) {
        // Try swapping if developer data came in [lng, lat]
        if (withinLat(rawLng) && withinLng(rawLat)) {
          console.warn('Swapped lat/lng for spot due to invalid order:', spot.title, { rawLat, rawLng });
          lat = rawLng;
          lng = rawLat;
        } else {
          console.error('Invalid coordinates for spot, skipping:', spot.title, { rawLat, rawLng });
          return;
        }
      }

      // Extra sanity check for LA area (optional)
      const inLABox = lat > 33 && lat < 35 && lng > -119.8 && lng < -116.5;
      if (!inLABox) {
        console.warn('Spot outside expected LA bounds:', spot.title, { lat, lng });
      }
      
      // Create custom marker element
      const markerElement = document.createElement('div');
      markerElement.className = 'relative cursor-pointer';
      markerElement.innerHTML = `
        <div style="
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <div style="
            width: 40px;
            height: 40px;
            background-color: #1f2937;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            border: 3px solid white;
            position: relative;
          ">
            <div style="
              color: white;
              font-weight: 700;
              font-size: 11px;
            ">$${spot.hourlyRate}</div>
          </div>
          <div style="
            position: absolute;
            top: 32px;
            left: 50%;
            transform: translateX(-50%);
            width: 0;
            height: 0;
            border-left: 8px solid transparent;
            border-right: 8px solid transparent;
            border-top: 12px solid #1f2937;
            filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
          "></div>
        </div>
      `;

      // Create marker with bottom anchor for pin - ensure correct order [lng, lat]
      const marker = new mapboxgl.Marker({ element: markerElement, anchor: 'bottom' })
        .setLngLat([lng, lat])
        .addTo(map.current!);

      console.log('Marker added at:', [lng, lat]);

      // Extend bounds
      bounds.extend([lng, lat]);

      // Add click handler
      markerElement.addEventListener('click', () => {
        setSelectedSpot(spot);
      });

      markers.current.push(marker);
    });

    // Fit map to markers
    if (!bounds.isEmpty()) {
      map.current.fitBounds(bounds, { padding: 80, maxZoom: 13, duration: 500 });
    }

    // Debug: draw a small circle layer at each spot to verify positions
    const geojson = {
      type: 'FeatureCollection',
      features: spots
        .map((spot) => {
          const lat = Number(spot.lat);
          const lng = Number(spot.lng);
          if (isNaN(lat) || isNaN(lng)) return null;
          return {
            type: 'Feature',
            properties: { id: spot.id },
            geometry: { type: 'Point', coordinates: [lng, lat] },
          };
        })
        .filter(Boolean) as any[],
    } as any;

    const srcId = 'spots-debug';
    const layerId = 'spots-debug-layer';
    if (map.current.getSource(srcId)) {
      (map.current.getSource(srcId) as any).setData(geojson);
    } else {
      map.current.addSource(srcId, { type: 'geojson', data: geojson } as any);
      map.current.addLayer({
        id: layerId,
        type: 'circle',
        source: srcId,
        paint: {
          'circle-radius': 5,
          'circle-color': '#ef4444',
          'circle-stroke-width': 1,
          'circle-stroke-color': '#ffffff',
        },
      } as any);
    }

    console.log('Added', markers.current.length, 'markers to map');
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