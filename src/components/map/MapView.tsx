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

    console.log('Adding markers for spots:', spots);

    // Clear existing markers
    markers.current.forEach(marker => marker.remove());
    markers.current = [];

    const bounds = new mapboxgl.LngLatBounds();

    spots.forEach((spot) => {
      console.log('Creating marker for spot:', spot.title, 'at', spot.lat, spot.lng);
      
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
            background-color: hsl(var(--primary, 222 47% 11%));
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            border: 3px solid hsl(var(--background, 0 0% 100%));
            position: relative;
          ">
            <div style="
              color: hsl(var(--primary-foreground, 210 40% 98%));
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
            border-top: 12px solid hsl(var(--primary, 222 47% 11%));
            filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
          "></div>
        </div>
      `;

      // Create marker with bottom anchor for pin
      const marker = new mapboxgl.Marker({ element: markerElement, anchor: 'bottom' })
        .setLngLat([Number(spot.lng), Number(spot.lat)])
        .addTo(map.current!);

      // Extend bounds
      bounds.extend([Number(spot.lng), Number(spot.lat)]);

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