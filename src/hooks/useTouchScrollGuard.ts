import { useRef, useCallback } from 'react';

/**
 * Hook to distinguish between scroll gestures and intentional taps on touch devices.
 * Use this to prevent buttons from highlighting/selecting during scroll.
 * 
 * Usage:
 * const { getTouchHandlers, shouldIgnoreClick } = useTouchScrollGuard();
 * 
 * <button
 *   {...getTouchHandlers()}
 *   onClick={() => {
 *     if (shouldIgnoreClick()) return;
 *     // handle selection
 *   }}
 * >
 */
export function useTouchScrollGuard(threshold = 10) {
  const touchStartRef = useRef({ x: 0, y: 0 });
  const isScrollingRef = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    isScrollingRef.current = false;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (isScrollingRef.current) return;
    
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - touchStartRef.current.x);
    const dy = Math.abs(touch.clientY - touchStartRef.current.y);
    
    if (dx + dy > threshold) {
      isScrollingRef.current = true;
    }
  }, [threshold]);

  const onTouchEnd = useCallback(() => {
    // Reset after a short delay to allow click event to fire first
    setTimeout(() => {
      isScrollingRef.current = false;
    }, 50);
  }, []);

  const shouldIgnoreClick = useCallback(() => {
    return isScrollingRef.current;
  }, []);

  const getTouchHandlers = useCallback(() => ({
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  }), [onTouchStart, onTouchMove, onTouchEnd]);

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    shouldIgnoreClick,
    getTouchHandlers,
  };
}
