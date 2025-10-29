import React, { useState } from 'react';
import { ChevronDown, Car, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { useMode } from '@/contexts/ModeContext';
import { cn } from '@/lib/utils';

const ModeSwitcher = () => {
  const { mode, setMode, isLoading } = useMode();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleModeSwitch = (newMode: 'driver' | 'host') => {
    if (newMode !== mode) {
      setMode(newMode);
      setOpen(false);
      // Navigate to the appropriate home page for the mode
      if (newMode === 'host') {
        navigate('/dashboard');
      } else {
        navigate('/');
      }
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "flex items-center gap-2 h-9 px-3",
            isLoading && "opacity-50 cursor-not-allowed"
          )}
          disabled={isLoading}
        >
          {mode === 'host' ? (
            <Home className="h-4 w-4" />
          ) : (
            <Car className="h-4 w-4" />
          )}
          <span className="text-sm font-medium capitalize">{mode}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2" align="start">
        <div className="space-y-1">
          <Button
            variant={mode === 'driver' ? 'secondary' : 'ghost'}
            className="w-full justify-start gap-2"
            onClick={() => handleModeSwitch('driver')}
          >
            <Car className="h-4 w-4" />
            Driver Mode
          </Button>
          <Button
            variant={mode === 'host' ? 'secondary' : 'ghost'}
            className="w-full justify-start gap-2"
            onClick={() => handleModeSwitch('host')}
          >
            <Home className="h-4 w-4" />
            Host Mode
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ModeSwitcher;
