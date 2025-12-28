import React from 'react';
import { Star, MapPin, Footprints, Umbrella, Zap, Shield, Car, X, BoltIcon, Clock, Accessibility } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
  distance?: string;
  amenities?: string[];
  hostId?: string;
  sizeConstraints?: string[];
  userBooking?: UserBooking | null;
  instantBook?: boolean;
}

export interface SpotFilters {
  covered: boolean;
  evCharging: boolean;
  secure: boolean;
  adaAccessible: boolean;
  vehicleSize: string | null;
}

interface DesktopSpotListProps {
  spots: Spot[];
  searchCenter: { lat: number; lng: number };
  selectedSpotId?: string;
  hoveredSpotId?: string | null;
  onSpotHover?: (spotId: string | null) => void;
  onSpotClick?: (spotId: string) => void;
  sortBy: string;
  onSortChange: (value: string) => void;
  filters: SpotFilters;
  onFiltersChange: (filters: SpotFilters) => void;
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

const vehicleSizes = [
  { value: 'compact', label: 'Compact' },
  { value: 'midsize', label: 'Midsize' },
  { value: 'suv', label: 'SUV' },
  { value: 'truck', label: 'Truck' },
];

const DesktopSpotList = ({
  spots,
  searchCenter,
  selectedSpotId,
  hoveredSpotId,
  onSpotHover,
  onSpotClick,
  sortBy,
  onSortChange,
  filters,
  onFiltersChange,
  exploreParams,
}: DesktopSpotListProps) => {
  const navigate = useNavigate();

  const toggleFilter = (key: keyof Omit<SpotFilters, 'vehicleSize'>) => {
    onFiltersChange({ ...filters, [key]: !filters[key] });
  };

  const setVehicleSize = (size: string | null) => {
    onFiltersChange({ ...filters, vehicleSize: size });
  };

  const activeFilterCount = [
    filters.covered,
    filters.evCharging,
    filters.secure,
    filters.adaAccessible,
    filters.vehicleSize !== null,
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    onFiltersChange({
      covered: false,
      evCharging: false,
      secure: false,
      adaAccessible: false,
      vehicleSize: null,
    });
  };

  // Filter spots based on selected filters
  const filteredSpots = spots.filter((spot) => {
    if (filters.covered && !spot.amenities?.includes('Covered')) return false;
    if (filters.evCharging && !spot.amenities?.includes('EV Charging')) return false;
    if (filters.secure && !spot.amenities?.includes('Secure')) return false;
    if (filters.adaAccessible && !spot.amenities?.includes('ADA Accessible')) return false;
    if (filters.vehicleSize && spot.sizeConstraints && !spot.sizeConstraints.includes(filters.vehicleSize)) return false;
    return true;
  });

  // Sort spots based on selected option
  const sortedSpots = [...filteredSpots].sort((a, b) => {
    const distA = calculateDistance(searchCenter.lat, searchCenter.lng, a.lat, a.lng);
    const distB = calculateDistance(searchCenter.lat, searchCenter.lng, b.lat, b.lng);
    
    switch (sortBy) {
      case 'distance':
        return distA - distB;
      case 'price-low':
        return a.hourlyRate - b.hourlyRate;
      case 'price-high':
        return b.hourlyRate - a.hourlyRate;
      case 'rating':
        return (b.rating || 0) - (a.rating || 0);
      default:
        return distA - distB;
    }
  });

  const handleViewDetails = (spotId: string) => {
    const params = new URLSearchParams();
    if (exploreParams?.lat) params.set('lat', exploreParams.lat);
    if (exploreParams?.lng) params.set('lng', exploreParams.lng);
    if (exploreParams?.start) params.set('start', exploreParams.start);
    if (exploreParams?.end) params.set('end', exploreParams.end);
    if (exploreParams?.q) params.set('q', exploreParams.q);
    navigate(`/spot/${spotId}?${params.toString()}`);
  };

  const handleBookNow = (spotId: string) => {
    const params = new URLSearchParams();
    if (exploreParams?.start) params.set('start', exploreParams.start);
    if (exploreParams?.end) params.set('end', exploreParams.end);
    navigate(`/book/${spotId}?${params.toString()}`);
  };

  return (
    <div className="h-full flex flex-col bg-background border-r">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {filteredSpots.length} spot{filteredSpots.length !== 1 ? 's' : ''} found
            {activeFilterCount > 0 && filteredSpots.length !== spots.length && (
              <span className="text-muted-foreground/70"> (filtered from {spots.length})</span>
            )}
          </p>
          <Select value={sortBy} onValueChange={onSortChange}>
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="distance">Distance</SelectItem>
              <SelectItem value="price-low">Price: Low to High</SelectItem>
              <SelectItem value="price-high">Price: High to Low</SelectItem>
              <SelectItem value="rating">Top Rated</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Filter Chips */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => toggleFilter('covered')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filters.covered
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80 text-foreground'
            }`}
          >
            <Umbrella className="h-3.5 w-3.5" />
            Covered
          </button>
          <button
            onClick={() => toggleFilter('evCharging')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filters.evCharging
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80 text-foreground'
            }`}
          >
            <Zap className="h-3.5 w-3.5" />
            EV Charging
          </button>
          <button
            onClick={() => toggleFilter('secure')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filters.secure
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80 text-foreground'
            }`}
          >
            <Shield className="h-3.5 w-3.5" />
            Secure
          </button>
          <button
            onClick={() => toggleFilter('adaAccessible')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filters.adaAccessible
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80 text-foreground'
            }`}
          >
            <Accessibility className="h-3.5 w-3.5" />
            ADA Accessible
          </button>
          
          {/* Vehicle Size Dropdown */}
          <Select
            value={filters.vehicleSize || 'any'}
            onValueChange={(value) => setVehicleSize(value === 'any' ? null : value)}
          >
            <SelectTrigger 
              className={`h-8 w-auto gap-1.5 rounded-full border-0 ${
                filters.vehicleSize
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-muted hover:bg-muted/80'
              }`}
            >
              <Car className="h-3.5 w-3.5" />
              <SelectValue placeholder="Vehicle Size" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any Size</SelectItem>
              {vehicleSizes.map((size) => (
                <SelectItem key={size.value} value={size.value}>
                  {size.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Clear Filters */}
          {activeFilterCount > 0 && (
            <button
              onClick={clearAllFilters}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Spot List */}
      <div className="flex-1 overflow-y-auto">
        {sortedSpots.length === 0 ? (
          <div className="flex items-center justify-center h-full p-8 text-center">
            <div>
              <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No parking spots found in this area</p>
              <p className="text-sm text-muted-foreground mt-1">Try adjusting your search location</p>
            </div>
          </div>
        ) : (
          <div className="divide-y">
            {sortedSpots.map((spot, index) => {
              const distance = calculateDistance(searchCenter.lat, searchCenter.lng, spot.lat, spot.lng);
              const walkTime = calculateWalkTime(distance);
              const isSelected = selectedSpotId === spot.id;
              const isHovered = hoveredSpotId === spot.id;
              const isNearest = index === 0 && sortBy === 'distance';

              return (
                <div
                  key={spot.id}
                  className={`p-4 cursor-pointer transition-all duration-200 ${
                    isSelected 
                      ? 'bg-primary/10 border-l-4 border-l-primary ring-1 ring-primary/20 shadow-sm' 
                      : ''
                  } ${
                    isHovered && !isSelected 
                      ? 'bg-muted/70 scale-[1.01]' 
                      : !isSelected ? 'hover:bg-muted/50' : ''
                  }`}
                  onMouseEnter={() => onSpotHover?.(spot.id)}
                  onMouseLeave={() => onSpotHover?.(null)}
                  onClick={() => onSpotClick?.(spot.id)}
                >
                  <div className="flex gap-4">
                    {/* Image */}
                    <div className="w-24 h-24 rounded-lg bg-muted flex-shrink-0 overflow-hidden">
                      {spot.imageUrl ? (
                        <img
                          src={spot.imageUrl}
                          alt={spot.category || spot.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                          <MapPin className="h-8 w-8" />
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-sm truncate">
                            {spot.category || spot.title}
                          </h3>
                          {spot.instantBook !== false ? (
                            <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                              <BoltIcon className="h-3 w-3 mr-0.5" />
                              Instant
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                              <Clock className="h-3 w-3 mr-0.5" />
                              Confirmation
                            </Badge>
                          )}
                          {spot.userBooking && (
                            <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                              Your Booking
                            </Badge>
                          )}
                          {isNearest && !spot.userBooking && (
                            <Badge variant="secondary" className="text-xs bg-primary/10 text-primary">
                              Nearest
                            </Badge>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-bold text-lg">${spot.hourlyRate.toFixed(2)}</p>
                          <p className="text-xs text-muted-foreground">per hour</p>
                        </div>
                      </div>

                      {/* Rating */}
                      {spot.rating !== undefined && spot.rating > 0 && (
                        <div className="flex items-center gap-1 mb-1">
                          <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                          <span className="text-sm font-medium">{spot.rating.toFixed(1)}</span>
                          {spot.reviews !== undefined && (
                            <span className="text-sm text-muted-foreground">({spot.reviews})</span>
                          )}
                        </div>
                      )}

                      {/* Distance */}
                      <div className="flex items-center gap-3 text-sm text-muted-foreground mb-2">
                        <span className="flex items-center gap-1">
                          <Footprints className="h-3.5 w-3.5" />
                          {walkTime} min walk
                        </span>
                        <span>({distance.toFixed(1)} mi)</span>
                      </div>

                      {/* Amenities */}
                      {spot.amenities && spot.amenities.length > 0 && (
                        <div className="flex gap-1.5 flex-wrap mb-3">
                          {spot.amenities.slice(0, 3).map((amenity, i) => (
                            <Badge key={i} variant="outline" className="text-xs px-2 py-0">
                              {amenity}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewDetails(spot.id);
                          }}
                        >
                          Details
                        </Button>
                        {spot.userBooking ? (
                          <Button
                            size="sm"
                            className="flex-1"
                            variant="secondary"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/booking/${spot.userBooking!.id}`);
                            }}
                          >
                            View Booking
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className="flex-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleBookNow(spot.id);
                            }}
                          >
                            Book Now
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default DesktopSpotList;
