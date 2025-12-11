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
        "flex items-center h-9 p-1 bg-muted rounded-full",
        isLoading && "opacity-50 pointer-events-none"
      )}
    >
      <button
        onClick={() => handleModeSwitch('driver')}
        disabled={isLoading}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200",
          mode === 'driver'
            ? "bg-background text-foreground shadow-sm"
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
          "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200",
          mode === 'host'
            ? "bg-background text-foreground shadow-sm"
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
