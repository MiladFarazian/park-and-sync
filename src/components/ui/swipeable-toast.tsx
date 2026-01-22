import * as React from "react";
import { useRef, useState, useCallback } from "react";
import { Haptics, ImpactStyle } from "@capacitor/haptics";

interface SwipeableToastProps {
  children: React.ReactNode;
  onDismiss: () => void;
}

const DISMISS_THRESHOLD = 50; // pixels
const VELOCITY_THRESHOLD = 0.5; // pixels per ms
const MIN_MOVEMENT = 5; // minimum pixels before treating as intentional swipe

// Haptic feedback helper - uses Capacitor on native, Vibration API on web
const triggerHaptic = async (style: 'light' | 'medium' | 'heavy' = 'light') => {
  try {
    // Try Capacitor Haptics first (works on native iOS/Android)
    const impactStyle = style === 'light' ? ImpactStyle.Light 
      : style === 'medium' ? ImpactStyle.Medium 
      : ImpactStyle.Heavy;
    await Haptics.impact({ style: impactStyle });
  } catch {
    // Fallback to Web Vibration API (works on Android Chrome)
    if ('vibrate' in navigator) {
      const duration = style === 'light' ? 10 : style === 'medium' ? 20 : 30;
      navigator.vibrate(duration);
    }
  }
};

export function SwipeableToast({ children, onDismiss }: SwipeableToastProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [translateY, setTranslateY] = useState(0);
  const [translateX, setTranslateX] = useState(0);
  const [isDismissing, setIsDismissing] = useState(false);
  const [dismissDirection, setDismissDirection] = useState<'up' | 'right' | null>(null);
  const [hasTriggeredThresholdHaptic, setHasTriggeredThresholdHaptic] = useState(false);
  
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const swipeDirectionRef = useRef<'horizontal' | 'vertical' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
    };
    swipeDirectionRef.current = null;
    setIsDragging(false);
    setHasTriggeredThresholdHaptic(false);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - touchStartRef.current.x;
    const deltaY = currentY - touchStartRef.current.y;

    // Determine swipe direction on first significant movement
    if (!swipeDirectionRef.current && (Math.abs(deltaX) > MIN_MOVEMENT || Math.abs(deltaY) > MIN_MOVEMENT)) {
      swipeDirectionRef.current = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
    }

    if (!swipeDirectionRef.current) return;

    // Handle vertical swipe (up only)
    if (swipeDirectionRef.current === 'vertical') {
      // Only allow upward swipes (negative deltaY)
      if (deltaY > 0) {
        setTranslateY(0);
        setTranslateX(0);
        return;
      }
      setIsDragging(true);
      setTranslateY(deltaY);
      setTranslateX(0);

      // Trigger haptic when crossing threshold
      if (Math.abs(deltaY) > DISMISS_THRESHOLD && !hasTriggeredThresholdHaptic) {
        triggerHaptic('light');
        setHasTriggeredThresholdHaptic(true);
      }
    }
    // Handle horizontal swipe (right only)
    else if (swipeDirectionRef.current === 'horizontal') {
      // Only allow rightward swipes (positive deltaX)
      if (deltaX < 0) {
        setTranslateX(0);
        setTranslateY(0);
        return;
      }
      setIsDragging(true);
      setTranslateX(deltaX);
      setTranslateY(0);

      // Trigger haptic when crossing threshold
      if (deltaX > DISMISS_THRESHOLD && !hasTriggeredThresholdHaptic) {
        triggerHaptic('light');
        setHasTriggeredThresholdHaptic(true);
      }
    }
  }, [hasTriggeredThresholdHaptic]);

  const handleTouchEnd = useCallback(() => {
    if (!touchStartRef.current || !isDragging) {
      touchStartRef.current = null;
      swipeDirectionRef.current = null;
      setTranslateY(0);
      setTranslateX(0);
      setIsDragging(false);
      return;
    }

    const endTime = Date.now();
    const duration = endTime - touchStartRef.current.time;
    
    const velocityY = Math.abs(translateY) / duration;
    const velocityX = Math.abs(translateX) / duration;

    // Check for upward dismissal
    if (swipeDirectionRef.current === 'vertical' && 
        (Math.abs(translateY) > DISMISS_THRESHOLD || velocityY > VELOCITY_THRESHOLD)) {
      setIsDismissing(true);
      setDismissDirection('up');
      triggerHaptic('medium');
      setTimeout(() => {
        onDismiss();
      }, 150);
    }
    // Check for rightward dismissal
    else if (swipeDirectionRef.current === 'horizontal' && 
             (translateX > DISMISS_THRESHOLD || velocityX > VELOCITY_THRESHOLD)) {
      setIsDismissing(true);
      setDismissDirection('right');
      triggerHaptic('medium');
      setTimeout(() => {
        onDismiss();
      }, 150);
    }
    // Snap back to original position
    else {
      setTranslateY(0);
      setTranslateX(0);
    }

    touchStartRef.current = null;
    swipeDirectionRef.current = null;
    setIsDragging(false);
  }, [isDragging, translateY, translateX, onDismiss]);

  // Calculate opacity based on drag distance
  const dragDistance = Math.max(Math.abs(translateY), Math.abs(translateX));
  const opacity = isDragging ? Math.max(0.3, 1 - dragDistance / 150) : 1;

  // Determine final transform for dismissal animation
  const getTransform = () => {
    if (isDismissing) {
      return dismissDirection === 'up' ? 'translateY(-100%)' : 'translateX(100%)';
    }
    return `translate(${translateX}px, ${translateY}px)`;
  };

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className="touch-action-pan-y"
      style={{
        transform: getTransform(),
        opacity: isDismissing ? 0 : opacity,
        transition: isDragging ? 'none' : 'transform 0.2s ease-out, opacity 0.2s ease-out',
      }}
    >
      {children}
    </div>
  );
}
