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

        // Also scroll the main content container if it exists (for mobile layout)
        const mainContent = document.querySelector('[data-scroll-container]');
        if (mainContent) {
          mainContent.scrollTop = 0;
        }
      }

      prevPathname.current = pathname;
    }
  }, [pathname]);

  return null;
};

export default ScrollToTop;
