
# Plan: Exclude Host's Own Spots from Driver Search Results

## Problem
When a host is searching for parking as a driver, their own listed spots appear in the search results. This is confusing UX since a host would never want to book their own spot.

## Root Cause
Both `search-spots` and `search-spots-lite` Edge Functions retrieve the authenticated user's ID but never use it to filter out spots where `host_id` matches the current user.

## Solution
Add a filter to both Edge Functions to exclude spots owned by the authenticated user when they are searching as a driver.

---

## Technical Implementation

### 1. Update `search-spots-lite` Edge Function

**File:** `supabase/functions/search-spots-lite/index.ts`

After the distance filtering and before further processing, add a filter to exclude the user's own spots:

```text
Location: After line 206 (after the initial distance filter and before EV filter)
```

```javascript
// Exclude spots owned by the current user (hosts shouldn't see their own spots as a driver)
if (userId) {
  spotsWithDistance = spotsWithDistance.filter(spot => spot.host_id !== userId);
}
```

### 2. Update `search-spots` Edge Function

**File:** `supabase/functions/search-spots/index.ts`

Add the same filter in the main loop that builds `availableSpots`:

```text
Location: Inside the loop at line 281, before processing each spot
```

```javascript
// Skip spots owned by the current user
if (userId && spot.host_id === userId) {
  continue;
}
```

---

## Why This Approach

| Consideration | Decision |
|--------------|----------|
| Performance | Filter early to avoid unnecessary DB queries for own spots |
| Consistency | Both Edge Functions get the same filtering logic |
| Backward compatibility | No changes to API response format or client code |
| Edge case: Guest users | Filter only applies when `userId` is present (authenticated users) |

---

## Testing

After implementation:
1. Log in as a host who has listed a spot
2. Switch to Driver mode
3. Search for parking in the area where the host's spot is located
4. Verify the host's own spot does NOT appear in search results
5. Verify other users' spots in the same area DO appear
