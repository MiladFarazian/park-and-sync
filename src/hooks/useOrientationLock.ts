import { useEffect } from 'react';

export const useOrientationLock = () => {
  useEffect(() => {
    // Only apply on mobile devices
    const isMobile = window.innerWidth < 896;
    
    if (!isMobile) return;

    // Lock orientation to portrait if API is available
    const lockOrientation = async () => {
      try {
        if (screen.orientation && 'lock' in screen.orientation) {
          await (screen.orientation as any).lock('portrait');
        }
      } catch (error) {
        // Orientation lock not supported or failed - this is expected on many browsers
        console.log('Orientation lock not supported:', error);
      }
    };

    lockOrientation();

    // Fallback: Handle orientation change event
    const handleOrientationChange = () => {
      if (window.innerWidth < 896) {
        // Try to lock back to portrait
        if (screen.orientation && 'lock' in screen.orientation) {
          (screen.orientation as any).lock('portrait').catch(() => {});
        }
      }
    };

    window.addEventListener('orientationchange', handleOrientationChange);

    return () => {
      window.removeEventListener('orientationchange', handleOrientationChange);
      // Unlock on cleanup
      if (screen.orientation && 'unlock' in screen.orientation) {
        try {
          (screen.orientation as any).unlock();
        } catch {
          // Ignore unlock errors
        }
      }
    };
  }, []);
};
