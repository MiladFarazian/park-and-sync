import React from 'react';
import { Car, Home } from 'lucide-react';
import { useMode } from '@/contexts/ModeContext';

const ModeLoadingOverlay = () => {
  const { isLoading, targetMode } = useMode();

  if (!isLoading || !targetMode) return null;

  return (
    <div className="fixed inset-0 top-14 md:top-16 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in-0">
      <div className="flex flex-col items-center gap-4 animate-in zoom-in-95 -mt-14 md:-mt-16">
        <div className="relative">
          <div className="absolute inset-0 animate-ping">
            {targetMode === 'host' ? (
              <Home className="h-16 w-16 text-primary opacity-75" />
            ) : (
              <Car className="h-16 w-16 text-primary opacity-75" />
            )}
          </div>
          {targetMode === 'host' ? (
            <Home className="h-16 w-16 text-primary" />
          ) : (
            <Car className="h-16 w-16 text-primary" />
          )}
        </div>
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold">Switching to {targetMode === 'host' ? 'Host' : 'Driver'} Mode</h3>
          <p className="text-sm text-muted-foreground">Please wait...</p>
        </div>
      </div>
    </div>
  );
};

export default ModeLoadingOverlay;
