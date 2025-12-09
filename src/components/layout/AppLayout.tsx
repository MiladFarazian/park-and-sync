import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import BottomNavigation from './BottomNavigation';
import DesktopHeader from './DesktopHeader';
import parkzyLogo from '@/assets/parkzy-logo.png';
import ModeSwitcher from './ModeSwitcher';
import ModeLoadingOverlay from './ModeLoadingOverlay';
import NotificationPermissionBanner from './NotificationPermissionBanner';
import { NotificationBell } from './NotificationBell';
import { useNotifications } from '@/hooks/useNotifications';
import { useMode } from '@/contexts/ModeContext';

interface AppLayoutProps {
  children: React.ReactNode;
}

const AppLayout = ({ children }: AppLayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { mode, setMode } = useMode();
  const isProfilePage = location.pathname === '/profile';
  const isHomePage = location.pathname === '/';
  
  // Pages that need full-width/height without container padding
  const isFullScreenPage = location.pathname === '/explore' || location.pathname === '/messages';
  
  // Initialize notifications hook to set up realtime listeners
  useNotifications();
  
  const handleLogoClick = () => {
    if (mode === 'host') {
      setMode('driver');
    }
    navigate('/');
  };
  
  return (
    <>
      <ModeLoadingOverlay />
      
      {/* Desktop Layout with Top Header */}
      <div className="hidden md:flex h-screen flex-col">
        <NotificationPermissionBanner />
        {!isProfilePage && <DesktopHeader />}
        <main className="flex-1 overflow-y-auto">
          <div className={isFullScreenPage || isHomePage ? "h-full" : "container mx-auto p-6 h-full"}>
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Layout with Bottom Navigation */}
      <div className="md:hidden flex flex-col h-screen">
        <NotificationPermissionBanner />
        {!isProfilePage && (
          <header className="flex-shrink-0 z-10 flex h-14 items-center justify-between border-b bg-background px-4">
            <div className="flex items-center gap-3">
              <img 
                src={parkzyLogo} 
                alt="Parkzy" 
                className="h-8 cursor-pointer" 
                onClick={handleLogoClick}
              />
              <ModeSwitcher />
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell />
            </div>
          </header>
        )}
        <main className="flex-1 overflow-hidden bg-background">
          <div className={`h-full overflow-y-auto ${isFullScreenPage ? '' : 'pb-20 pb-[calc(5rem+env(safe-area-inset-bottom))]'}`}>
            {children}
          </div>
        </main>
        <BottomNavigation />
      </div>
    </>
  );
};

export default AppLayout;