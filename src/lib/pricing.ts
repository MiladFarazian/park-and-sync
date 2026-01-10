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
 * Calculate EV charging fee based on premium per hour and hours.
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
 * Calculate total booking cost for driver.
 * - driverSubtotal: driver_rate × hours (includes invisible upcharge)
 * - serviceFee: 20% of host earnings or $1 min (visible to driver)
 * - evChargingFee: optional EV charging premium
 * - driverTotal: driverSubtotal + serviceFee + evChargingFee
 * - hostEarnings: what the host actually earns (their rate × hours)
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
  const hostEarnings = hostHourlyRate * hours;
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
