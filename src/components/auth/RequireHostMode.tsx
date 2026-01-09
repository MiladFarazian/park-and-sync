import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMode } from '@/contexts/ModeContext';

interface RequireHostModeProps {
  children: React.ReactNode;
}

const RequireHostMode = ({ children }: RequireHostModeProps) => {
  const { mode } = useMode();
  const navigate = useNavigate();

  useEffect(() => {
    if (mode === 'driver') {
      navigate('/', { replace: true });
    }
  }, [mode, navigate]);

  if (mode === 'driver') return null;

  return <>{children}</>;
};

export default RequireHostMode;
