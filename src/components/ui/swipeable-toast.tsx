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
  const [dismissDirection, setDismissDirection] = useState<'up' | 'down' | 'left' | 'right' | null>(null);
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

    // Handle vertical swipe (up or down)
    if (swipeDirectionRef.current === 'vertical') {
      setIsDragging(true);
      setTranslateY(deltaY);
      setTranslateX(0);

      // Trigger haptic when crossing threshold
      if (Math.abs(deltaY) > DISMISS_THRESHOLD && !hasTriggeredThresholdHaptic) {
        triggerHaptic('light');
        setHasTriggeredThresholdHaptic(true);
      }
    }
    // Handle horizontal swipe (left or right)
    else if (swipeDirectionRef.current === 'horizontal') {
      setIsDragging(true);
      setTranslateX(deltaX);
      setTranslateY(0);

      // Trigger haptic when crossing threshold
      if (Math.abs(deltaX) > DISMISS_THRESHOLD && !hasTriggeredThresholdHaptic) {
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

    // Check for vertical dismissal (up or down)
    if (swipeDirectionRef.current === 'vertical' && 
        (Math.abs(translateY) > DISMISS_THRESHOLD || velocityY > VELOCITY_THRESHOLD)) {
      setIsDismissing(true);
      setDismissDirection(translateY < 0 ? 'up' : 'down');
      triggerHaptic('medium');
      setTimeout(() => {
        onDismiss();
      }, 150);
    }
    // Check for horizontal dismissal (left or right)
    else if (swipeDirectionRef.current === 'horizontal' && 
             (Math.abs(translateX) > DISMISS_THRESHOLD || velocityX > VELOCITY_THRESHOLD)) {
      setIsDismissing(true);
      setDismissDirection(translateX > 0 ? 'right' : 'left');
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
      switch (dismissDirection) {
        case 'up': return 'translateY(-100%)';
        case 'down': return 'translateY(100%)';
        case 'left': return 'translateX(-100%)';
        case 'right': return 'translateX(100%)';
        default: return 'translate(0, 0)';
      }
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
