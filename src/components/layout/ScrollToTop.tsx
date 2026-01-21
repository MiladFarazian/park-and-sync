import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Scrolls to top when navigating between routes.
 * Excludes certain pages where scroll position should be preserved.
 */
const ScrollToTop = () => {
  const { pathname } = useLocation();
  const prevPathname = useRef(pathname);

  // Pages that should NOT reset scroll position
  const excludedPaths = [
    '/messages',
    '/support-messages',
  ];

  useEffect(() => {
    // Only scroll to top if the path actually changed (not on initial mount with same path)
    if (prevPathname.current !== pathname) {
      // Check if the new path should be excluded
      const shouldExclude = excludedPaths.some(path => pathname.startsWith(path));

      if (!shouldExclude) {
        // Use instant scroll to avoid jarring animations
        window.scrollTo({ top: 0, behavior: 'instant' });

        // Also scroll all potential scroll containers (mobile and desktop layouts)
        const scrollContainers = document.querySelectorAll('[data-scroll-container]');
        scrollContainers.forEach(container => {
          container.scrollTop = 0;
        });

        // Also reset any overflow-y-auto elements that might be scrollable
        // This catches cases where the main scrollable element doesn't have the data attribute
        const mainElement = document.querySelector('main');
        if (mainElement) {
          mainElement.scrollTop = 0;
          // Check for scrollable children within main
          const scrollableChild = mainElement.querySelector('.overflow-y-auto');
          if (scrollableChild) {
            scrollableChild.scrollTop = 0;
          }
        }
      }

      prevPathname.current = pathname;
    }
  }, [pathname]);

  return null;
};

export default ScrollToTop;
