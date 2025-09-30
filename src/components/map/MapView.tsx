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

    // Clear existing markers
    markers.current.forEach(marker => marker.remove());
    markers.current = [];

    spots.forEach((spot) => {
      const rawLat = Number(spot.lat);
      const rawLng = Number(spot.lng);

      const withinLat = (v: number) => v >= -90 && v <= 90;
      const withinLng = (v: number) => v >= -180 && v <= 180;

      let lat = rawLat;
      let lng = rawLng;

      if (!withinLat(lat) || !withinLng(lng)) {
        if (withinLat(rawLng) && withinLng(rawLat)) {
          lat = rawLng;
          lng = rawLat;
        } else {
          console.warn('Invalid coordinates for spot, skipping:', spot.title, { rawLat, rawLng });
          return;
        }
      }

      // Create custom pin marker with teardrop shape
      const markerElement = document.createElement('div');
      markerElement.className = 'relative cursor-pointer';
      markerElement.style.width = '50px';
      markerElement.style.height = '60px';
      markerElement.innerHTML = `
        <svg width="50" height="60" viewBox="0 0 50 60" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.3));">
          <!-- Teardrop pin shape -->
          <path d="M 25 2 C 15 2 7 10 7 20 C 7 30 25 58 25 58 C 25 58 43 30 43 20 C 43 10 35 2 25 2 Z" 
                fill="hsl(222, 47%, 47%)" 
                stroke="white" 
                stroke-width="2.5"/>
          <!-- Price circle inside pin -->
          <circle cx="25" cy="20" r="13" fill="white" opacity="0.95"/>
          <!-- Price text -->
          <text x="25" y="25" 
                text-anchor="middle" 
                fill="hsl(222, 47%, 47%)" 
                font-size="11" 
                font-weight="700" 
                font-family="system-ui, -apple-system, sans-serif">$${spot.hourlyRate}</text>
        </svg>
      `;

      // Create marker with bottom-center anchor for pin tip
      const marker = new mapboxgl.Marker({ 
        element: markerElement, 
        anchor: 'bottom' 
      })
        .setLngLat([lng, lat])
        .addTo(map.current!);

      // Add click handler
      markerElement.addEventListener('click', () => {
        setSelectedSpot(spot);
      });

      markers.current.push(marker);
    });

    // Trigger visible spots count update after rendering
    if (map.current) {
      setTimeout(() => {
        const bounds = map.current!.getBounds();
        const visibleSpots = spots.filter(spot => {
          const lat = Number(spot.lat);
          const lng = Number(spot.lng);
          return bounds.contains([lng, lat]);
        });
        onVisibleSpotsChange?.(visibleSpots.length);
      }, 100);
    }

    console.log('Added', markers.current.length, 'pin markers to map');
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