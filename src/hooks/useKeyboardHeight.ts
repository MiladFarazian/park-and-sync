import { useState, useEffect, useCallback } from 'react';

/**
 * Hook to detect iOS keyboard height and provide keyboard state.
 * Uses visualViewport API for accurate keyboard detection on iOS.
 */
export function useKeyboardHeight() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    let initialHeight = vv.height;
    let rafId: number | null = null;

    const handleResize = () => {
      // Cancel any pending animation frame
      if (rafId) cancelAnimationFrame(rafId);

      // Use RAF to batch updates and avoid layout thrashing
      rafId = requestAnimationFrame(() => {
        const currentHeight = vv.height;
        const heightDiff = initialHeight - currentHeight;

        // Consider keyboard open if viewport shrunk by more than 150px
        // This threshold avoids false positives from address bar changes
        if (heightDiff > 150) {
          setKeyboardHeight(heightDiff);
          setIsKeyboardOpen(true);
        } else {
          setKeyboardHeight(0);
          setIsKeyboardOpen(false);
          // Update initial height when keyboard closes
          initialHeight = currentHeight;
        }
      });
    };

    // Also update initial height on orientation change
    const handleOrientationChange = () => {
      setTimeout(() => {
        initialHeight = vv.height;
      }, 100);
    };

    vv.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientationChange);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      vv.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, []);

  return { keyboardHeight, isKeyboardOpen };
}
