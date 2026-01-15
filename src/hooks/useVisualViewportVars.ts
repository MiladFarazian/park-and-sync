import { useEffect } from 'react';

/**
 * Sets CSS variables based on the visual viewport size.
 * On iOS PWA, this allows the app to respond to the keyboard opening/closing.
 * 
 * CSS Variables set:
 * --app-vvh: The visual viewport height (what's actually visible)
 * --keyboard-inset: The height taken up by the keyboard
 */
export function useVisualViewportVars() {
  useEffect(() => {
    const updateVars = () => {
      const vv = window.visualViewport;
      if (vv) {
        const vvh = vv.height;
        const keyboardInset = Math.max(0, window.innerHeight - vvh - vv.offsetTop);
        
        document.documentElement.style.setProperty('--app-vvh', `${vvh}px`);
        document.documentElement.style.setProperty('--keyboard-inset', `${keyboardInset}px`);
      } else {
        // Fallback for browsers without visualViewport
        document.documentElement.style.setProperty('--app-vvh', '100dvh');
        document.documentElement.style.setProperty('--keyboard-inset', '0px');
      }
    };

    // Initial set
    updateVars();

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', updateVars);
      vv.addEventListener('scroll', updateVars);
      
      return () => {
        vv.removeEventListener('resize', updateVars);
        vv.removeEventListener('scroll', updateVars);
      };
    }
  }, []);
}
