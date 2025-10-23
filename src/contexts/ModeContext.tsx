import React, { createContext, useContext, useState, useEffect } from 'react';

type Mode = 'driver' | 'host';

interface ModeContextType {
  mode: Mode;
  setMode: (mode: Mode) => void;
  isLoading: boolean;
  targetMode: Mode | null;
}

const ModeContext = createContext<ModeContextType | undefined>(undefined);

export const ModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<Mode>(() => {
    const saved = localStorage.getItem('parkway-mode');
    return (saved === 'host' ? 'host' : 'driver') as Mode;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [targetMode, setTargetMode] = useState<Mode | null>(null);

  const setMode = (newMode: Mode) => {
    setIsLoading(true);
    setTargetMode(newMode);
    
    // Simulate mode switch loading
    setTimeout(() => {
      setModeState(newMode);
      localStorage.setItem('parkway-mode', newMode);
      setIsLoading(false);
      setTargetMode(null);
    }, 800);
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
