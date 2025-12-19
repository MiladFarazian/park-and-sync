import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Mode = 'driver' | 'host';

interface ModeContextType {
  mode: Mode;
  setMode: (mode: Mode, showOverlay?: boolean) => void;
  isLoading: boolean;
  targetMode: Mode | null;
}

const ModeContext = createContext<ModeContextType | undefined>(undefined);

export const ModeProvider = ({ children }: { children: ReactNode }) => {
  // Initialize from localStorage or default to driver mode
  const [mode, setModeState] = useState<Mode>(() => {
    const savedMode = localStorage.getItem('parkway-mode');
    return (savedMode === 'host' || savedMode === 'driver') ? savedMode : 'driver';
  });
  const [isLoading, setIsLoading] = useState(false);
  const [targetMode, setTargetMode] = useState<Mode | null>(null);

  const setMode = (newMode: Mode, showOverlay: boolean = true) => {
    if (showOverlay) {
      setIsLoading(true);
      setTargetMode(newMode);
      
      // Simulate mode switch loading
      setTimeout(() => {
        setModeState(newMode);
        localStorage.setItem('parkway-mode', newMode);
        setIsLoading(false);
        setTargetMode(null);
      }, 300);
    } else {
      // Instant switch without overlay
      setModeState(newMode);
      localStorage.setItem('parkway-mode', newMode);
    }
  };

  return (
    <ModeContext.Provider value={{ mode, setMode, isLoading, targetMode }}>
      {children}
    </ModeContext.Provider>
  );
};

export const useMode = () => {
  const context = useContext(ModeContext);
  if (context === undefined) {
    throw new Error('useMode must be used within a ModeProvider');
  }
  return context;
};
