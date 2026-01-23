/**
 * Application Constants
 * =====================
 *
 * Centralized configuration values and constants used throughout the app.
 * Import from '@/lib/constants' instead of hardcoding values.
 */

// =============================================================================
// Image Paths & Defaults
// =============================================================================

/** Default placeholder image for missing content */
export const PLACEHOLDER_IMAGE = '/placeholder.svg';

/** Parkzy support avatar for chat/messaging */
export const SUPPORT_AVATAR = '/parkzy-support-avatar.png';

/** Default notification icon */
export const NOTIFICATION_ICON = '/parkzy-logo.png';

// =============================================================================
// Branding
// =============================================================================

export const APP_NAME = 'Parkzy';

export const SUPPORT_CONTACT = {
  name: 'Parkzy Support',
  avatar: SUPPORT_AVATAR,
} as const;

// =============================================================================
// Pricing Constants
// =============================================================================

/** Minimum platform upcharge per hour (in dollars) */
export const MIN_PLATFORM_UPCHARGE = 1.0;

/** Platform upcharge percentage (decimal) */
export const PLATFORM_UPCHARGE_RATE = 0.2;

/** Minimum service fee (in dollars) */
export const MIN_SERVICE_FEE = 1.0;

/** Service fee percentage (decimal) */
export const SERVICE_FEE_RATE = 0.2;

// =============================================================================
// Map & Location
// =============================================================================

/** Default map center (Downtown LA) */
export const DEFAULT_MAP_CENTER = {
  lat: 34.0522,
  lng: -118.2437,
} as const;

/** Default search radius in meters */
export const DEFAULT_SEARCH_RADIUS = 5000;

/** Expanded search radius for initial load */
export const EXPANDED_SEARCH_RADIUS = 15000;

// =============================================================================
// Time & Booking
// =============================================================================

/** Minimum booking duration in minutes */
export const MIN_BOOKING_MINUTES = 30;

/** Maximum booking duration in hours */
export const MAX_BOOKING_HOURS = 24;

/** Hold expiration time in minutes */
export const HOLD_EXPIRATION_MINUTES = 5;

/** Time for host to approve non-instant bookings (minutes) */
export const HOST_APPROVAL_TIMEOUT_MINUTES = 60;

// =============================================================================
// UI Constants
// =============================================================================

/** Default avatar fallback text */
export const DEFAULT_AVATAR_FALLBACK = 'U';

/** Toast duration in milliseconds */
export const TOAST_DURATION_MS = 5000;

/** Debounce delay for search inputs (ms) */
export const SEARCH_DEBOUNCE_MS = 300;
