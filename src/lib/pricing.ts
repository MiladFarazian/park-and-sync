/**
 * Platform pricing model:
 * - Driver pays: host rate + 10% service fee
 * - Host receives: host rate - 10% platform fee
 * - Parkzy revenue: 20% total (10% from driver + 10% from host)
 *
 * Example: Host lists at $15/hr, 2-hour booking
 * - Driver subtotal: $15 × 2 = $30
 * - Service fee (10%): $3
 * - Driver total: $33
 * - Host gross: $30
 * - Platform fee (10%): $3
 * - Host net: $27
 * - Parkzy revenue: $6 (18.2% of driver total)
 */

/**
 * Calculate the driver-facing hourly rate from the host's hourly rate.
 * Driver sees the host rate directly (no hidden upcharge).
 */
export function calculateDriverPrice(hostHourlyRate: number): number {
  return Math.round(hostHourlyRate * 100) / 100;
}

/**
 * Calculate service fee from driver subtotal.
 * 10% of driver subtotal (visible to driver).
 */
export function calculateServiceFee(driverSubtotal: number): number {
  return Math.round(driverSubtotal * 0.10 * 100) / 100;
}

/**
 * Calculate platform fee from host gross earnings.
 * 10% of host gross (deducted from host earnings).
 */
export function calculatePlatformFee(hostGross: number): number {
  return Math.round(hostGross * 0.10 * 100) / 100;
}

/**
 * Calculate host net earnings after platform fee.
 */
export function calculateHostNetEarnings(hostGross: number): number {
  const platformFee = calculatePlatformFee(hostGross);
  return Math.round((hostGross - platformFee) * 100) / 100;
}

/**
 * Calculate EV charging fee based on premium per hour and hours.
 * EV charging goes 100% to host (no platform fee on EV charging).
 */
export function calculateEvChargingFee(premiumPerHour: number, hours: number): number {
  return Math.round(premiumPerHour * hours * 100) / 100;
}

/**
 * Calculate combined hourly rate including EV charging premium.
 * Used for displaying combined price when EV charging is selected.
 */
export function calculateCombinedHourlyRate(hostHourlyRate: number, evChargingPremium: number = 0): number {
  const driverRate = calculateDriverPrice(hostHourlyRate);
  return Math.round((driverRate + evChargingPremium) * 100) / 100;
}

/**
 * Calculate total booking cost for both driver and host.
 * 
 * Returns:
 * - hostGross: host rate × hours
 * - platformFee: 10% of host gross (deducted from host)
 * - hostNetEarnings: what host actually receives (hostGross - platformFee + evChargingFee)
 * - driverSubtotal: host rate × hours (same as hostGross)
 * - serviceFee: 10% of driverSubtotal (added to driver total)
 * - evChargingFee: optional EV charging premium (100% to host)
 * - driverTotal: driverSubtotal + serviceFee + evChargingFee
 */
export function calculateBookingTotal(
  hostHourlyRate: number, 
  hours: number,
  evChargingPremiumPerHour: number = 0,
  willUseEvCharging: boolean = false
): {
  hostGross: number;
  platformFee: number;
  hostNetEarnings: number;
  hostEarnings: number; // Alias for hostNetEarnings for backwards compatibility
  driverHourlyRate: number;
  driverSubtotal: number;
  serviceFee: number;
  evChargingFee: number;
  driverTotal: number;
} {
  const hostGross = Math.round(hostHourlyRate * hours * 100) / 100;
  const platformFee = calculatePlatformFee(hostGross);
  const evChargingFee = willUseEvCharging ? calculateEvChargingFee(evChargingPremiumPerHour, hours) : 0;
  const hostNetEarnings = Math.round((hostGross - platformFee) * 100) / 100;
  
  const driverHourlyRate = calculateDriverPrice(hostHourlyRate);
  const driverSubtotal = Math.round(driverHourlyRate * hours * 100) / 100;
  const serviceFee = calculateServiceFee(driverSubtotal);
  const driverTotal = Math.round((driverSubtotal + serviceFee + evChargingFee) * 100) / 100;
  
  return {
    hostGross,
    platformFee,
    hostNetEarnings,
    hostEarnings: hostNetEarnings, // Backwards compatibility alias
    driverHourlyRate,
    driverSubtotal,
    serviceFee,
    evChargingFee,
    driverTotal,
  };
}
