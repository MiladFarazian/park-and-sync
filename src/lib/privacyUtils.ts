/**
 * Privacy utilities for respecting user privacy settings
 */

export interface PrivacySettings {
  privacy_show_profile_photo?: boolean | null;
  privacy_show_full_name?: boolean | null;
  privacy_show_in_reviews?: boolean | null;
}

/**
 * Get display name respecting privacy settings
 * If privacy_show_full_name is false, returns "User" or a fallback
 */
export function getPrivacyAwareName(
  profile: { 
    first_name?: string | null; 
    last_name?: string | null;
    privacy_show_full_name?: boolean | null;
  } | null | undefined,
  fallback: string = 'User'
): string {
  if (!profile) return fallback;
  
  // Default to true if not set
  const showFullName = profile.privacy_show_full_name ?? true;
  
  if (!showFullName) {
    return fallback;
  }
  
  const first = profile.first_name?.trim() || '';
  const lastInitial = profile.last_name?.trim()?.[0] || '';
  
  if (!first && !lastInitial) return fallback;
  return lastInitial ? `${first} ${lastInitial}.` : first;
}

/**
 * Get avatar URL respecting privacy settings
 * If privacy_show_profile_photo is false, returns undefined
 */
export function getPrivacyAwareAvatar(
  profile: {
    avatar_url?: string | null;
    privacy_show_profile_photo?: boolean | null;
  } | null | undefined
): string | undefined {
  if (!profile) return undefined;
  
  // Default to true if not set
  const showPhoto = profile.privacy_show_profile_photo ?? true;
  
  if (!showPhoto) {
    return undefined;
  }
  
  return profile.avatar_url || undefined;
}

/**
 * Check if user should appear in reviews
 */
export function shouldAppearInReviews(
  profile: {
    privacy_show_in_reviews?: boolean | null;
  } | null | undefined
): boolean {
  if (!profile) return true;
  return profile.privacy_show_in_reviews ?? true;
}

/**
 * Get reviewer display info respecting privacy settings
 * For use in review displays
 */
export function getReviewerDisplayInfo(
  profile: {
    first_name?: string | null;
    last_name?: string | null;
    avatar_url?: string | null;
    privacy_show_full_name?: boolean | null;
    privacy_show_profile_photo?: boolean | null;
    privacy_show_in_reviews?: boolean | null;
  } | null | undefined,
  fallbackName: string = 'Anonymous'
): { name: string; avatar: string | undefined } {
  if (!profile) {
    return { name: fallbackName, avatar: undefined };
  }
  
  // If user doesn't want to appear in reviews, show anonymous
  const showInReviews = profile.privacy_show_in_reviews ?? true;
  if (!showInReviews) {
    return { name: fallbackName, avatar: undefined };
  }
  
  return {
    name: getPrivacyAwareName(profile, fallbackName),
    avatar: getPrivacyAwareAvatar(profile)
  };
}
