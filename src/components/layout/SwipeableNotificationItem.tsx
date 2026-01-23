import * as React from "react";
import { useRef, useState, useCallback } from "react";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface SwipeableNotificationItemProps {
  children: React.ReactNode;
  onMarkAsRead: () => void;
  onNavigate: () => void;
  isRead: boolean;
}

const DISMISS_THRESHOLD = 80; // pixels to trigger action
const VELOCITY_THRESHOLD = 0.4; // pixels per ms
const MIN_MOVEMENT = 5; // minimum pixels before treating as intentional swipe

// Haptic feedback helper
const triggerHaptic = async (style: 'light' | 'medium' | 'heavy' = 'light') => {
  try {
    const impactStyle = style === 'light' ? ImpactStyle.Light 
      : style === 'medium' ? ImpactStyle.Medium 
      : ImpactStyle.Heavy;
    await Haptics.impact({ style: impactStyle });
  } catch {
    if ('vibrate' in navigator) {
      const duration = style === 'light' ? 10 : style === 'medium' ? 20 : 30;
      navigator.vibrate(duration);
    }
  }
};

export function SwipeableNotificationItem({ 
  children, 
  onMarkAsRead, 
  onNavigate,
  isRead 
}: SwipeableNotificationItemProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [translateX, setTranslateX] = useState(0);
  const [isActioning, setIsActioning] = useState(false);
  const [hasTriggeredThresholdHaptic, setHasTriggeredThresholdHaptic] = useState(false);
  
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const isHorizontalSwipeRef = useRef<boolean | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
    };
    isHorizontalSwipeRef.current = null;
    setIsDragging(false);
    setHasTriggeredThresholdHaptic(false);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - touchStartRef.current.x;
    const deltaY = currentY - touchStartRef.current.y;

    // Determine if this is a horizontal swipe on first significant movement
    if (isHorizontalSwipeRef.current === null && (Math.abs(deltaX) > MIN_MOVEMENT || Math.abs(deltaY) > MIN_MOVEMENT)) {
      isHorizontalSwipeRef.current = Math.abs(deltaX) > Math.abs(deltaY);
    }

    // Only handle horizontal swipes
    if (!isHorizontalSwipeRef.current) return;

    e.preventDefault(); // Prevent scroll when swiping horizontally
    setIsDragging(true);
    
    // Swipe left: mark as read (negative deltaX)
    // Swipe right: navigate (positive deltaX)
    setTranslateX(deltaX);

    // Trigger haptic when crossing threshold
    if (Math.abs(deltaX) > DISMISS_THRESHOLD && !hasTriggeredThresholdHaptic) {
      triggerHaptic('light');
      setHasTriggeredThresholdHaptic(true);
    }
  }, [hasTriggeredThresholdHaptic]);

  const handleTouchEnd = useCallback(() => {
    if (!touchStartRef.current || !isDragging) {
      touchStartRef.current = null;
      isHorizontalSwipeRef.current = null;
      setTranslateX(0);
      setIsDragging(false);
      return;
    }

    const endTime = Date.now();
    const duration = endTime - touchStartRef.current.time;
    const velocityX = Math.abs(translateX) / duration;

    // Check for swipe left (mark as read)
    if (translateX < -DISMISS_THRESHOLD || (translateX < 0 && velocityX > VELOCITY_THRESHOLD)) {
      if (!isRead) {
        setIsActioning(true);
        triggerHaptic('medium');
        // Animate out to the left then mark as read
        setTranslateX(-100);
        setTimeout(() => {
          onMarkAsRead();
          setTranslateX(0);
          setIsActioning(false);
        }, 200);
      } else {
        setTranslateX(0);
      }
    }
    // Check for swipe right (navigate)
    else if (translateX > DISMISS_THRESHOLD || (translateX > 0 && velocityX > VELOCITY_THRESHOLD)) {
      triggerHaptic('medium');
      onNavigate();
      setTranslateX(0);
    }
    // Snap back to original position
    else {
      setTranslateX(0);
    }

    touchStartRef.current = null;
    isHorizontalSwipeRef.current = null;
    setIsDragging(false);
  }, [isDragging, translateX, isRead, onMarkAsRead, onNavigate]);

  // Calculate progress towards threshold for visual feedback
  const swipeProgress = Math.min(Math.abs(translateX) / DISMISS_THRESHOLD, 1);
  const isSwipingLeft = translateX < 0;
  const isSwipingRight = translateX > 0;

  return (
    <div 
      ref={containerRef}
      className="relative overflow-hidden"
    >
      {/* Background reveal for swipe left (mark as read) */}
      <div 
        className={cn(
          "absolute inset-0 flex items-center justify-end px-4 transition-colors",
          isSwipingLeft && swipeProgress > 0.5 ? "bg-primary" : "bg-muted"
        )}
      >
        <div 
          className={cn(
            "flex items-center gap-2 text-sm font-medium transition-all duration-200",
            isSwipingLeft && swipeProgress > 0.5 ? "text-primary-foreground scale-110" : "text-muted-foreground"
          )}
          style={{
            opacity: isSwipingLeft ? swipeProgress : 0,
            transform: `scale(${0.8 + swipeProgress * 0.2})`
          }}
        >
          <Check className="h-5 w-5" />
          <span>Mark read</span>
        </div>
      </div>

      {/* Background reveal for swipe right (navigate) */}
      <div 
        className={cn(
          "absolute inset-0 flex items-center justify-start px-4 transition-colors",
          isSwipingRight && swipeProgress > 0.5 ? "bg-accent" : "bg-muted"
        )}
      >
        <div 
          className={cn(
            "flex items-center gap-2 text-sm font-medium transition-all duration-200",
            isSwipingRight && swipeProgress > 0.5 ? "text-accent-foreground scale-110" : "text-muted-foreground"
          )}
          style={{
            opacity: isSwipingRight ? swipeProgress : 0,
            transform: `scale(${0.8 + swipeProgress * 0.2})`
          }}
        >
          <span>View →</span>
        </div>
      </div>

      {/* Main content */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        className="relative bg-background"
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isDragging || isActioning ? 'none' : 'transform 0.2s ease-out',
        }}
      >
        {children}
      </div>
    </div>
  );
}
