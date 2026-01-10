/**
 * Stripe Setup Flow Handler for PWA/Standalone Mode
 * 
 * In iOS PWA mode, window.open() is blocked. This utility handles:
 * 1. Detecting standalone mode
 * 2. Saving state before navigating away
 * 3. Using window.location.href for direct navigation
 * 4. Detecting return from Stripe and resuming flow
 */

const STRIPE_FLOW_KEY = 'stripeSetupFlow';
const FLOW_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

export interface StripeFlowState {
  returnRoute: string;
  timestamp: number;
  action: 'stripe_setup';
  context?: 'list_spot' | 'profile';
}

/**
 * Detect if running as standalone PWA (iOS/Android homescreen app)
 */
export const isStandaloneMode = (): boolean => {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true ||
    document.referrer.includes('android-app://')
  );
};

/**
 * Save flow state before navigating to Stripe
 */
export const saveStripeFlowState = (state: Omit<StripeFlowState, 'timestamp' | 'action'>): void => {
  const flowState: StripeFlowState = {
    ...state,
    timestamp: Date.now(),
    action: 'stripe_setup',
  };
  localStorage.setItem(STRIPE_FLOW_KEY, JSON.stringify(flowState));
};

/**
 * Get saved flow state if it exists and is still valid
 */
export const getStripeFlowState = (): StripeFlowState | null => {
  try {
    const saved = localStorage.getItem(STRIPE_FLOW_KEY);
    if (!saved) return null;
    
    const state: StripeFlowState = JSON.parse(saved);
    
    // Check if state is expired
    if (Date.now() - state.timestamp > FLOW_EXPIRY_MS) {
      clearStripeFlowState();
      return null;
    }
    
    return state;
  } catch {
    return null;
  }
};

/**
 * Clear saved flow state
 */
export const clearStripeFlowState = (): void => {
  localStorage.removeItem(STRIPE_FLOW_KEY);
};

/**
 * Navigate to Stripe with proper handling for PWA vs browser mode
 */
export const navigateToStripe = (
  stripeUrl: string,
  options: {
    returnRoute: string;
    context?: 'list_spot' | 'profile';
  }
): void => {
  if (isStandaloneMode()) {
    // PWA mode: Save state and navigate directly
    saveStripeFlowState({
      returnRoute: options.returnRoute,
      context: options.context,
    });
    
    // Direct navigation (replaces PWA context)
    window.location.href = stripeUrl;
  } else {
    // Regular browser: Open in new tab
    const opened = window.open(stripeUrl, '_blank', 'noopener,noreferrer');
    
    if (!opened) {
      // Popup was blocked, try anchor element fallback
      const link = document.createElement('a');
      link.href = stripeUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }
};
