/**
 * Calculate the driver-facing hourly rate from the host's hourly rate.
 * Invisible upcharge: 20% or $1 minimum (whichever is higher) added to host rate.
 * Drivers see this as "Host Rate" - they don't know about the upcharge.
 */
export function calculateDriverPrice(hostHourlyRate: number): number {
  const upcharge = Math.max(hostHourlyRate * 0.20, 1.00);
  return Math.round((hostHourlyRate + upcharge) * 100) / 100;
}

/**
 * Calculate service fee from host's earnings.
 * 20% or $1 minimum (whichever is higher).
 * This is a separate visible line item for drivers.
 */
export function calculateServiceFee(hostEarnings: number): number {
  return Math.round(Math.max(hostEarnings * 0.20, 1.00) * 100) / 100;
}

/**
 * Calculate total booking cost for driver.
 * - driverSubtotal: driver_rate × hours (includes invisible upcharge)
 * - serviceFee: 20% of host earnings or $1 min (visible to driver)
 * - driverTotal: driverSubtotal + serviceFee
 * - hostEarnings: what the host actually earns (their rate × hours)
 */
export function calculateBookingTotal(hostHourlyRate: number, hours: number): {
  hostEarnings: number;
  driverHourlyRate: number;
  driverSubtotal: number;
  serviceFee: number;
  driverTotal: number;
} {
  const hostEarnings = hostHourlyRate * hours;
  const driverHourlyRate = calculateDriverPrice(hostHourlyRate);
  const driverSubtotal = Math.round(driverHourlyRate * hours * 100) / 100;
  const serviceFee = calculateServiceFee(hostEarnings);
  const driverTotal = Math.round((driverSubtotal + serviceFee) * 100) / 100;
  
  return {
    hostEarnings,
    driverHourlyRate,
    driverSubtotal,
    serviceFee,
    driverTotal,
  };
}
