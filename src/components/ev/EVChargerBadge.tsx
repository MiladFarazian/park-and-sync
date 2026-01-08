import React from 'react';
import { getChargerTypeById } from '@/lib/evChargerTypes';
import { cn } from '@/lib/utils';
import { Zap, Plug, Battery } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';

interface EVChargerBadgeProps {
  chargerType: string | null | undefined;
  showSpeed?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const getChargerIcon = (id: string, size: 'sm' | 'md' | 'lg') => {
  const sizeClass = size === 'sm' ? 'h-3 w-3' : size === 'md' ? 'h-4 w-4' : 'h-5 w-5';
  switch (id) {
    case 'tesla_nacs':
    case 'ccs1':
      return <Zap className={sizeClass} />;
    case 'j1772':
    case 'nema_14_50':
      return <Plug className={sizeClass} />;
    case 'chademo':
      return <Battery className={sizeClass} />;
    default:
      return <Zap className={sizeClass} />;
  }
};

const getChargerBadgeStyle = (id: string) => {
  switch (id) {
    case 'tesla_nacs':
      return 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 border-red-200 dark:border-red-800';
    case 'j1772':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 border-blue-200 dark:border-blue-800';
    case 'ccs1':
      return 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300 border-orange-200 dark:border-orange-800';
    case 'chademo':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 border-purple-200 dark:border-purple-800';
    case 'nema_14_50':
      return 'bg-gray-100 text-gray-700 dark:bg-gray-900/50 dark:text-gray-300 border-gray-200 dark:border-gray-800';
    default:
      return 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300 border-green-200 dark:border-green-800';
  }
};

export const EVChargerBadge: React.FC<EVChargerBadgeProps> = ({
  chargerType,
  showSpeed = false,
  size = 'md',
  className,
}) => {
  const charger = getChargerTypeById(chargerType);
  
  if (!charger) return null;

  const badge = (
    <Badge
      variant="outline"
      className={cn(
        'gap-1 font-medium border',
        getChargerBadgeStyle(charger.id),
        size === 'sm' && 'text-xs px-1.5 py-0',
        size === 'md' && 'text-xs px-2 py-0.5',
        size === 'lg' && 'text-sm px-2.5 py-1',
        className
      )}
    >
      {getChargerIcon(charger.id, size)}
      {charger.name}
    </Badge>
  );

  if (showSpeed) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {badge}
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-center">
              <p className="font-medium">{charger.name}</p>
              <p className="text-xs text-muted-foreground">{charger.description}</p>
              <p className="text-xs font-medium mt-1">{charger.chargingSpeed}</p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return badge;
};
