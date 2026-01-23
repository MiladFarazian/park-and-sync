import React from 'react';
import { Umbrella, Zap, Shield, Accessibility, Car, X, SlidersHorizontal, Check, Camera, Clock, Lightbulb, BoltIcon, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SpotFilters } from './DesktopSpotList';
import { evChargerTypes } from '@/lib/evChargerTypes';
import { vehicleSizes } from '@/lib/vehicleSizes';
import { cn } from '@/lib/utils';

interface MobileFilterSheetProps {
  filters: SpotFilters;
  onFiltersChange: (filters: SpotFilters) => void;
  totalSpots: number;
  filteredCount: number;
}

// Use the imported vehicleSizes from lib

const MobileFilterSheet = ({
  filters,
  onFiltersChange,
  totalSpots,
  filteredCount,
}: MobileFilterSheetProps) => {
  const [open, setOpen] = React.useState(false);

  const toggleFilter = (key: keyof Omit<SpotFilters, 'vehicleSize' | 'evChargerTypes'>) => {
    const newFilters = { ...filters, [key]: !filters[key] };
    // If turning off EV charging, clear charger types
    if (key === 'evCharging' && filters.evCharging) {
      newFilters.evChargerTypes = [];
    }
    onFiltersChange(newFilters);
  };

  const toggleChargerType = (chargerTypeId: string) => {
    const currentTypes = filters.evChargerTypes || [];
    const newTypes = currentTypes.includes(chargerTypeId)
      ? currentTypes.filter(t => t !== chargerTypeId)
      : [...currentTypes, chargerTypeId];
    onFiltersChange({ ...filters, evChargerTypes: newTypes });
  };

  const setVehicleSize = (size: string | null) => {
    onFiltersChange({ ...filters, vehicleSize: size });
  };

  const activeFilterCount = [
    filters.covered,
    filters.securityCamera,
    filters.twentyFourSevenAccess,
    filters.evCharging,
    filters.easyAccess,
    filters.wellLit,
    filters.adaAccessible,
    filters.instantBook,
    filters.vehicleSize !== null,
    (filters.evChargerTypes?.length || 0) > 0,
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    onFiltersChange({
      covered: false,
      securityCamera: false,
      twentyFourSevenAccess: false,
      evCharging: false,
      evChargerTypes: [],
      easyAccess: false,
      wellLit: false,
      adaAccessible: false,
      instantBook: false,
      vehicleSize: null,
    });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button 
          type="button"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background/95 backdrop-blur-sm shadow-lg active:bg-accent/50 transition-colors touch-scroll-safe"
        >
          <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Filters</span>
          {activeFilterCount > 0 && (
            <Badge 
              variant="secondary" 
              className="h-4 w-4 p-0 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px]"
            >
              {activeFilterCount}
            </Badge>
          )}
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-2xl h-auto max-h-[85vh] overflow-y-auto">
        <SheetHeader className="pb-2">
          <SheetTitle>Filter Spots</SheetTitle>
          <p className="text-sm text-muted-foreground text-left">
            {filteredCount} of {totalSpots} spot{totalSpots !== 1 ? 's' : ''} match your filters
          </p>
        </SheetHeader>

        {activeFilterCount > 0 && (
          <div className="pb-4">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={clearAllFilters}
              className="text-muted-foreground"
            >
              <X className="h-3.5 w-3.5 mr-1.5" />
              Clear all filters
            </Button>
          </div>
        )}

        <div className="space-y-6 pb-6">
          {/* Amenity Filters */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">Amenities</h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => toggleFilter('covered')}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-colors ${
                  filters.covered
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground'
                }`}
              >
                <Umbrella className="h-4 w-4" />
                Covered
              </button>
              <button
                type="button"
                onClick={() => toggleFilter('securityCamera')}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-colors ${
                  filters.securityCamera
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground'
                }`}
              >
                <Camera className="h-4 w-4" />
                Security Camera
              </button>
              <button
                type="button"
                onClick={() => toggleFilter('twentyFourSevenAccess')}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-colors ${
                  filters.twentyFourSevenAccess
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground'
                }`}
              >
                <Clock className="h-4 w-4" />
                24/7 Access
              </button>
              <button
                type="button"
                onClick={() => toggleFilter('evCharging')}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-colors ${
                  filters.evCharging
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground'
                }`}
              >
                <Zap className="h-4 w-4" />
                EV Charging
              </button>
              <button
                type="button"
                onClick={() => toggleFilter('easyAccess')}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-colors ${
                  filters.easyAccess
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground'
                }`}
              >
                <Car className="h-4 w-4" />
                Easy Access
              </button>
              <button
                type="button"
                onClick={() => toggleFilter('wellLit')}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-colors ${
                  filters.wellLit
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground'
                }`}
              >
                <Lightbulb className="h-4 w-4" />
                Well Lit
              </button>
              <button
                type="button"
                onClick={() => toggleFilter('adaAccessible')}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-colors ${
                  filters.adaAccessible
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground'
                }`}
              >
                <Accessibility className="h-4 w-4" />
                ADA Accessible
              </button>
            </div>
          </div>

          {/* EV Charger Type Selection - Show when EV Charging is enabled */}
          {filters.evCharging && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">Charger Type (optional)</h3>
              <p className="text-xs text-muted-foreground">Select which charger types work for your vehicle</p>
              <div className="grid gap-2">
                {evChargerTypes.map((charger) => {
                  const isSelected = filters.evChargerTypes?.includes(charger.id);
                  return (
                    <button
                      key={charger.id}
                      type="button"
                      onClick={() => toggleChargerType(charger.id)}
                      className={cn(
                        'relative flex items-center gap-3 p-3 rounded-lg border transition-all text-left',
                        isSelected
                          ? 'border-primary bg-primary/5'
                          : 'border-border bg-background'
                      )}
                    >
                      <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
                        <img 
                          src={charger.iconPath} 
                          alt={charger.name}
                          className="w-7 h-7"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          'font-medium text-sm',
                          isSelected ? 'text-primary' : 'text-foreground'
                        )}>
                          {charger.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {charger.chargingSpeed}
                        </p>
                      </div>
                      {isSelected && (
                        <Check className="h-5 w-5 text-primary flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Booking Options */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">Booking Options</h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => toggleFilter('instantBook')}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-colors ${
                  filters.instantBook
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground'
                }`}
              >
                <BoltIcon className="h-4 w-4" />
                Instant Book
              </button>
            </div>
          </div>

          {/* Vehicle Size Filter */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">Vehicle Size</h3>
            <Select
              value={filters.vehicleSize || 'any'}
              onValueChange={(value) => setVehicleSize(value === 'any' ? null : value)}
            >
              <SelectTrigger className="w-full">
                <div className="flex items-center gap-2">
                  <Car className="h-4 w-4" />
                  <SelectValue placeholder="Any Size" />
                </div>
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
          </div>
        </div>

        {/* Apply Button */}
        <div className="pt-4 border-t">
          <Button 
            className="w-full rounded-full" 
            onClick={() => setOpen(false)}
          >
            Show {filteredCount} Spot{filteredCount !== 1 ? 's' : ''}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MobileFilterSheet;