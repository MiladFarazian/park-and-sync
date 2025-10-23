import React from 'react';
import { Car, Home } from 'lucide-react';
import { useMode } from '@/contexts/ModeContext';

const ModeLoadingOverlay = () => {
  const { isLoading, mode } = useMode();

  if (!isLoading) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in-0">
      <div className="flex flex-col items-center gap-4 animate-in zoom-in-95">
        <div className="relative">
          <div className="absolute inset-0 animate-ping">
            {mode === 'host' ? (
              <Home className="h-16 w-16 text-primary opacity-75" />
            ) : (
              <Car className="h-16 w-16 text-primary opacity-75" />
            )}
          </div>
          {mode === 'host' ? (
            <Home className="h-16 w-16 text-primary" />
          ) : (
            <Car className="h-16 w-16 text-primary" />
          )}
        </div>
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold">Switching to {mode === 'host' ? 'Host' : 'Driver'} Mode</h3>
          <p className="text-sm text-muted-foreground">Please wait...</p>
        </div>
      </div>
    </div>
  );
};

export default ModeLoadingOverlay;
