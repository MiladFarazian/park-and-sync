import React, { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface OptimizedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  className?: string;
  placeholderClassName?: string;
  containerClassName?: string;
  priority?: boolean;
}

/**
 * Optimized image component with:
 * - Lazy loading (only loads when in viewport)
 * - Fade-in animation when loaded
 * - Blur placeholder
 * - Error handling with fallback
 */
export const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  className,
  placeholderClassName,
  containerClassName,
  priority = false,
  ...props
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(priority); // If priority, load immediately
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (priority || !imgRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: '200px', // Start loading 200px before viewport
        threshold: 0.01,
      }
    );

    observer.observe(imgRef.current);
    return () => observer.disconnect();
  }, [priority]);

  return (
    <div className={cn('relative overflow-hidden', className)} ref={imgRef}>
      {/* Skeleton placeholder */}
      <div
        className={cn(
          'absolute inset-0 bg-muted animate-pulse transition-opacity duration-300',
          placeholderClassName,
          isLoaded ? 'opacity-0' : 'opacity-100'
        )}
      />

      {/* Only load image when in viewport */}
      {isInView && !hasError && (
        <img
          src={src}
          alt={alt}
          className={cn(
            'w-full h-full object-cover transition-opacity duration-300',
            isLoaded ? 'opacity-100' : 'opacity-0'
          )}
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
          loading="lazy"
          decoding="async"
          {...props}
        />
      )}

      {hasError && (
        <div className="absolute inset-0 bg-muted flex items-center justify-center">
          <span className="text-muted-foreground text-xs">No image</span>
        </div>
      )}
    </div>
  );
};

export default OptimizedImage;
