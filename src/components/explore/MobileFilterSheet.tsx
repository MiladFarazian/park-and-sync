import React from 'react';
import { Umbrella, Zap, Shield, Accessibility, Car, X, SlidersHorizontal } from 'lucide-react';
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

interface MobileFilterSheetProps {
  filters: SpotFilters;
  onFiltersChange: (filters: SpotFilters) => void;
  totalSpots: number;
  filteredCount: number;
}

const vehicleSizes = [
  { value: 'compact', label: 'Compact' },
  { value: 'midsize', label: 'Midsize' },
  { value: 'suv', label: 'SUV' },
  { value: 'truck', label: 'Truck' },
];

const MobileFilterSheet = ({
  filters,
  onFiltersChange,
  totalSpots,
  filteredCount,
}: MobileFilterSheetProps) => {
  const [open, setOpen] = React.useState(false);

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

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="bg-background/95 backdrop-blur-sm shadow-lg rounded-full px-3 gap-1.5"
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span className="text-sm">Filters</span>
          {activeFilterCount > 0 && (
            <Badge 
              variant="secondary" 
              className="h-5 w-5 p-0 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs"
            >
              {activeFilterCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-2xl h-auto max-h-[70vh]">
        <SheetHeader className="pb-4">
          <div className="flex items-center justify-between">
            <SheetTitle>Filter Spots</SheetTitle>
            {activeFilterCount > 0 && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={clearAllFilters}
                className="text-muted-foreground h-auto py-1 px-2"
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Clear all
              </Button>
            )}
          </div>
          <p className="text-sm text-muted-foreground text-left">
            {filteredCount} of {totalSpots} spot{totalSpots !== 1 ? 's' : ''} match your filters
          </p>
        </SheetHeader>

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
                onClick={() => toggleFilter('secure')}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-colors ${
                  filters.secure
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground'
                }`}
              >
                <Shield className="h-4 w-4" />
                Secure
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
