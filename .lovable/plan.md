
# Plan: Fix Demand Notification Trigger for Explore Page Searches

## Problem Summary

When a driver searches for parking in Sawtelle and finds zero available spots, the host at 10 Speed Coffee (1947 Sawtelle Blvd) is **never notified** due to a radius mismatch in the demand notification logic.

## Root Cause

The `search-spots-lite` edge function only triggers demand notifications when:
```typescript
if (transformedSpots.length === 0 && radius <= HALF_MILE_METERS) {  // 804 meters
```

However, the Explore page **always** sends searches with a radius of 5,000-15,000 meters (`EXPANDED_RADIUS_METERS = 15000`), which means the condition `radius <= 804` is never satisfied.

**Evidence from edge function logs:**
- All searches show `radius: 5000` or `radius: 12188`
- The 0.5-mile threshold (804m) is never met
- The `notify-hosts-demand` function has zero logs - it's never being called

## Solution

Change the trigger logic from checking the **search radius** to checking if **zero spots were found within 0.5 miles of the search center**, regardless of the total search radius.

### Code Changes

**File: `supabase/functions/search-spots-lite/index.ts`**

**Current logic (lines 545-548):**
```typescript
// Check if we should trigger demand notifications to hosts
// Conditions: zero spots found AND search radius is 0.5 miles or less
let demandNotificationSent = false;
if (transformedSpots.length === 0 && radius <= HALF_MILE_METERS) {
```

**New logic:**
```typescript
// Check if we should trigger demand notifications to hosts
// Conditions: zero spots found within 0.5 miles of search center
let demandNotificationSent = false;
const spotsWithinHalfMile = transformedSpots.filter(s => s.distance <= HALF_MILE_METERS);
if (spotsWithinHalfMile.length === 0) {
```

This change means:
- Even with a 15km search radius, if there are zero spots within 0.5 miles of where the driver searched, hosts nearby get notified
- If there ARE spots within 0.5 miles but just not available (filtered out by time/bookings), hosts still get notified
- Preserves the intended user experience: "I need parking near HERE, not 5 miles away"

## Technical Details

| Aspect | Before | After |
|--------|--------|-------|
| Trigger condition | `radius <= 804m` | `0 spots within 804m` |
| Explore page (radius=5000m+) | Never triggers | Triggers correctly |
| Tight searches (radius<804m) | Works | Works (unchanged behavior) |

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/search-spots-lite/index.ts` | Change notification trigger from radius-based to distance-based check |

## Expected Behavior After Fix

When a driver:
1. Searches in Sawtelle
2. The 10 Speed Coffee spot is filtered out (unavailable due to time restrictions: only available midnight-10am)
3. Zero spots appear within 0.5 miles of the search center
4. → The host at 10 Speed Coffee receives a push notification: "Drivers searching nearby! Update your availability today to earn."
