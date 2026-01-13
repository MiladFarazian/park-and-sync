import { differenceInMinutes } from 'date-fns';

interface BookingForEarnings {
  host_earnings?: number | null;
  hourly_rate?: number;
  start_at?: string;
  end_at?: string;
  total_amount?: number;
  extension_charges?: number | null;
}

/**
 * Get the host's net earnings from a booking.
 * 
 * For bookings with extensions, we always recalculate from hourly_rate × hours
 * because older bookings may not have had host_earnings updated during extension.
 * 
 * For bookings without extensions:
 * 1. Use host_earnings field (preferred, accurate net amount)
 * 2. Fallback: calculate from hourly_rate × hours
 * 
 * Never returns total_amount as that includes driver upcharge + service fee.
 */
export function getHostNetEarnings(booking: BookingForEarnings): number {
  // For bookings with extensions, always recalculate to ensure accuracy
  // This handles legacy data where host_earnings wasn't updated on extension
  const hasExtensions = (booking.extension_charges ?? 0) > 0;
  
  if (hasExtensions && booking.hourly_rate && booking.start_at && booking.end_at) {
    const startDate = new Date(booking.start_at);
    const endDate = new Date(booking.end_at);
    const totalMinutes = differenceInMinutes(endDate, startDate);
    const hours = totalMinutes / 60;
    
    if (hours > 0) {
      return Math.round(booking.hourly_rate * hours * 100) / 100;
    }
  }
  
  // For non-extended bookings, prefer the stored host_earnings value
  if (booking.host_earnings != null && booking.host_earnings > 0) {
    return Math.round(booking.host_earnings * 100) / 100;
  }
  
  // Fallback: calculate from hourly_rate × duration
  if (booking.hourly_rate && booking.start_at && booking.end_at) {
    const startDate = new Date(booking.start_at);
    const endDate = new Date(booking.end_at);
    const totalMinutes = differenceInMinutes(endDate, startDate);
    const hours = totalMinutes / 60;
    
    if (hours > 0) {
      return Math.round(booking.hourly_rate * hours * 100) / 100;
    }
  }
  
  // Last resort: return 0 (never use total_amount as it's driver-facing)
  return 0;
}

/**
 * Calculate what Parkzy took from a booking (for optional host breakdown).
 * This is the difference between what the driver paid and what the host earned.
 */
export function getParkzyFee(booking: BookingForEarnings): number {
  const hostEarnings = getHostNetEarnings(booking);
  const driverPaid = booking.total_amount || 0;
  
  return Math.round(Math.max(0, driverPaid - hostEarnings) * 100) / 100;
}
