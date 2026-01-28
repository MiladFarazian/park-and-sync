
# Plan: Fix Stale Closure in MapView Causing Price Display Flicker

## Problem Summary

Map pins initially display the correct total price (e.g., "$7") but revert to the hourly rate (e.g., "$3/hr") after approximately 5 seconds. This occurs because:

1. The `MapView` component captures the `onMapMove` callback in a closure when the `mapboxToken` becomes available
2. This closure is never updated when the parent component re-renders with new state
3. When the Mapbox `flyTo` animation completes (~1.5s later) and triggers `moveend`, the stale `onMapMove` callback is called
4. The stale callback has `startTime = null` and `endTime = null` in its scope
5. This triggers a new API call without time filtering, which returns spots without `totalPrice` calculated
6. The map pins update to show hourly rates instead of total prices

## Root Cause Analysis

In `src/components/map/MapView.tsx` (lines 510-573):

```typescript
useEffect(() => {
  // ... map initialization ...
  
  const updateVisibleSpots = () => {
    // ...
    onMapMove?.({ lat, lng }, radiusMeters);  // ← Captures onMapMove from closure
  };
  
  map.current.on('moveend', debouncedUpdate);
  map.current.on('zoomend', debouncedUpdate);
  map.current.once('idle', updateVisibleSpots);
  
}, [mapboxToken]);  // ← Only re-runs when mapboxToken changes, not when onMapMove changes!
```

The `onMapMove` prop is captured in the closure when the effect runs, but the effect only has `mapboxToken` in its dependencies. When the parent re-renders with updated `handleMapMove` (containing current `startTime`/`endTime` values), the MapView effect doesn't re-run, so it continues using the stale callback.

## Solution

Use a **ref** to always access the latest `onMapMove` callback, avoiding stale closures.

### Changes Required

**File: `src/components/map/MapView.tsx`**

1. Create a ref to store the latest `onMapMove` callback:
```typescript
const onMapMoveRef = useRef(onMapMove);
useEffect(() => {
  onMapMoveRef.current = onMapMove;
}, [onMapMove]);
```

2. Update the `updateVisibleSpots` function to use the ref instead of the prop directly:
```typescript
const updateVisibleSpots = () => {
  // ...
  onMapMoveRef.current?.({ lat: centerLat, lng: centerLng }, Math.max(5000, radiusMeters));
};
```

This ensures that when `moveend` fires, the callback executed is always the current one from the parent, not a stale closure.

## Alternative Consideration

We could also add `onMapMove` to the effect's dependency array, but this would cause the map event handlers to be re-attached on every render where `onMapMove` changes. The ref approach is more efficient and doesn't cause unnecessary re-initialization.

## Summary of Changes

| File | Change |
|------|--------|
| `src/components/map/MapView.tsx` | Add `onMapMoveRef` to capture latest callback, use ref in `updateVisibleSpots` |

## Expected Behavior After Fix

1. User navigates to Explore page with time params
2. Cached spots render with correct total prices on map pins
3. `flyTo` animation starts
4. Background refresh runs with correct times → spots still show total prices
5. `flyTo` completes, `moveend` fires
6. `handleMapMove` is called with **current** `startTime`/`endTime` values (not stale null)
7. Subsequent API call includes correct time filtering
8. Spots continue to display total prices
9. No visual flicker from total → hourly rate

## Technical Details

The fix follows a common React pattern for handling callbacks in effects that shouldn't re-run when the callback changes:

```typescript
// Store latest callback in ref
const callbackRef = useRef(callback);
useEffect(() => {
  callbackRef.current = callback;
}, [callback]);

// Use ref in effect that has other dependencies
useEffect(() => {
  someEventEmitter.on('event', () => {
    callbackRef.current?.();  // Always calls latest callback
  });
}, [otherDependency]);
```

This pattern is recommended by the React team for exactly this type of scenario where you want stable event handler registration but always-current callback execution.
