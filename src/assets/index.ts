/**
 * Centralized Asset Management
 * ============================
 *
 * All image assets should be imported and exported from this file.
 * This provides:
 * - Single source of truth for asset imports
 * - Type-safe asset references
 * - Easy asset path updates
 * - Better tree-shaking and bundle optimization
 *
 * Usage:
 * ```typescript
 * import { logos, spotImages, PLACEHOLDER_IMAGE } from '@/assets';
 *
 * // Use logos
 * <img src={logos.primary} alt="Parkzy" />
 *
 * // Use spot images with fallback
 * <img src={getSpotImage(imageKey) || PLACEHOLDER_IMAGE} />
 * ```
 */

// =============================================================================
// Logos
// =============================================================================
import parkzyLogo from './parkzy-logo.png';
import parkzyLogoWhite from './parkzy-logo-white.png';

export const logos = {
  primary: parkzyLogo,
  white: parkzyLogoWhite,
  /** @deprecated Use logos.primary instead */
  dark: parkzyLogo,
} as const;

// =============================================================================
// Hero & Marketing Images
// =============================================================================
import heroParking from './hero-parking.jpg';
import inglewoodHero from './inglewood.jpg';

export const marketing = {
  hero: inglewoodHero,
  heroLegacy: heroParking,
} as const;

// =============================================================================
// Spot/Location Images (for demo/seed data)
// =============================================================================
import uscGarage from './usc-garage.jpg';
import expositionDriveway from './exposition-driveway.jpg';
import santaMonicaPier from './santa-monica-pier.jpg';
import thirdStreetGarage from './third-street-garage.jpg';
import sunsetStrip from './sunset-strip.jpg';
import rodeoDrive from './rodeo-drive.jpg';
import veniceBeach from './venice-beach.jpg';
import staplesCenter from './staples-center.jpg';
import vermontExpositionLot from './vermont-exposition-lot.jpg';
import westAdamsMansion from './west-adams-mansion.jpg';
import mainStreetVeniceBorder from './main-street-venice-border.jpg';
import picoBusinessHub from './pico-business-hub.jpg';
import smcCollegeArea from './smc-college-area.jpg';
import wilshireOfficeComplex from './wilshire-office-complex.jpg';
import melroseDesignDistrict from './melrose-design-district.jpg';
import santaMonicaBlvdHub from './santa-monica-blvd-hub.jpg';
import beverlyHillsCityHall from './beverly-hills-city-hall.jpg';
import abbotKinneyCreative from './abbot-kinney-creative.jpg';
import veniceCanalsHistoric from './venice-canals-historic.jpg';
import artsDistrictLoft from './arts-district-loft.jpg';
import grandCentralMarket from './grand-central-market.jpg';
import littleTokyoCultural from './little-tokyo-cultural.jpg';
import financialDistrictHighrise from './financial-district-highrise.jpg';
import hollywoodWalkFame from './hollywood-walk-fame.jpg';
import griffithObservatoryArea from './griffith-observatory-area.jpg';

export const spotImages = {
  uscGarage,
  expositionDriveway,
  santaMonicaPier,
  thirdStreetGarage,
  sunsetStrip,
  rodeoDrive,
  veniceBeach,
  staplesCenter,
  vermontExpositionLot,
  westAdamsMansion,
  mainStreetVeniceBorder,
  picoBusinessHub,
  smcCollegeArea,
  wilshireOfficeComplex,
  melroseDesignDistrict,
  santaMonicaBlvdHub,
  beverlyHillsCityHall,
  abbotKinneyCreative,
  veniceCanalsHistoric,
  artsDistrictLoft,
  grandCentralMarket,
  littleTokyoCultural,
  financialDistrictHighrise,
  hollywoodWalkFame,
  griffithObservatoryArea,
} as const;

// Map legacy /src/assets/* paths to actual imported images
// This is needed for data that references images by path string
const legacyPathMap: Record<string, string> = {
  '/src/assets/usc-garage.jpg': uscGarage,
  '/src/assets/exposition-driveway.jpg': expositionDriveway,
  '/src/assets/santa-monica-pier.jpg': santaMonicaPier,
  '/src/assets/third-street-garage.jpg': thirdStreetGarage,
  '/src/assets/sunset-strip.jpg': sunsetStrip,
  '/src/assets/rodeo-drive.jpg': rodeoDrive,
  '/src/assets/venice-beach.jpg': veniceBeach,
  '/src/assets/staples-center.jpg': staplesCenter,
  '/src/assets/vermont-exposition-lot.jpg': vermontExpositionLot,
  '/src/assets/west-adams-mansion.jpg': westAdamsMansion,
  '/src/assets/main-street-venice-border.jpg': mainStreetVeniceBorder,
  '/src/assets/pico-business-hub.jpg': picoBusinessHub,
  '/src/assets/smc-college-area.jpg': smcCollegeArea,
  '/src/assets/wilshire-office-complex.jpg': wilshireOfficeComplex,
  '/src/assets/melrose-design-district.jpg': melroseDesignDistrict,
  '/src/assets/santa-monica-blvd-hub.jpg': santaMonicaBlvdHub,
  '/src/assets/beverly-hills-city-hall.jpg': beverlyHillsCityHall,
  '/src/assets/abbot-kinney-creative.jpg': abbotKinneyCreative,
  '/src/assets/venice-canals-historic.jpg': veniceCanalsHistoric,
  '/src/assets/arts-district-loft.jpg': artsDistrictLoft,
  '/src/assets/grand-central-market.jpg': grandCentralMarket,
  '/src/assets/little-tokyo-cultural.jpg': littleTokyoCultural,
  '/src/assets/financial-district-highrise.jpg': financialDistrictHighrise,
  '/src/assets/hollywood-walk-fame.jpg': hollywoodWalkFame,
  '/src/assets/griffith-observatory-area.jpg': griffithObservatoryArea,
};

/**
 * Resolve a legacy image path to the actual imported image URL.
 * Returns undefined if the path is not found in the map.
 */
export function resolveLegacyImagePath(path: string): string | undefined {
  return legacyPathMap[path];
}

// =============================================================================
// Re-exports from constants for backward compatibility
// =============================================================================
// Note: Prefer importing from '@/lib/constants' directly
import { PLACEHOLDER_IMAGE as PLACEHOLDER, SUPPORT_AVATAR, NOTIFICATION_ICON } from '@/lib/constants';
export { SUPPORT_AVATAR, NOTIFICATION_ICON };
export const PLACEHOLDER_IMAGE = PLACEHOLDER;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get an image URL with fallback to placeholder.
 * Handles legacy paths, uploaded URLs, and undefined values.
 */
export function getImageUrl(
  imageUrl: string | undefined | null,
  fallback: string = PLACEHOLDER_IMAGE
): string {
  if (!imageUrl) return fallback;

  // Check if it's a legacy /src/assets/* path
  const resolved = resolveLegacyImagePath(imageUrl);
  if (resolved) return resolved;

  // Return as-is (could be a URL from storage or other source)
  return imageUrl;
}

/**
 * Get avatar URL with privacy-aware fallback.
 */
export function getAvatarUrl(
  avatarUrl: string | undefined | null,
  fallback: string = PLACEHOLDER_IMAGE
): string {
  return avatarUrl || fallback;
}

// Type exports for TypeScript consumers
export type SpotImageKey = keyof typeof spotImages;
export type LogoKey = keyof typeof logos;
