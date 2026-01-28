
# Plan: Fix Map Pin Total Price Reverting to Hourly Rate

## Problem Summary

When the Explore page loads, map pins initially show the correct **total price** (e.g., "$24") but then revert to showing the **hourly rate** (e.g., "$6/hr") after a brief moment.

## Root Cause

There's a race condition between the cache rendering and the background refresh:

1. **Initial render**: Cached spots are loaded instantly with correct `totalPrice` values
2. **Background refresh**: A fresh API call is triggered immediately after
3. **Race condition**: The background refresh runs before React has committed the `startTime`/`endTime` state updates from URL params
4. **Result**: The refresh calculates `totalPrice` with `null` time values, causing it to be `undefined`, which makes pins fall back to hourly rate display

```text
Timeline:
┌──────────────────────────────────────────────────────────────────────┐
│ Initial Load Effect Runs                                            │
│   ├─ setStartTime(startDate)        ← State update queued           │
│   ├─ setEndTime(endDate)            ← State update queued           │
│   ├─ setCachedSpots(...)            ← Shows pins with totalPrice    │
│   └─ fetchNearbySpots(..., false)   ← Background refresh triggered  │
│                                                                      │
│ Background Refresh (runs immediately)                                │
│   └─ effectiveStartTime = null      ← State not committed yet!      │
│   └─ totalPrice = undefined         ← No time range to calculate    │
│   └─ setParkingSpots(...)           ← Overwrites with no totalPrice │
│                                                                      │
│ React Commits State Updates                                          │
│   └─ startTime/endTime now available (too late)                     │
└──────────────────────────────────────────────────────────────────────┘
```

## Solution

**Pass the time values explicitly to the background refresh call** instead of relying on React state (which may not be committed yet).

The fix is already partially in place - the `timeOverride` parameter exists in `fetchNearbySpots`. The issue is that on line 482, the background refresh passes time values, but inside the function, it can still fall back to stale state values.

### Primary Fix (Explore.tsx, line 482)

Currently, the background refresh is called correctly with time override:
```typescript
fetchNearbySpots(desired, EXPANDED_RADIUS_METERS, false, { start: start ? startDate : null, end: end ? endDate : null });
```

But the issue is in `fetchNearbySpots` callback stale closure. The callback has `startTime` and `endTime` in its closure via line 1008:
```typescript
}, [parkingSpots.length, startTime, endTime]);
```

When the background refresh runs, the closure captures the *old* values of `startTime` and `endTime` (which are `null` at mount time).

**The fix**: Update the background refresh call to ensure it uses the time override values throughout the entire function, not falling back to stale state.

### Changes Required

**File: `src/pages/Explore.tsx`**

The `timeOverride` values are correctly passed and used at lines 781-783:
```typescript
const effectiveStartTime = timeOverride?.start ?? startTime;
const effectiveEndTime = timeOverride?.end ?? endTime;
```

However, the issue is the **callback closure** - when `fetchNearbySpots` is called during initial mount, the callback was created with `startTime = null` and `endTime = null` in its closure.

**Solution**: Remove `startTime` and `endTime` from the `useCallback` dependencies since the function should exclusively use `timeOverride` when provided. The function already handles this correctly via `effectiveStartTime/effectiveEndTime`, but React re-creates the callback with stale closures when dependencies change.

**Better solution**: Use refs for the time values instead of state in the callback dependencies, OR ensure the callback always uses the passed `timeOverride` and never falls back to potentially stale closure values during the initial load sequence.

**Simplest fix**: Ensure the background refresh in line 482 doesn't run until after React has committed the state updates. We can do this by wrapping the background refresh in a `setTimeout(..., 0)` to defer it to the next event loop tick, giving React time to commit the state updates.

### Recommended Fix

**Change in `src/pages/Explore.tsx` (lines 478-482)**:

```typescript
// From:
if (cachedSpots) {
  setParkingSpots(cachedSpots);
  setSpotsLoading(false);
  // Still fetch fresh data in background
  fetchNearbySpots(desired, EXPANDED_RADIUS_METERS, false, { start: start ? startDate : null, end: end ? endDate : null });
}

// To:
if (cachedSpots) {
  setParkingSpots(cachedSpots);
  setSpotsLoading(false);
  // Defer background refresh to next tick to ensure time state is committed
  setTimeout(() => {
    fetchNearbySpots(desired, EXPANDED_RADIUS_METERS, false, { start: start ? startDate : null, end: end ? endDate : null });
  }, 0);
}
```

This ensures:
1. Cached spots render instantly with correct `totalPrice`
2. State updates (`setStartTime`, `setEndTime`) are committed
3. Background refresh runs with the correct time values available

## Summary of Changes

| File | Change |
|------|--------|
| `src/pages/Explore.tsx` | Wrap background refresh in `setTimeout(..., 0)` to defer until after React commits state updates |

## Expected Behavior After Fix

1. User navigates to Explore page with time params in URL
2. Cached spots render instantly with correct total prices on map pins
3. React commits the time state updates
4. Background refresh runs with correct time values
5. Fresh spots replace cached spots, still showing correct total prices
6. No visual "flicker" from total → hourly rate
