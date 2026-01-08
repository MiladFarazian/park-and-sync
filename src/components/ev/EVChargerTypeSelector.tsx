import React from 'react';
import { evChargerTypes, EVChargerType } from '@/lib/evChargerTypes';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Check, Zap, Plug, Battery } from 'lucide-react';

interface EVChargerTypeSelectorProps {
  value: string | null;
  onChange: (value: string) => void;
  className?: string;
}

const getChargerIcon = (id: string) => {
  switch (id) {
    case 'tesla_nacs':
    case 'ccs1':
      return <Zap className="h-6 w-6" />;
    case 'j1772':
    case 'nema_14_50':
      return <Plug className="h-6 w-6" />;
    case 'chademo':
      return <Battery className="h-6 w-6" />;
    default:
      return <Zap className="h-6 w-6" />;
  }
};

const getChargerColor = (id: string) => {
  switch (id) {
    case 'tesla_nacs':
      return 'border-red-500 bg-red-50 dark:bg-red-950/30';
    case 'j1772':
      return 'border-blue-500 bg-blue-50 dark:bg-blue-950/30';
    case 'ccs1':
      return 'border-orange-500 bg-orange-50 dark:bg-orange-950/30';
    case 'chademo':
      return 'border-purple-500 bg-purple-50 dark:bg-purple-950/30';
    case 'nema_14_50':
      return 'border-gray-500 bg-gray-50 dark:bg-gray-950/30';
    default:
      return 'border-green-500 bg-green-50 dark:bg-green-950/30';
  }
};

const getChargerTextColor = (id: string) => {
  switch (id) {
    case 'tesla_nacs':
      return 'text-red-600 dark:text-red-400';
    case 'j1772':
      return 'text-blue-600 dark:text-blue-400';
    case 'ccs1':
      return 'text-orange-600 dark:text-orange-400';
    case 'chademo':
      return 'text-purple-600 dark:text-purple-400';
    case 'nema_14_50':
      return 'text-gray-600 dark:text-gray-400';
    default:
      return 'text-green-600 dark:text-green-400';
  }
};

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
                  ? `${getChargerColor(charger.id)} border-2`
                  : 'border-border bg-background hover:border-muted-foreground/50'
              )}
            >
              <div
                className={cn(
                  'flex-shrink-0 p-2 rounded-lg',
                  isSelected ? getChargerTextColor(charger.id) : 'text-muted-foreground'
                )}
              >
                {getChargerIcon(charger.id)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className={cn(
                    'font-semibold text-sm',
                    isSelected ? getChargerTextColor(charger.id) : 'text-foreground'
                  )}>
                    {charger.name}
                  </p>
                  {isSelected && (
                    <Check className={cn('h-5 w-5', getChargerTextColor(charger.id))} />
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {charger.description}
                </p>
                <p className={cn(
                  'text-xs font-medium mt-1',
                  isSelected ? getChargerTextColor(charger.id) : 'text-muted-foreground'
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
