
# Align Pricing Across Platform: 10% Service Fee + Total Price on Map/Cards

## Overview

This change ensures the new 10%/10% pricing model (10% driver service fee, 10% host platform fee) is consistently applied everywhere, and updates map pins + spot cards to show the **total booking price** (including service fee) instead of just the hourly rate.

---

## Current Issues

| Location | Current Behavior | Issue |
|----------|------------------|-------|
| **Explore.tsx** (map pins) | Uses old formula: `Math.max(hostEarnings * 0.20, 1.00)` | Wrong fee calculation |
| **search-spots/index.ts** | Uses old formula: `Math.max(effectiveHostRate * 0.20, 1.00)` | Wrong fee calculation |
| **BookingModal.tsx** | Uses 15% platform fee | Wrong fee percentage |
| **DesktopSpotList.tsx** | Shows hourly rate only (`$X.XX/hr`) | Should show total booking price |
| **MapView.tsx** | Shows total if available, else hourly rate | Correct logic but relies on Explore.tsx calculation |

---

## Changes Required

### 1. Frontend: Explore.tsx (Price Calculation for Map Pins)

**File:** `src/pages/Explore.tsx`
**Lines:** ~290-298 and ~960-968

Update the total price calculation to use the new 10% service fee formula:

**Current (around line 294 and 964):**
```typescript
const serviceFee = Math.max(hostEarnings * 0.20, 1.00);
```

**New:**
```typescript
const serviceFee = driverSubtotal * 0.10;  // 10% service fee
```

This appears in two places:
1. Real-time subscription handler (~line 294)
2. `fetchNearbySpots` callback (~line 964)

---

### 2. Backend: search-spots/index.ts (Full Search Endpoint)

**File:** `supabase/functions/search-spots/index.ts`
**Lines:** 382-384

Update the driver price calculation:

**Current:**
```typescript
const platformFee = Math.max(effectiveHostRate * 0.20, 1.00);
const driverPrice = Math.round((effectiveHostRate + platformFee) * 100) / 100;
```

**New:**
```typescript
// Driver sees host rate; service fee (10%) added at checkout
// For display purposes, we still return the effective host rate
// The frontend calculates total price including service fee
```

Actually, looking at this more carefully, `search-spots` returns a `driver_hourly_rate` which was the upcharged rate. With the new transparent model, drivers see the host rate directly. The total price calculation should happen in the frontend.

**Change to:**
```typescript
// No upcharge on hourly rate - driver sees host rate directly
// Service fee (10%) is added at checkout
const driverPrice = Math.round(effectiveHostRate * 100) / 100;
```

---

### 3. Frontend: DesktopSpotList.tsx (Spot Cards)

**File:** `src/components/explore/DesktopSpotList.tsx`
**Lines:** 630-655

Update spot cards to show **total booking price** when time range is selected, similar to map pins.

**Current behavior:** Shows `$X.XX per hour`

**New behavior:** 
- When booking duration is known: Show `$XX total` (like map pins)
- When no duration: Show `$X.XX/hr` as fallback

Add a `totalPrice` display like the map pins already do. The `Spot` interface already has `totalPrice?: number` so we just need to use it.

**Update lines 630-655:**
```tsx
<div className="text-right flex-shrink-0">
  {/* Show total price if available, otherwise hourly rate */}
  {spot.totalPrice ? (
    <>
      <p className="font-bold text-lg">${Math.round(spot.totalPrice)}</p>
      <p className="text-xs text-muted-foreground">total</p>
    </>
  ) : filters.evCharging && spot.hasEvCharging && (spot.evChargingPremium ?? 0) > 0 ? (
    // EV charging - show combined hourly
    <>
      <p className="font-bold text-lg">${(spot.hourlyRate + (spot.evChargingPremium ?? 0)).toFixed(2)}</p>
      <p className="text-xs text-muted-foreground flex items-center justify-end gap-0.5">
        <Zap className="h-3 w-3 text-green-600" />
        /hr incl. charging
      </p>
    </>
  ) : (
    // Default hourly rate
    <>
      <p className="font-bold text-lg">${spot.hourlyRate.toFixed(2)}</p>
      <p className="text-xs text-muted-foreground">per hour</p>
    </>
  )}
</div>
```

---

### 4. Frontend: BookingModal.tsx (Legacy Modal)

**File:** `src/components/booking/BookingModal.tsx`
**Lines:** 84-85

Update to use 10% service fee instead of 15%:

**Current:**
```typescript
const platformFee = subtotal * 0.15; // 15% platform fee
```

**New:**
```typescript
const serviceFee = subtotal * 0.10; // 10% service fee
```

Also update variable naming and UI labels for consistency.

---

### 5. Frontend: MapView.tsx (Already Correct)

**File:** `src/components/map/MapView.tsx`
**Lines:** 718-721

The map pins already show total price when available:
```typescript
const priceDisplay = spot.totalPrice 
  ? `$${Math.round(spot.totalPrice)}`
  : `$${spot.hourlyRate}/hr`;
```

No changes needed here - it relies on `totalPrice` calculated in Explore.tsx.

---

## Summary of Files to Modify

| File | Change |
|------|--------|
| `src/pages/Explore.tsx` | Update service fee: `0.20` → `0.10` (2 places) |
| `supabase/functions/search-spots/index.ts` | Remove upcharge from driver_hourly_rate |
| `src/components/explore/DesktopSpotList.tsx` | Show total price on cards when available |
| `src/components/booking/BookingModal.tsx` | Update fee: `0.15` → `0.10` |

---

## Technical Details

### New Price Display Logic

**Map Pins & Spot Cards (when duration is selected):**
```typescript
const bookingHours = (endTime - startTime) / (1000 * 60 * 60);
const driverSubtotal = hostHourlyRate * bookingHours;
const serviceFee = driverSubtotal * 0.10;  // 10% service fee
const evChargingFee = hasEvCharging ? evPremium * bookingHours : 0;
const totalPrice = driverSubtotal + serviceFee + evChargingFee;
```

**Map Pin Display:**
- With duration: `$45` (total)
- Without duration: `$15/hr`

**Spot Card Display:**
- With duration: `$45 total`
- Without duration: `$15.00 per hour`

### Consistency Check

After these changes:
- **Booking.tsx**: Shows breakdown (subtotal + 10% service fee + EV = total) ✓
- **BookingDetail.tsx**: Shows breakdown for drivers ✓
- **Explore map pins**: Shows total price with 10% fee ✓
- **Explore spot cards**: Shows total price with 10% fee ✓
- **search-spots endpoint**: Returns host rate (no upcharge) ✓
- **create-booking endpoint**: Already uses 10%/10% model ✓

---

## Testing Recommendations

After implementation:
1. Search for spots on Explore page → verify map pins show correct total
2. Verify spot cards show same total as map pins
3. Click through to Book → verify price breakdown matches
4. Complete a booking → verify final charge matches displayed price
