import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { vehicleSizes, VehicleSizeInfo } from '@/lib/vehicleSizes';

interface VehicleSizeSelectorProps {
  selectedSizes: string[];
  onSizesChange: (sizes: string[]) => void;
  error?: string;
}

const sizeIcons: Record<string, string> = {
  compact: '/icons/vehicles/vehicle-compact.png',
  midsize: '/icons/vehicles/vehicle-sedan.png',
  suv: '/icons/vehicles/vehicle-suv.png',
  truck: '/icons/vehicles/vehicle-truck.png',
};

const VehicleSizeSelector = ({
  selectedSizes,
  onSizesChange,
  error,
}: VehicleSizeSelectorProps) => {
  const toggleSize = (sizeValue: string) => {
    if (selectedSizes.includes(sizeValue)) {
      onSizesChange(selectedSizes.filter((s) => s !== sizeValue));
    } else {
      onSizesChange([...selectedSizes, sizeValue]);
    }
  };

  const selectAll = () => {
    onSizesChange(vehicleSizes.map((s) => s.value));
  };

  const clearAll = () => {
    onSizesChange([]);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Select all vehicle sizes that can fit in your parking spot
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={selectAll}
            className="text-xs text-primary hover:underline"
          >
            Select all
          </button>
          <span className="text-muted-foreground">|</span>
          <button
            type="button"
            onClick={clearAll}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="grid gap-3">
        {vehicleSizes.map((size) => {
          const isSelected = selectedSizes.includes(size.value);
          return (
            <button
              key={size.value}
              type="button"
              onClick={() => toggleSize(size.value)}
              className={cn(
                'relative flex items-start gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl border-2 transition-all text-left touch-scroll-safe',
                isSelected
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                  : 'border-border bg-background hover:border-muted-foreground/30'
              )}
            >
              <div
                className={cn(
                  'flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center transition-colors',
                  isSelected
                    ? 'bg-primary/10'
                    : 'bg-muted'
                )}
              >
                <img
                  src={sizeIcons[size.value]}
                  alt={size.label}
                  className={cn(
                    'h-6 w-6 sm:h-8 sm:w-8 transition-all',
                    isSelected ? 'opacity-100' : 'opacity-60'
                  )}
                  style={{
                    filter: isSelected
                      ? 'invert(36%) sepia(91%) saturate(1000%) hue-rotate(180deg) brightness(95%)'
                      : 'none',
                  }}
                />
              </div>

              <div className="flex-1 min-w-0 pr-6">
                <p
                  className={cn(
                    'font-semibold text-sm sm:text-base',
                    isSelected ? 'text-primary' : 'text-foreground'
                  )}
                >
                  {size.label}
                </p>
                <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 line-clamp-2">
                  {size.description}
                </p>
                <p className="text-xs text-muted-foreground/80 mt-1 line-clamp-1">
                  e.g., {size.examples}
                </p>
              </div>

              {isSelected && (
                <div className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3">
                  <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-primary flex items-center justify-center">
                    <Check className="h-3 w-3 sm:h-4 sm:w-4 text-primary-foreground" />
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {error && <p className="text-sm text-destructive mt-2">{error}</p>}

      {selectedSizes.length > 0 && (
        <div className="p-3 rounded-lg bg-muted/50 border">
          <p className="text-sm">
            <span className="font-medium">{selectedSizes.length}</span> size
            {selectedSizes.length !== 1 ? 's' : ''} selected:{' '}
            <span className="text-muted-foreground">
              {selectedSizes
                .map((s) => vehicleSizes.find((v) => v.value === s)?.shortLabel)
                .join(', ')}
            </span>
          </p>
        </div>
      )}
    </div>
  );
};

export default VehicleSizeSelector;
