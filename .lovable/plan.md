

# Refine Platform Pricing: 10% Driver Service Fee + 10% Host Platform Fee

## Overview

This change updates the pricing model across the entire Parkzy platform to:

**For Drivers:**
- Pay the host's listed rate PLUS a 10% service fee
- Example: Host lists at $15/hr → Driver pays $15 + $1.50 = **$16.50**

**For Hosts:**
- Receive their listed rate MINUS a 10% platform fee
- Example: Host lists at $15/hr → Host receives $15 - $1.50 = **$13.50**

This means Parkzy takes 20% total ($3.00 in the example above): 10% from the driver-facing service fee + 10% from the host's earnings.

---

## Current State (What Needs to Change)

| Component | Current Logic |
|-----------|---------------|
| `calculateDriverPrice()` | Returns host rate unchanged (no upcharge) |
| `calculateServiceFee()` | max(20% of host earnings, $1.00) |
| Host earnings | `host_rate × hours` (no deduction) |
| Host UI | Shows "To Parkzy" as the service fee, but that's driver-paid |

**Current flow (example: $15/hr, 2 hours):**
- Driver subtotal: $15 × 2 = $30
- Service fee: max($30 × 0.20, $1) = $6
- Driver total: $36
- Host earnings: $30 (no platform fee deducted)

---

## New Pricing Logic

### Core Formula

```text
Given: host_rate, hours

DRIVER SIDE:
  driverSubtotal = host_rate × hours
  serviceFee = driverSubtotal × 0.10  (10% of subtotal)
  driverTotal = driverSubtotal + serviceFee + evChargingFee (if any)

HOST SIDE:
  hostGross = host_rate × hours
  platformFee = hostGross × 0.10  (10% of host gross)
  hostNetEarnings = hostGross - platformFee

EV CHARGING (if applicable):
  evChargingFee = ev_premium × hours
  (No platform fee on EV charging - goes 100% to host)
```

### Example Calculation

| Item | Value |
|------|-------|
| Host Rate | $15/hr |
| Duration | 2 hours |
| Driver Subtotal | $15 × 2 = $30.00 |
| Service Fee (10%) | $3.00 |
| **Driver Total** | **$33.00** |
| Host Gross | $15 × 2 = $30.00 |
| Platform Fee (10%) | $3.00 |
| **Host Net** | **$27.00** |
| **Parkzy Revenue** | **$6.00** (18.2% of driver total) |

---

## Files to Modify

### 1. Frontend Pricing Library

**File:** `src/lib/pricing.ts`

Update all functions:

```typescript
// Service fee: 10% of driver subtotal
export function calculateServiceFee(driverSubtotal: number): number {
  return Math.round(driverSubtotal * 0.10 * 100) / 100;
}

// Platform fee: 10% of host gross (for host-side display)
export function calculatePlatformFee(hostGross: number): number {
  return Math.round(hostGross * 0.10 * 100) / 100;
}

// Host net earnings after platform fee
export function calculateHostNetEarnings(hostGross: number): number {
  const platformFee = calculatePlatformFee(hostGross);
  return Math.round((hostGross - platformFee) * 100) / 100;
}

// calculateBookingTotal - return all values for both driver and host
export function calculateBookingTotal(...) {
  const hostGross = hostHourlyRate * hours;
  const platformFee = calculatePlatformFee(hostGross);
  const hostNetEarnings = hostGross - platformFee;
  
  const driverSubtotal = hostHourlyRate * hours; // Same as host gross
  const serviceFee = calculateServiceFee(driverSubtotal);
  const evChargingFee = willUseEvCharging ? evPremium * hours : 0;
  const driverTotal = driverSubtotal + serviceFee + evChargingFee;
  
  return {
    hostGross,
    platformFee,
    hostNetEarnings,
    driverSubtotal,
    serviceFee,
    evChargingFee,
    driverTotal,
  };
}
```

---

### 2. Backend Pricing Library (Edge Functions)

**File:** `supabase/functions/_shared/pricing.ts`

Mirror the frontend changes exactly to ensure consistency.

---

### 3. Edge Functions (Backend)

Update pricing calculations in these functions:

| Function | Changes |
|----------|---------|
| `create-booking/index.ts` | Update service fee (10% of subtotal), store `host_earnings` as net (after 10% deduction) |
| `create-guest-booking/index.ts` | Same pricing updates |
| `extend-booking/index.ts` | Apply 10%/10% to extension hours |
| `modify-booking-times/index.ts` | Apply new fee structure to time modifications |
| `verify-guest-payment/index.ts` | Already reads from metadata, no formula change needed |
| `stripe-webhooks/index.ts` | Already reads stored values, no formula change needed |

**Key change in edge functions:**

```typescript
// OLD
const serviceFee = Math.max(hostEarnings * 0.20, 1.00);
const hostEarningsStored = hostHourlyRate * hours;

// NEW
const driverSubtotal = hostHourlyRate * hours;
const serviceFee = driverSubtotal * 0.10;  // 10% service fee
const hostGross = hostHourlyRate * hours;
const platformFee = hostGross * 0.10;  // 10% platform fee
const hostNetEarnings = hostGross - platformFee;  // This is what gets stored
```

---

### 4. Host Earnings Utility

**File:** `src/lib/hostEarnings.ts`

Update `getHostNetEarnings()` to:
1. Prefer the stored `host_earnings` value (which will now be net after platform fee)
2. Fallback: calculate `hourly_rate × hours × 0.90` (net after 10% fee)

Update `getParkzyFee()` to reflect the new structure.

---

### 5. UI Components (Driver Side)

**File:** `src/pages/Booking.tsx`

Update the "Price Breakdown" card:
- Line 1: `$X/hr × Y hours` → subtotal
- Line 2: "Service fee (10%)" → service fee
- Line 3: "EV charging" (if applicable)
- Total

The tooltip text should be updated:
> "This fee helps cover platform costs and ensures secure payments."

---

### 6. UI Components (Host Side)

**File:** `src/pages/HostBookingConfirmation.tsx`

Update the "Payout Breakdown" card:
- Line 1: "Gross earnings (X hrs × $Y)" → host gross
- Line 2: "Platform fee (10%)" → platform fee (shown as deduction)
- Line 3: "EV Charging (to Host)" (if applicable, no fee)
- Separator
- "Host Payout" → net earnings

Current lines 421-458 need to be updated to show:
- Host gross instead of just "To Host"
- Platform fee as a visible deduction
- Correct net payout calculation

---

### 7. Other Affected Files

| File | Change |
|------|--------|
| `src/pages/SpotDetail.tsx` | `calculateDriverPrice()` still returns host rate (no change needed) |
| `src/pages/Explore.tsx` | Uses `calculateBookingTotal()` for map pins - will auto-update |
| `src/components/booking/BookingModal.tsx` | Legacy modal - update fee calculation |
| `src/components/booking/ExtendParkingDialog.tsx` | Update extension fee display |
| `src/pages/BookingDetail.tsx` | May need updates for showing price breakdown |

---

## Database Considerations

The `bookings` table stores:
- `subtotal`: Driver subtotal (unchanged - still `rate × hours`)
- `platform_fee`: Currently stored as service fee; will now store service fee (driver side)
- `host_earnings`: Will now store NET earnings (after 10% platform fee deduction)
- `total_amount`: Driver total (subtotal + service fee + EV)

**No schema changes needed** - just different values being stored.

---

## Summary of Changes

| Area | Files |
|------|-------|
| Frontend pricing library | `src/lib/pricing.ts` |
| Backend pricing library | `supabase/functions/_shared/pricing.ts` |
| Booking creation | `supabase/functions/create-booking/index.ts` |
| Guest booking | `supabase/functions/create-guest-booking/index.ts` |
| Booking extension | `supabase/functions/extend-booking/index.ts` |
| Time modification | `supabase/functions/modify-booking-times/index.ts` |
| Host earnings utility | `src/lib/hostEarnings.ts` |
| Driver booking UI | `src/pages/Booking.tsx` |
| Host confirmation UI | `src/pages/HostBookingConfirmation.tsx` |
| Legacy booking modal | `src/components/booking/BookingModal.tsx` |

---

## Testing Recommendations

After implementation:

1. **Create a new booking** and verify:
   - Driver sees correct 10% service fee
   - Host confirmation shows correct 10% platform fee deduction
   - Database stores correct `host_earnings` (net)

2. **Test booking extension** and verify:
   - Extension fees follow 10%/10% model
   - Host earnings increment correctly

3. **Test EV charging booking** and verify:
   - EV premium goes 100% to host (no platform fee on EV)
   - Service fee is only on parking subtotal

