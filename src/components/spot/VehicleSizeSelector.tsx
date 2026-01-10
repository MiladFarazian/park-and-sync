import React from 'react';
import { Car, Truck, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { vehicleSizes, VehicleSizeInfo } from '@/lib/vehicleSizes';

interface VehicleSizeSelectorProps {
  selectedSizes: string[];
  onSizesChange: (sizes: string[]) => void;
  error?: string;
}

const sizeIcons: Record<string, React.ReactNode> = {
  compact: <Car className="h-6 w-6" />,
  midsize: <Car className="h-7 w-7" />,
  suv: <Truck className="h-7 w-7" />,
  truck: <Truck className="h-8 w-8" />,
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
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Select all vehicle sizes that can fit in your parking spot
        </p>
        <div className="flex gap-2">
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
                'relative flex items-start gap-4 p-4 rounded-xl border-2 transition-all text-left',
                isSelected
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                  : 'border-border bg-background hover:border-muted-foreground/30'
              )}
            >
              <div
                className={cn(
                  'flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center transition-colors',
                  isSelected
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {sizeIcons[size.value]}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p
                    className={cn(
                      'font-semibold',
                      isSelected ? 'text-primary' : 'text-foreground'
                    )}
                  >
                    {size.label}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {size.description}
                </p>
                <p className="text-xs text-muted-foreground/80 mt-1">
                  e.g., {size.examples}
                </p>
              </div>

              {isSelected && (
                <div className="absolute top-3 right-3">
                  <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                    <Check className="h-4 w-4 text-primary-foreground" />
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
