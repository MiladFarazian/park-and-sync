/**
 * Extracts just the street address (and unit if present) from a full address.
 * Removes city, state, and zip code.
 * 
 * @param fullAddress - The complete address string
 * @returns The street address portion only
 */
export const getStreetAddress = (fullAddress: string | null | undefined): string => {
  if (!fullAddress) return '';
  
  // Split by comma and take the first part (street address)
  // This handles formats like "123 Main St, Los Angeles, CA 90001"
  const parts = fullAddress.split(',');
  
  if (parts.length === 0) return fullAddress;
  
  // If there's a unit/apt, it might be in the second part before the city
  // e.g., "123 Main St, Apt 4, Los Angeles, CA 90001"
  if (parts.length >= 3) {
    const secondPart = parts[1]?.trim() || '';
    // Check if second part looks like a unit (Apt, Unit, Suite, #, etc.)
    const unitPatterns = /^(apt|unit|suite|ste|#|bldg|building|floor|fl)\b/i;
    if (unitPatterns.test(secondPart)) {
      return `${parts[0].trim()}, ${secondPart}`;
    }
  }
  
  return parts[0].trim();
};
