/**
 * Opens a URL in the most appropriate way based on the device/context:
 * - Desktop: Opens in new tab
 * - Mobile web: Opens in new tab (triggers native browser)
 * - PWA/Standalone: Attempts to open externally, falls back gracefully
 */
export const openExternalUrl = (url: string): boolean => {
  // For all contexts, use window.open with target="_blank"
  // This handles:
  // - Desktop: Opens new tab
  // - Mobile Safari/Chrome: Opens in default browser
  // - PWA: Attempts to open externally
  const newWindow = window.open(url, '_blank', 'noopener,noreferrer');
  
  // If window.open was blocked or failed, try direct navigation
  if (!newWindow) {
    // Use a hidden anchor element for better mobile support
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  }
  
  return true;
};

/**
 * Detects if app is running in standalone/PWA mode
 */
export const isStandaloneMode = (): boolean => {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
};
