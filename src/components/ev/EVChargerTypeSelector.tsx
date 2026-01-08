import React from 'react';
import { evChargerTypes } from '@/lib/evChargerTypes';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

interface EVChargerTypeSelectorProps {
  value: string | null;
  onChange: (value: string) => void;
  className?: string;
}

export const EVChargerTypeSelector: React.FC<EVChargerTypeSelectorProps> = ({
  value,
  onChange,
  className,
}) => {
  return (
    <div className={cn('space-y-2', className)}>
      <Label>Charger Type <span className="text-destructive">*</span></Label>
      <div className="grid grid-cols-1 gap-3">
        {evChargerTypes.map((charger) => {
          const isSelected = value === charger.id;
          return (
            <button
              key={charger.id}
              type="button"
              onClick={() => onChange(charger.id)}
              className={cn(
                'relative flex items-start gap-3 p-3 rounded-lg border-2 transition-all text-left',
                isSelected
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-background hover:border-muted-foreground/50'
              )}
            >
              <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center">
                <img 
                  src={charger.iconPath} 
                  alt={charger.name}
                  className="w-10 h-10"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className={cn(
                    'font-semibold text-sm',
                    isSelected ? 'text-primary' : 'text-foreground'
                  )}>
                    {charger.name}
                  </p>
                  {isSelected && (
                    <Check className="h-5 w-5 text-primary" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {charger.description}
                </p>
                <p className={cn(
                  'text-xs font-medium mt-1',
                  isSelected ? 'text-primary' : 'text-muted-foreground'
                )}>
                  {charger.chargingSpeed}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
