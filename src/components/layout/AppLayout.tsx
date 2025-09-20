import React from 'react';
import BottomNavigation from './BottomNavigation';

interface AppLayoutProps {
  children: React.ReactNode;
}

const AppLayout = ({ children }: AppLayoutProps) => {
  return (
    <div className="min-h-screen bg-background pb-16">
      <div className="max-w-md mx-auto">
        {children}
      </div>
      <BottomNavigation />
    </div>
  );
};

export default AppLayout;