import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

export const useOrientationLock = () => {
  useEffect(() => {
    const lockOrientation = async () => {
      // Native Capacitor app - use the Screen Orientation plugin
      if (Capacitor.isNativePlatform()) {
        try {
          const { ScreenOrientation } = await import('@capacitor/screen-orientation');
          await ScreenOrientation.lock({ orientation: 'portrait' });
          console.log('[orientation] Locked to portrait via Capacitor');
        } catch (error) {
          console.log('[orientation] Capacitor lock failed:', error);
        }
        return;
      }

      // Web fallback - try Screen Orientation API (limited support)
      const isMobile = window.innerWidth < 896;
      if (!isMobile) return;

      try {
        if (screen.orientation && 'lock' in screen.orientation) {
          await (screen.orientation as any).lock('portrait');
          console.log('[orientation] Locked via Screen Orientation API');
        }
      } catch (error) {
        // Expected to fail on most browsers - this is normal
        console.log('[orientation] Web API lock not supported (expected on iOS)');
      }
    };

    lockOrientation();

    return () => {
      // Cleanup - unlock orientation
      if (Capacitor.isNativePlatform()) {
        import('@capacitor/screen-orientation').then(({ ScreenOrientation }) => {
          ScreenOrientation.unlock().catch(() => {});
        });
      } else if (screen.orientation && 'unlock' in screen.orientation) {
        try {
          (screen.orientation as any).unlock();
        } catch {
          // Ignore
        }
      }
    };
  }, []);
};
