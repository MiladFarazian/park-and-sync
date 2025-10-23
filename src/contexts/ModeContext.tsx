import React, { createContext, useContext, useState, useEffect } from 'react';

type Mode = 'book' | 'host';

interface ModeContextType {
  mode: Mode;
  setMode: (mode: Mode) => void;
}

const ModeContext = createContext<ModeContextType | undefined>(undefined);

export const ModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<Mode>(() => {
    const saved = localStorage.getItem('parkway-mode');
    return (saved === 'host' ? 'host' : 'book') as Mode;
  });

  const setMode = (newMode: Mode) => {
    setModeState(newMode);
    localStorage.setItem('parkway-mode', newMode);
  };

  return (
    <ModeContext.Provider value={{ mode, setMode }}>
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
