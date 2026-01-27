
# Plan: Display Total Booking Price on Map Pins

## Overview
Currently, map pins on the Explore page show the hourly rate (e.g., "$6/hr"). This change will update them to display the **total estimated price** for the selected booking period (e.g., "$14" for a 2-hour booking), making it easier for drivers to compare spots at a glance.

The spot cards in the sidebar will remain unchanged - they will continue to show the hourly rate.

## Technical Changes

### 1. Update Spot Interface (MapView.tsx)
Add an optional `totalPrice` property to the `Spot` interface:

```text
interface Spot {
  ...existing properties...
  totalPrice?: number;  // NEW: Total booking cost for the selected duration
}
```

### 2. Calculate Total Price in Explore.tsx
When transforming the fetched spots, calculate the total booking price using the existing `calculateBookingTotal()` utility:

- Import `calculateBookingTotal` from `@/lib/pricing`
- Calculate hours from `startTime` and `endTime`
- For each spot, compute `driverTotal` and add it as `totalPrice`

### 3. Update Map Pin Price Display (MapView.tsx)
Change the feature properties to use `totalPrice` when available:

**Before (line 711):**
```text
price: `$${spot.hourlyRate}`
```

**After:**
```text
price: spot.totalPrice 
  ? `$${Math.round(spot.totalPrice)}`  // Show whole dollar for totals
  : `$${spot.hourlyRate}/hr`           // Fallback to hourly if no duration
```

### 4. Files Modified

| File | Change |
|------|--------|
| `src/components/map/MapView.tsx` | Add `totalPrice` to Spot interface, update price display logic |
| `src/pages/Explore.tsx` | Import pricing utility, calculate total for each spot before passing to MapView |

## User Experience

| Before | After |
|--------|-------|
| Map pins show "$6" (hourly rate) | Map pins show "$14" (total for booking period) |
| Users must mentally calculate total | Total is immediately visible |
| Spot cards show "$6/hr" | Spot cards still show "$6/hr" (unchanged) |

## Edge Cases

- **No times selected**: Falls back to showing hourly rate with "/hr" suffix
- **Very long bookings**: Prices will show whole dollars (rounded) to keep pins readable
- **EV charging**: Total includes EV charging premium if the EV filter is active
