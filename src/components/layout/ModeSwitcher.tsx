import React from 'react';
import { Car, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMode } from '@/contexts/ModeContext';
import { cn } from '@/lib/utils';

interface ModeSwitcherProps {
  variant?: 'default' | 'light';
  navigate?: boolean;
}

const ModeSwitcher = ({ variant = 'default', navigate: shouldNavigate = true }: ModeSwitcherProps) => {
  const { mode, setMode, isLoading } = useMode();
  const navigate = useNavigate();

  const handleModeSwitch = (newMode: 'driver' | 'host') => {
    if (newMode !== mode) {
      setMode(newMode, shouldNavigate); // Only show overlay when navigating
      if (shouldNavigate) {
        if (newMode === 'host') {
          navigate('/host-home');
        } else {
          navigate('/');
        }
      }
    }
  };

  const isLight = variant === 'light';

  return (
    <div
      className={cn(
        "flex items-center gap-3",
        isLoading && "pointer-events-none opacity-70"
      )}
    >
      {/* Driver label */}
      <button
        onClick={() => handleModeSwitch('driver')}
        disabled={isLoading}
        className={cn(
          "flex items-center gap-1.5 text-sm font-medium transition-colors duration-200",
          isLight
            ? mode === 'driver'
              ? "text-white"
              : "text-white/60 hover:text-white/80"
            : mode === 'driver'
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Car className="h-4 w-4" />
        <span>Driver</span>
      </button>

      {/* Toggle track with sliding circle */}
      <button
        onClick={() => handleModeSwitch(mode === 'driver' ? 'host' : 'driver')}
        disabled={isLoading}
        className={cn(
          "relative w-12 h-6 rounded-full p-0.5 transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          isLight ? "bg-white/20" : "bg-muted"
        )}
        aria-label={`Switch to ${mode === 'driver' ? 'host' : 'driver'} mode`}
      >
        <div
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full transition-all duration-300 ease-out",
            isLoading && "scale-90",
            isLight
              ? mode === 'driver'
                ? "left-0.5 bg-white shadow-[0_0_12px_rgba(255,255,255,0.5)]"
                : "left-[calc(100%-1.375rem)] bg-white shadow-[0_0_12px_rgba(255,255,255,0.5)]"
              : mode === 'driver' 
                ? "left-0.5 bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.5)]" 
                : "left-[calc(100%-1.375rem)] bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.5)]"
          )}
        />
      </button>

      {/* Host label */}
      <button
        onClick={() => handleModeSwitch('host')}
        disabled={isLoading}
        className={cn(
          "flex items-center gap-1.5 text-sm font-medium transition-colors duration-200",
          isLight
            ? mode === 'host'
              ? "text-white"
              : "text-white/60 hover:text-white/80"
            : mode === 'host'
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Home className="h-4 w-4" />
        <span>Host</span>
      </button>
    </div>
  );
};

export default ModeSwitcher;
