/**
 * Calculate the driver-facing price from the host's hourly rate.
 * Platform adds 20% or $1 minimum (whichever is higher).
 */
export function calculateDriverPrice(hostHourlyRate: number): number {
  const platformFee = Math.max(hostHourlyRate * 0.20, 1.00);
  return Math.round((hostHourlyRate + platformFee) * 100) / 100;
}

/**
 * Calculate platform fee from host's hourly rate.
 * 20% or $1 minimum (whichever is higher).
 */
export function calculatePlatformFee(hostHourlyRate: number): number {
  return Math.max(hostHourlyRate * 0.20, 1.00);
}

/**
 * Calculate total booking cost for driver.
 */
export function calculateBookingTotal(hostHourlyRate: number, hours: number): {
  hostEarnings: number;
  platformFee: number;
  driverTotal: number;
} {
  const hostEarnings = hostHourlyRate * hours;
  const platformFee = Math.max(hostEarnings * 0.20, 1.00);
  const driverTotal = Math.round((hostEarnings + platformFee) * 100) / 100;
  
  return {
    hostEarnings,
    platformFee: Math.round(platformFee * 100) / 100,
    driverTotal,
  };
}
