import * as React from "react";
import { useRef, useState, useCallback } from "react";

interface SwipeableToastProps {
  children: React.ReactNode;
  onDismiss: () => void;
}

const DISMISS_THRESHOLD = 50; // pixels
const VELOCITY_THRESHOLD = 0.5; // pixels per ms
const MIN_MOVEMENT = 5; // minimum pixels before treating as intentional swipe

export function SwipeableToast({ children, onDismiss }: SwipeableToastProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [translateY, setTranslateY] = useState(0);
  const [isDismissing, setIsDismissing] = useState(false);
  
  const touchStartRef = useRef<{ y: number; time: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = {
      y: e.touches[0].clientY,
      time: Date.now(),
    };
    setIsDragging(false);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;

    const currentY = e.touches[0].clientY;
    const deltaY = currentY - touchStartRef.current.y;

    // Only allow upward swipes (negative deltaY)
    if (deltaY > 0) {
      setTranslateY(0);
      return;
    }

    // Check minimum movement threshold before treating as swipe
    if (Math.abs(deltaY) < MIN_MOVEMENT) return;

    setIsDragging(true);
    setTranslateY(deltaY);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!touchStartRef.current || !isDragging) {
      touchStartRef.current = null;
      setTranslateY(0);
      setIsDragging(false);
      return;
    }

    const endTime = Date.now();
    const duration = endTime - touchStartRef.current.time;
    const velocity = Math.abs(translateY) / duration;

    // Dismiss if past threshold or velocity is high enough
    if (Math.abs(translateY) > DISMISS_THRESHOLD || velocity > VELOCITY_THRESHOLD) {
      setIsDismissing(true);
      // Wait for animation to complete before dismissing
      setTimeout(() => {
        onDismiss();
      }, 150);
    } else {
      // Snap back to original position
      setTranslateY(0);
    }

    touchStartRef.current = null;
    setIsDragging(false);
  }, [isDragging, translateY, onDismiss]);

  // Calculate opacity based on drag distance
  const opacity = isDragging ? Math.max(0.3, 1 - Math.abs(translateY) / 150) : 1;

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className={`touch-action-pan-y ${isDismissing ? 'animate-swipe-out-up' : ''}`}
      style={{
        transform: isDismissing 
          ? 'translateY(-100%)' 
          : `translateY(${translateY}px)`,
        opacity: isDismissing ? 0 : opacity,
        transition: isDragging ? 'none' : 'transform 0.2s ease-out, opacity 0.2s ease-out',
      }}
    >
      {children}
    </div>
  );
}
