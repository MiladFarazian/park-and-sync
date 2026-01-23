/**
 * Shared pricing logic for Supabase Edge Functions
 * This mirrors the frontend pricing.ts to ensure consistency
 */

/**
 * Calculate the driver-facing hourly rate from the host's hourly rate.
 * Upcharge: 20% or $1 minimum (whichever is higher) added to host rate.
 */
export function calculateDriverPrice(hostHourlyRate: number): number {
  const upcharge = Math.max(hostHourlyRate * 0.20, 1.00);
  return Math.round((hostHourlyRate + upcharge) * 100) / 100;
}

/**
 * Calculate service fee from host's earnings.
 * 20% or $1 minimum (whichever is higher).
 */
export function calculateServiceFee(hostEarnings: number): number {
  return Math.round(Math.max(hostEarnings * 0.20, 1.00) * 100) / 100;
}

/**
 * Calculate EV charging fee based on premium per hour and hours.
 */
export function calculateEvChargingFee(premiumPerHour: number, hours: number): number {
  return Math.round(premiumPerHour * hours * 100) / 100;
}

/**
 * Calculate total booking cost for driver.
 */
export function calculateBookingTotal(
  hostHourlyRate: number,
  hours: number,
  evChargingPremiumPerHour: number = 0,
  willUseEvCharging: boolean = false
): {
  hostEarnings: number;
  driverHourlyRate: number;
  driverSubtotal: number;
  serviceFee: number;
  evChargingFee: number;
  driverTotal: number;
} {
  const hostEarnings = Math.round(hostHourlyRate * hours * 100) / 100;
  const driverHourlyRate = calculateDriverPrice(hostHourlyRate);
  const driverSubtotal = Math.round(driverHourlyRate * hours * 100) / 100;
  const serviceFee = calculateServiceFee(hostEarnings);
  const evChargingFee = willUseEvCharging ? calculateEvChargingFee(evChargingPremiumPerHour, hours) : 0;
  const driverTotal = Math.round((driverSubtotal + serviceFee + evChargingFee) * 100) / 100;

  return {
    hostEarnings,
    driverHourlyRate,
    driverSubtotal,
    serviceFee,
    evChargingFee,
    driverTotal,
  };
}
