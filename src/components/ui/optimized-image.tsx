import React, { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface OptimizedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  /** Show skeleton while loading (default: true) */
  showSkeleton?: boolean;
  /** Use blur-up effect (default: true) */
  blurOnLoad?: boolean;
  /** Aspect ratio for skeleton placeholder */
  aspectRatio?: 'square' | 'video' | 'wide' | 'portrait' | number;
  /** Container className */
  containerClassName?: string;
  /** Priority loading - skip lazy loading for above-fold images */
  priority?: boolean;
  /** Fallback image on error */
  fallbackSrc?: string;
}

const aspectRatioClasses = {
  square: 'aspect-square',
  video: 'aspect-video',
  wide: 'aspect-[21/9]',
  portrait: 'aspect-[3/4]',
};

/**
 * OptimizedImage - A performant image component with:
 * - Native lazy loading
 * - Skeleton placeholder while loading
 * - Smooth fade-in transition
 * - Error fallback
 * - Intersection Observer for deferred loading
 */
export const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  showSkeleton = true,
  blurOnLoad = true,
  aspectRatio,
  containerClassName,
  className,
  priority = false,
  fallbackSrc,
  style,
  ...props
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Use Intersection Observer for lazy loading
  useEffect(() => {
    if (priority || isInView) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: '200px', // Start loading 200px before entering viewport
        threshold: 0,
      }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [priority, isInView]);

  // Reset states when src changes
  useEffect(() => {
    setIsLoaded(false);
    setHasError(false);
  }, [src]);

  const handleLoad = () => {
    setIsLoaded(true);
    setHasError(false);
  };

  const handleError = () => {
    setHasError(true);
    if (fallbackSrc && imgRef.current) {
      imgRef.current.src = fallbackSrc;
    }
  };

  const aspectClass = aspectRatio
    ? typeof aspectRatio === 'string'
      ? aspectRatioClasses[aspectRatio]
      : undefined
    : undefined;

  const aspectStyle =
    typeof aspectRatio === 'number'
      ? { aspectRatio: String(aspectRatio) }
      : undefined;

  const imageSrc = hasError && fallbackSrc ? fallbackSrc : src;

  return (
    <div
      ref={containerRef}
      className={cn('relative overflow-hidden', aspectClass, containerClassName)}
      style={{ ...aspectStyle, ...style }}
    >
      {/* Skeleton placeholder */}
      {showSkeleton && !isLoaded && !hasError && (
        <Skeleton className="absolute inset-0 w-full h-full" />
      )}

      {/* Actual image - only render when in view */}
      {isInView && (
        <img
          ref={imgRef}
          src={imageSrc}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={handleLoad}
          onError={handleError}
          className={cn(
            'w-full h-full object-cover transition-opacity duration-300',
            blurOnLoad && !isLoaded && 'opacity-0',
            blurOnLoad && isLoaded && 'opacity-100',
            className
          )}
          {...props}
        />
      )}
    </div>
  );
};

export default OptimizedImage;
