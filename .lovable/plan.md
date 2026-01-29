
# Remove Hidden Driver Rate Upcharge from Platform Pricing

## Overview

This plan eliminates the "secret" upcharge applied to the driver's hourly rate. Currently, drivers see an inflated rate (host rate + 20% or $1 minimum) without knowing about it. After this change, the driver's displayed rate will exactly match what the host sets.

**Current pricing model:**
- Host sets rate: $5/hr
- Driver sees: $6/hr (invisible $1 markup)
- Service fee: $2 (20% of $10 host earnings for 2 hours)
- Driver total: $6 × 2 + $2 = $14

**New pricing model (simplified):**
- Host sets rate: $5/hr
- Driver sees: $5/hr (same as host rate)
- Service fee: $2 (20% of $10 host earnings for 2 hours)
- Driver total: $5 × 2 + $2 = $12

---

## Files to Modify

| Category | File | Changes |
|----------|------|---------|
| Core Pricing | `src/lib/pricing.ts` | Remove upcharge from `calculateDriverPrice`, update `calculateBookingTotal` |
| Core Pricing | `supabase/functions/_shared/pricing.ts` | Mirror changes to shared edge function pricing |
| Frontend Display | `src/pages/SpotDetail.tsx` | Remove `calculateDriverPrice` calls, use raw `hourlyRate` |
| Frontend Display | `src/pages/Booking.tsx` | Update pricing display and calculations |
| Frontend Display | `src/pages/Explore.tsx` | Remove reverse-engineering of host rate logic |
| Frontend Display | `src/pages/SearchResults.tsx` | Remove `calculateDriverPrice` call |
| Frontend Display | `src/components/map/MapView.tsx` | Update price pin display if needed |
| Edge Functions | `supabase/functions/create-booking/index.ts` | Remove upcharge calculation |
| Edge Functions | `supabase/functions/create-guest-booking/index.ts` | Remove upcharge (already uses shared pricing) |
| Edge Functions | `supabase/functions/extend-booking/index.ts` | Remove upcharge calculation |
| Edge Functions | `supabase/functions/modify-booking-times/index.ts` | Remove upcharge calculation |
| Edge Functions | `supabase/functions/search-spots-lite/index.ts` | No changes needed (returns raw host rate) |

---

## Technical Implementation Details

### 1. `src/lib/pricing.ts` - Core Frontend Pricing

```typescript
// BEFORE: Added invisible upcharge
export function calculateDriverPrice(hostHourlyRate: number): number {
  const upcharge = Math.max(hostHourlyRate * 0.20, 1.00);
  return Math.round((hostHourlyRate + upcharge) * 100) / 100;
}

// AFTER: Driver rate equals host rate (no upcharge)
export function calculateDriverPrice(hostHourlyRate: number): number {
  return Math.round(hostHourlyRate * 100) / 100;
}
```

The `calculateBookingTotal` function will automatically reflect this change since it calls `calculateDriverPrice` internally.

### 2. `supabase/functions/_shared/pricing.ts` - Backend Pricing

Apply the same change to ensure consistency between frontend and backend:

```typescript
// AFTER: No upcharge
export function calculateDriverPrice(hostHourlyRate: number): number {
  return Math.round(hostHourlyRate * 100) / 100;
}
```

### 3. `src/pages/SpotDetail.tsx` - Spot Detail Page

Multiple places call `calculateDriverPrice(spot.hourlyRate)`. After the change, these will return the correct value, but we can simplify the code to use `spot.hourlyRate` directly:

**Lines 757-771**: Update price display
```typescript
// BEFORE
<p className="text-2xl font-bold">${calculateDriverPrice(spot.hourlyRate).toFixed(2)}</p>

// AFTER (simplified - calculateDriverPrice now returns same value)
<p className="text-2xl font-bold">${spot.hourlyRate.toFixed(2)}</p>
```

### 4. `src/pages/Explore.tsx` - Map and Search Results

**Lines 287-296 and 943-968**: Remove the reverse-engineering of host rate from driver rate

Currently the code does complex math to figure out what the host rate was:
```typescript
// BEFORE: Reverse-engineer host rate from driver rate
let hostHourlyRate: number;
if (driverHourlyRate > 6) {
  hostHourlyRate = driverHourlyRate / 1.20;
} else {
  hostHourlyRate = driverHourlyRate - 1;
}
```

This becomes unnecessary:
```typescript
// AFTER: Driver rate IS host rate
const hostHourlyRate = spot.hourly_rate;
const driverHourlyRate = hostHourlyRate;
```

### 5. `supabase/functions/create-booking/index.ts`

**Lines 170-195**: Remove upcharge calculation

```typescript
// BEFORE: Lines 180-184
const upcharge = Math.max(hostHourlyRate * 0.20, 1.00);
const driverHourlyRate = hostHourlyRate + upcharge;
const driverSubtotal = Math.round(driverHourlyRate * totalHours * 100) / 100;

// AFTER: No upcharge
const driverHourlyRate = hostHourlyRate;
const driverSubtotal = Math.round(driverHourlyRate * totalHours * 100) / 100;
```

### 6. `supabase/functions/extend-booking/index.ts`

**Lines 169-181**: Remove upcharge from extension pricing

```typescript
// BEFORE
const upcharge = Math.max(hostHourlyRate * 0.20, 1.00);
const driverHourlyRate = hostHourlyRate + upcharge;
const driverSubtotal = Math.round(driverHourlyRate * extensionHours * 100) / 100;

// AFTER
const driverHourlyRate = hostHourlyRate;
const driverSubtotal = Math.round(driverHourlyRate * extensionHours * 100) / 100;
```

### 7. `supabase/functions/modify-booking-times/index.ts`

**Lines around 77-89**: Remove upcharge from time modification pricing

```typescript
// BEFORE
const upcharge = Math.max(hostHourlyRate * 0.20, 1.00);
const driverHourlyRate = hostHourlyRate + upcharge;

// AFTER
const driverHourlyRate = hostHourlyRate;
```

### 8. `src/pages/SearchResults.tsx`

**Line 116**: Remove `calculateDriverPrice` wrapper

```typescript
// BEFORE
hourlyRate: spot.driver_hourly_rate || calculateDriverPrice(parseFloat(spot.hourly_rate)),

// AFTER
hourlyRate: parseFloat(spot.hourly_rate),
```

---

## What Stays the Same

- **Service Fee**: The visible 20% service fee (or $1 minimum) based on host earnings remains unchanged
- **EV Charging Premium**: Optional EV charging fees remain unchanged
- **Host Earnings**: What hosts receive stays the same (their rate × hours)
- **Platform Revenue**: Will come solely from the visible service fee now (reduced from ~28% to ~20% of driver payment)

---

## Pricing Example After Change

| Item | Before | After |
|------|--------|-------|
| Host sets rate | $5/hr | $5/hr |
| Driver sees hourly | $6/hr | $5/hr |
| 2-hour subtotal | $12.00 | $10.00 |
| Service fee | $2.00 | $2.00 |
| **Driver Total** | **$14.00** | **$12.00** |
| Host Receives | $10.00 | $10.00 |
| Platform Revenue | $4.00 | $2.00 |

---

## Impact Summary

1. **Transparency**: Drivers see the exact rate hosts set
2. **Simplicity**: Removes confusing reverse-engineering calculations in Explore page
3. **Consistency**: Same pricing logic across all booking flows (new, extend, modify)
4. **Revenue Impact**: Platform revenue decreases (hidden markup eliminated) - only visible service fee remains

---

## Testing Checklist

After implementation, verify:
- [ ] Explore page shows correct hourly rates from spots table
- [ ] Spot detail page shows host's actual rate
- [ ] Booking page calculates correct totals without hidden markup
- [ ] Guest booking flow charges correct amount
- [ ] Booking extensions charge correct additional amount
- [ ] Time modifications calculate correct price differences
- [ ] Map pins show correct total prices for selected duration
- [ ] All emails show correct pricing
