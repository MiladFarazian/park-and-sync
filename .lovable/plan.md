

# Plan: Fix Frontend Stale Cache Issue

## Root Cause Analysis

The spot `ad82bb051e91` is appearing on the Explore page outside its availability window due to **stale frontend cache**, not a backend bug.

**Evidence:**
1. **Backend logs confirm the fix is working**: `"Filtered out 1 unavailable spots (availability rules/overrides)"`
2. **Frontend console logs show cache hits**: `Cache hit { "key": "explore-region-...", "age": "222s" }`
3. The cache was created before the availability fix was deployed, so it contains the incorrectly-included spot

### The Caching Bug

In `Explore.tsx` lines 776-784, there's a logic error:

```typescript
// Line 478 says: "Still fetch fresh data in background"
fetchNearbySpots(desired, EXPANDED_RADIUS_METERS, false, ...);

// But inside fetchNearbySpots (lines 779-784):
if (cachedData && !isInitialLoad) {
  setParkingSpots(cachedData);  // Sets stale data
  setSpotsLoading(false);
  return;  // RETURNS without making API call!
}
```

When `isInitialLoad = false` (background refresh), the function returns cached data immediately instead of making a fresh API call to update the UI.

## Solution

Fix the caching logic so background refreshes actually fetch fresh data and update the cache:

### Code Changes

**File: `src/pages/Explore.tsx`**

**Change 1:** Remove the early return for background refreshes (lines 776-785)

Replace:
```typescript
if (!evChargerTypeFilter && !skipCache) {
  const cachedData = findCoveringCache(center.lat, center.lng, radius, timeKey);
  if (cachedData && !isInitialLoad) {
    setParkingSpots(cachedData);
    setSpotsLoading(false);
    return;
  }
}
```

With:
```typescript
if (!evChargerTypeFilter && !skipCache && isInitialLoad) {
  // Only check cache for initial loads, not background refreshes
  // Background refreshes should always hit the API to get fresh data
  const cachedData = findCoveringCache(center.lat, center.lng, radius, timeKey);
  if (cachedData) {
    // Show cached data immediately while fetching fresh data
    setParkingSpots(cachedData);
    setSpotsLoading(false);
    // Don't return - continue to make API call
  }
}
```

Wait - this would still return early. Let me reconsider the logic.

**Corrected approach:**

The current flow:
1. Page loads → checks cache → cache hit → shows cached data
2. Calls `fetchNearbySpots` with `isInitialLoad = false` for background refresh
3. Background refresh sees cached data exists + `!isInitialLoad` → returns early without API call

The intended flow:
1. Page loads → checks cache → cache hit → shows cached data
2. Calls `fetchNearbySpots` with `isInitialLoad = false` for background refresh
3. Background refresh should **skip the cache check** and make a fresh API call
4. Fresh data replaces stale cached data

**Fix:**

Remove the condition that returns cached data for background refreshes:

```typescript
if (!evChargerTypeFilter && !skipCache) {
  const cachedData = findCoveringCache(center.lat, center.lng, radius, timeKey);
  if (cachedData && isInitialLoad) {
    // Initial load can use cache, background refreshes should hit API
    setParkingSpots(cachedData);
    setSpotsLoading(false);
    return;
  }
}
```

Change `!isInitialLoad` to `isInitialLoad` - this way:
- Initial loads: Check cache, if hit return early (data already shown from caller)
- Background refreshes: Skip the return, always make API call

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/Explore.tsx` | Fix cache logic so background refreshes actually fetch fresh data |

## Verification

After the fix:
1. The spot should disappear from the map within seconds of page load (after background refresh completes)
2. Console logs should show API call being made even when cache exists
3. New cached data should have correct availability filtering

