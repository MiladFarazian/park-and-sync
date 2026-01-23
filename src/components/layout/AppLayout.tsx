import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import BottomNavigation from './BottomNavigation';
import DesktopHeader from './DesktopHeader';
import ScrollToTop from './ScrollToTop';
import { logos } from '@/assets';
import ModeSwitcher from './ModeSwitcher';
import ModeLoadingOverlay from './ModeLoadingOverlay';
import NotificationPermissionBanner from './NotificationPermissionBanner';
import { NotificationBell } from './NotificationBell';
import { useNotifications } from '@/hooks/useNotifications';
import { useStripeReturnFlow } from '@/hooks/useStripeReturnFlow';
import { useMode } from '@/contexts/ModeContext';
import { useSupportRole } from '@/hooks/useSupportRole';
import { Shield } from 'lucide-react';
import { useVisualViewportVars } from '@/hooks/useVisualViewportVars';

interface AppLayoutProps {
  children: React.ReactNode;
}

const AppLayout = ({ children }: AppLayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { mode, setMode } = useMode();
  const { isSupport } = useSupportRole();
  const isHomePage = location.pathname === '/';
  
  // Pages that need full-width/height without container padding
  const isFullScreenPage =
    location.pathname === '/explore' ||
    location.pathname === '/messages' ||
    location.pathname === '/support-messages' ||
    location.pathname === '/reviews' ||
    location.pathname === '/host-calendar';
  // Initialize notifications hook to set up realtime listeners
  useNotifications();
  
  // Track visual viewport for iOS PWA keyboard handling
  useVisualViewportVars();
  
  // Handle return from Stripe setup in PWA/standalone mode
  useStripeReturnFlow();
  
  const handleLogoClick = () => {
    if (isSupport) {
      navigate('/support-home');
      return;
    }
    if (mode === 'host') {
      // Use instant switch (no overlay) so mode updates before navigation
      setMode('driver', false);
    }
    // Pass state to prevent Home from redirecting back to host-home
    navigate('/', { state: { fromLogoClick: true } });
  };
  
  return (
    <>
      <ScrollToTop />
      <ModeLoadingOverlay />
      
      {/* Desktop Layout with Top Header */}
      <div className="hidden md:flex h-screen flex-col">
        <NotificationPermissionBanner />
        <DesktopHeader />
        <main className="flex-1 overflow-y-auto" data-scroll-container>
          <div className={isFullScreenPage || isHomePage ? "h-full" : "container mx-auto p-6 h-full"}>
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Layout with Bottom Navigation */}
      <div
        className="md:hidden flex flex-col"
        style={{
          // Use 100dvh to prevent layout resize when iOS keyboard opens
          // The keyboard overlays the viewport rather than shrinking it
          height: '100dvh'
        }}
      >
        <NotificationPermissionBanner />
        <header className="flex-shrink-0 z-10 flex h-14 items-center justify-between border-b bg-background px-4 sticky top-0">
          <div className="flex items-center gap-3">
            <img
              src={logos.primary}
              alt="Parkzy"
              className="h-8 cursor-pointer"
              onClick={handleLogoClick}
            />
            {isSupport ? (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                <Shield className="h-3.5 w-3.5" />
                Support
              </div>
            ) : (
              <ModeSwitcher />
            )}
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
          </div>
        </header>
        <main className="flex-1 overflow-hidden bg-background" style={{ minHeight: 0, transform: 'translateZ(0)' }}>
          <div
            data-scroll-container
            className={`h-full ${isFullScreenPage ? '' : 'overflow-y-auto pb-20'}`}
            style={{
              paddingBottom: isFullScreenPage
                ? undefined
                : 'calc(5rem + env(safe-area-inset-bottom))',
              overscrollBehaviorY: 'contain',
              WebkitOverflowScrolling: 'touch',
              minHeight: 0
            }}
          >
            {children}
          </div>
        </main>
        <BottomNavigation />
      </div>
    </>
  );
};

export default AppLayout;