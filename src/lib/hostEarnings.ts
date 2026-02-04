import { differenceInMinutes } from 'date-fns';
import { calculatePlatformFee } from './pricing';

interface BookingForEarnings {
  host_earnings?: number | null;
  hourly_rate?: number;
  start_at?: string;
  end_at?: string;
  total_amount?: number;
  extension_charges?: number | null;
  ev_charging_fee?: number | null;
}

/**
 * Get the host's net earnings from a booking.
 *
 * Host net earnings = (hourly_rate × hours) × 0.90 + EV charging fee
 * The 10% platform fee is deducted from the parking portion.
 * EV charging goes 100% to host.
 *
 * ALWAYS calculates from hourly_rate × hours to ensure consistency with
 * the current 10%/10% pricing model, regardless of what was stored in
 * the host_earnings field (which may have been calculated with old pricing).
 */
export function getHostNetEarnings(booking: BookingForEarnings): number {
  // Always calculate from raw booking data to ensure 10%/10% pricing model
  if (booking.hourly_rate && booking.start_at && booking.end_at) {
    const startDate = new Date(booking.start_at);
    const endDate = new Date(booking.end_at);
    const totalMinutes = differenceInMinutes(endDate, startDate);
    const hours = totalMinutes / 60;

    if (hours > 0) {
      // Host gross = hourly_rate × hours (hourly_rate is the host's rate)
      const hostGross = booking.hourly_rate * hours;
      // Platform fee = 10% of host gross
      const platformFee = calculatePlatformFee(hostGross);
      // Net parking = host gross - platform fee
      const netParking = hostGross - platformFee;
      // EV charging goes 100% to host
      const evChargingFee = booking.ev_charging_fee ?? 0;
      return Math.round((netParking + evChargingFee) * 100) / 100;
    }
  }

  // Fallback: use stored host_earnings if raw data not available
  if (booking.host_earnings != null && booking.host_earnings > 0) {
    return Math.round(booking.host_earnings * 100) / 100;
  }

  // Last resort: return 0 (never use total_amount as it's driver-facing)
  return 0;
}

/**
 * Calculate what Parkzy took from a booking (driver service fee + host platform fee).
 * This is the difference between what the driver paid and what the host earned.
 */
export function getParkzyFee(booking: BookingForEarnings): number {
  const hostEarnings = getHostNetEarnings(booking);
  const driverPaid = booking.total_amount || 0;
  
  return Math.round(Math.max(0, driverPaid - hostEarnings) * 100) / 100;
}
