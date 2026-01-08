import React from 'react';
import { getChargerTypeById } from '@/lib/evChargerTypes';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';

interface EVChargerBadgeProps {
  chargerType: string | null | undefined;
  showSpeed?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const getIconSize = (size: 'sm' | 'md' | 'lg') => {
  switch (size) {
    case 'sm': return 'w-4 h-4';
    case 'md': return 'w-5 h-5';
    case 'lg': return 'w-6 h-6';
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
        'gap-1.5 font-medium border border-[#4CAF50]/30 bg-[#4CAF50]/10 text-[#4CAF50]',
        size === 'sm' && 'text-xs px-1.5 py-0',
        size === 'md' && 'text-xs px-2 py-0.5',
        size === 'lg' && 'text-sm px-2.5 py-1',
        className
      )}
    >
      <img 
        src={charger.iconPath} 
        alt={charger.name}
        className={getIconSize(size)}
      />
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
