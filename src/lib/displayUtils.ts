/**
 * Display utilities for formatting user information
 */

/**
 * Format display name as "First Name + Last Initial" (e.g., "Milad F.")
 */
export function formatDisplayName(
  profile: { first_name?: string | null; last_name?: string | null } | null | undefined,
  fallback: string = 'User'
): string {
  if (!profile) return fallback;
  const first = profile.first_name?.trim() || '';
  const lastInitial = profile.last_name?.trim()?.[0] || '';
  if (!first && !lastInitial) return fallback;
  return lastInitial ? `${first} ${lastInitial}.` : first;
}
