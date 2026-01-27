
# Plan: Fix Double-Upcharge on Map Pin Prices

## Problem Identified
The map pin prices are being calculated incorrectly due to a **double application of the platform markup**:

1. The `search-spots-lite` edge function already converts the host's base rate to the driver rate by adding the 20%/$1 markup before returning it as `hourly_rate`
2. `Explore.tsx` then passes this already-marked-up rate to `calculateBookingTotal()`, which applies the markup **again**

### Example of the Bug
| Step | Value |
|------|-------|
| Host sets rate | $5/hr |
| Endpoint applies markup | $5 + $1 = **$6/hr** (returned as `hourly_rate`) |
| Explore.tsx treats $6 as host rate | `calculateBookingTotal(6, 2)` |
| Function applies markup again | $6 + $1.20 = $7.20/hr |
| Subtotal | $7.20 × 2 = $14.40 |
| Service fee (on wrong base) | max($12 × 0.20, $1) = $2.40 |
| **Wrong total** | **$16.80 ≈ $17** |
| **Expected total** | **$14** |

## Solution
Update `Explore.tsx` to calculate the total price correctly since the endpoint already returns the driver rate. Instead of using `calculateBookingTotal()` (which expects a host rate), we should:

1. Use the returned `hourly_rate` directly as the driver rate (no additional markup)
2. Calculate the service fee based on the **original host earnings** (driver rate minus the embedded markup)

### Implementation

**File: `src/pages/Explore.tsx`** (lines 753-763)

Replace the current calculation:
```typescript
const hostHourlyRate = spot.hourly_rate;
// ...
const booking = calculateBookingTotal(hostHourlyRate, bookingHours, evPremium, willUseEvCharging);
totalPrice = booking.driverTotal;
```

With correct calculation:
```typescript
// spot.hourly_rate from lite endpoint is ALREADY the driver rate (host rate + markup)
const driverHourlyRate = spot.hourly_rate;
const evPremium = spot.ev_charging_premium_per_hour || 0;

let totalPrice: number | undefined;
if (bookingHours) {
  const willUseEvCharging = evChargerTypeFilter != null && spot.has_ev_charging;
  
  // Driver subtotal is simply the displayed rate × hours
  const driverSubtotal = driverHourlyRate * bookingHours;
  
  // Reverse-engineer host rate to calculate correct service fee
  // If driver rate = host rate + max(host rate × 0.20, $1), we need to find host rate
  // For rates where 20% > $1 (i.e., host rate > $5): driverRate = hostRate × 1.20
  // For rates where 20% ≤ $1 (i.e., host rate ≤ $5): driverRate = hostRate + $1
  let hostHourlyRate: number;
  if (driverHourlyRate > 6) {
    // High rate: markup was 20%, so hostRate = driverRate / 1.20
    hostHourlyRate = driverHourlyRate / 1.20;
  } else {
    // Low rate: markup was $1, so hostRate = driverRate - $1
    hostHourlyRate = driverHourlyRate - 1;
  }
  
  const hostEarnings = hostHourlyRate * bookingHours;
  const serviceFee = Math.max(hostEarnings * 0.20, 1.00);
  const evChargingFee = willUseEvCharging ? evPremium * bookingHours : 0;
  
  totalPrice = Math.round((driverSubtotal + serviceFee + evChargingFee) * 100) / 100;
}
```

### Verification
With the fix, a $6/hr spot for 2 hours:
- Driver subtotal: $6 × 2 = $12
- Host rate (reverse): $6 - $1 = $5/hr
- Host earnings: $5 × 2 = $10
- Service fee: max($10 × 0.20, $1) = $2
- **Total: $12 + $2 = $14** ✓

## Files Modified

| File | Change |
|------|--------|
| `src/pages/Explore.tsx` | Fix total price calculation to avoid double-applying the platform markup |

## Edge Cases Handled
- **Low host rates (≤$5)**: Markup is $1 flat, so hostRate = driverRate - $1
- **High host rates (>$5)**: Markup is 20%, so hostRate = driverRate / 1.20
- **EV charging**: EV premium is added correctly on top
- **No booking duration**: Falls back to hourly rate display (existing behavior)
