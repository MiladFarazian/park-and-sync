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
const LIST_SPOT_DRAFT_KEY = 'listSpotDraft';
const FLOW_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

export interface StripeFlowState {
  returnRoute: string;
  timestamp: number;
  action: 'stripe_setup';
  context?: 'list_spot' | 'profile';
}

export interface PhotoDraft {
  dataUrl: string;
  name: string;
  type: string;
}

export interface ListSpotDraft {
  formData: {
    category: string;
    address: string;
    hourlyRate: string;
    description: string;
    parkingInstructions: string;
  };
  selectedAmenities: string[];
  instantBook: boolean;
  availabilityRules: any[];
  evChargingInstructions: string;
  evChargingPremium: string;
  evChargerType: string | null;
  selectedVehicleSizes: string[];
  addressCoordinates: { lat: number; lng: number } | null;
  photos?: PhotoDraft[];
  primaryPhotoIndex?: number;
  timestamp: number;
}

/**
 * Convert File to data URL for localStorage storage
 */
export const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

/**
 * Convert data URL back to File object
 */
export const dataUrlToFile = (dataUrl: string, filename: string, mimeType: string): File => {
  const arr = dataUrl.split(',');
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mimeType });
};

/**
 * Save list spot draft before navigating to Stripe
 */
export const saveListSpotDraft = (draft: Omit<ListSpotDraft, 'timestamp'>): void => {
  const draftData: ListSpotDraft = {
    ...draft,
    timestamp: Date.now(),
  };
  localStorage.setItem(LIST_SPOT_DRAFT_KEY, JSON.stringify(draftData));
};

/**
 * Get saved list spot draft if it exists and is still valid
 */
export const getListSpotDraft = (): ListSpotDraft | null => {
  try {
    const saved = localStorage.getItem(LIST_SPOT_DRAFT_KEY);
    if (!saved) return null;
    
    const draft: ListSpotDraft = JSON.parse(saved);
    
    // Check if draft is expired
    if (Date.now() - draft.timestamp > FLOW_EXPIRY_MS) {
      clearListSpotDraft();
      return null;
    }
    
    return draft;
  } catch {
    return null;
  }
};

/**
 * Clear saved list spot draft
 */
export const clearListSpotDraft = (): void => {
  localStorage.removeItem(LIST_SPOT_DRAFT_KEY);
};

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
