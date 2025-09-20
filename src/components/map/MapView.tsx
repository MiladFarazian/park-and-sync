import React, { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Star, MapPin, Navigation } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';

interface Spot {
  id: number;
  title: string;
  address: string;
  hourlyRate: number;
  rating: number;
  reviews: number;
  lat: number;
  lng: number;
  amenities?: string[];
  distance?: string;
  walkTime?: string;
}

interface MapViewProps {
  spots: Spot[];
}

const MapView = ({ spots }: MapViewProps) => {
  const navigate = useNavigate();
  const mapContainer = useRef<HTMLDivElement>(null);
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);

  // Mock map implementation - in a real app, you'd use Mapbox GL JS here
  useEffect(() => {
    if (!mapContainer.current) return;
    
    // This would be your actual Mapbox initialization
    // For now, we'll just show a styled map placeholder
  }, []);

  const handleSpotClick = (spot: Spot) => {
    setSelectedSpot(spot);
  };

  return (
    <div className="relative w-full h-full">
      {/* Map Container */}
      <div 
        ref={mapContainer} 
        className="absolute inset-0 bg-gradient-to-br from-blue-100 to-green-100"
        style={{
          backgroundImage: `
            linear-gradient(45deg, #f0f9ff 25%, transparent 25%),
            linear-gradient(-45deg, #f0f9ff 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #f0f9ff 75%),
            linear-gradient(-45deg, transparent 75%, #f0f9ff 75%)
          `,
          backgroundSize: '20px 20px',
          backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
        }}
      />
      
      {/* Parking Spot Markers */}
      {spots.map((spot) => {
        const x = 20 + (spot.id * 180); // Mock positioning
        const y = 100 + (spot.id * 120);
        
        return (
          <div
            key={spot.id}
            className="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer"
            style={{ left: `${x}px`, top: `${y}px` }}
            onClick={() => handleSpotClick(spot)}
          >
            {/* Price Marker */}
            <div className="relative">
              <div className="bg-primary text-primary-foreground px-3 py-1 rounded-full shadow-lg font-semibold text-sm whitespace-nowrap">
                ${spot.hourlyRate}/hr
              </div>
              <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-primary"></div>
            </div>
            
            {/* Car Icon */}
            <div className="absolute top-8 left-1/2 transform -translate-x-1/2">
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center shadow-lg">
                <div className="w-4 h-3 bg-primary-foreground rounded-sm"></div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Selected Spot Details Card */}
      {selectedSpot && (
        <div className="absolute bottom-4 left-4 right-4">
          <Card className="p-4 bg-background/95 backdrop-blur-sm">
            <div className="flex gap-3">
              <div className="w-16 h-16 rounded-lg bg-muted flex-shrink-0">
                <img 
                  src="/placeholder.svg" 
                  alt={selectedSpot.title}
                  className="w-full h-full object-cover rounded-lg"
                />
              </div>
              
              <div className="flex-1 space-y-1">
                <div className="flex justify-between items-start">
                  <h3 className="font-semibold">{selectedSpot.title}</h3>
                  <div className="text-right">
                    <p className="font-bold text-primary">${selectedSpot.hourlyRate}/hr</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  <span className="truncate">{selectedSpot.address}</span>
                </div>
                
                {selectedSpot.distance && (
                  <p className="text-sm text-muted-foreground">{selectedSpot.distance} • {selectedSpot.walkTime}</p>
                )}
                
                <div className="flex items-center gap-1">
                  <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                  <span className="font-medium text-sm">{selectedSpot.rating}</span>
                  <span className="text-muted-foreground text-sm">({selectedSpot.reviews})</span>
                </div>

                {selectedSpot.amenities && (
                  <div className="flex gap-1 flex-wrap">
                    {selectedSpot.amenities.slice(0, 3).map((amenity, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {amenity}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex gap-2 mt-4">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => navigate(`/spot/${selectedSpot.id}`)}
              >
                View Details
              </Button>
              <Button 
                className="flex-1"
                onClick={() => navigate(`/book/${selectedSpot.id}`)}
              >
                <Navigation className="h-4 w-4 mr-2" />
                Book Now
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Map Controls */}
      <div className="absolute bottom-6 right-6 flex flex-col gap-2">
        <Button variant="outline" size="sm" className="w-10 h-10 p-0">
          <Navigation className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" className="w-10 h-10 p-0">
          <MapPin className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default MapView;