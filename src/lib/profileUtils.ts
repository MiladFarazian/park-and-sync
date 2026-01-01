/**
 * Profile type for completeness checks.
 * This mirrors the essential fields from AuthContext's Profile interface.
 */
interface ProfileForCompleteness {
  first_name?: string | null;
  email?: string | null;
}

/**
 * Centralized profile completeness check.
 * A profile is considered complete if it has:
 * - first_name (required for receipts and communication)
 * - email (required for payment receipts)
 * 
 * Note: phone_verified is NOT required here because:
 * - Phone OTP users are implicitly verified by completing the OTP flow
 * - Email users verify their email separately
 */
export const isProfileComplete = (profile: ProfileForCompleteness | null): boolean => {
  if (!profile) return false;
  
  const hasFirstName = Boolean(profile.first_name?.trim());
  const hasEmail = Boolean(profile.email?.trim());
  
  return hasFirstName && hasEmail;
};

/**
 * Helper to check what fields are missing from profile
 */
export const getMissingProfileFields = (profile: ProfileForCompleteness | null): string[] => {
  const missing: string[] = [];
  
  if (!profile) {
    return ['profile'];
  }
  
  if (!profile.first_name?.trim()) {
    missing.push('first_name');
  }
  
  if (!profile.email?.trim()) {
    missing.push('email');
  }
  
  return missing;
};
