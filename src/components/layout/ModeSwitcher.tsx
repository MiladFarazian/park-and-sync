import React from 'react';
import { Car, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMode } from '@/contexts/ModeContext';
import { cn } from '@/lib/utils';

const ModeSwitcher = () => {
  const { mode, setMode, isLoading } = useMode();
  const navigate = useNavigate();

  const handleModeSwitch = (newMode: 'driver' | 'host') => {
    if (newMode !== mode) {
      setMode(newMode);
      if (newMode === 'host') {
        navigate('/host-home');
      } else {
        navigate('/');
      }
    }
  };

  return (
    <div
      className={cn(
        "relative flex items-center h-9 p-1 bg-muted rounded-full",
        isLoading && "opacity-50 pointer-events-none"
      )}
    >
      {/* Animated sliding indicator */}
      <div
        className={cn(
          "absolute h-7 rounded-full shadow-sm transition-all duration-300 ease-out",
          mode === 'driver' 
            ? "left-1 w-[calc(50%-2px)] bg-violet-300" 
            : "left-[calc(50%+1px)] w-[calc(50%-2px)] bg-primary"
        )}
      />
      
      <button
        onClick={() => handleModeSwitch('driver')}
        disabled={isLoading}
        className={cn(
          "relative z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors duration-300",
          mode === 'driver'
            ? "text-violet-900"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Car className="h-3.5 w-3.5" />
        <span>Driver</span>
      </button>
      <button
        onClick={() => handleModeSwitch('host')}
        disabled={isLoading}
        className={cn(
          "relative z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors duration-300",
          mode === 'host'
            ? "text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Home className="h-3.5 w-3.5" />
        <span>Host</span>
      </button>
    </div>
  );
};

export default ModeSwitcher;
