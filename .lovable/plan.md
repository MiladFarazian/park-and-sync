
# Update Schedule Button to Navigate to Manage Availability

## Overview

The "Schedule" button in My Listings (Dashboard) currently navigates to the deprecated `/edit-availability/{spotId}` page. It should instead navigate to `/manage-availability` with the Recurring tab active and the selected spot pre-loaded.

## Changes Required

### 1. Update Dashboard.tsx - Schedule Button Navigation

**Current behavior (line 257):**
```typescript
onClick={() => navigate(`/edit-availability/${listing.id}`)}
```

**New behavior:**
```typescript
onClick={() => navigate(`/manage-availability?tab=recurring&spotId=${listing.id}`)}
```

This will:
- Navigate to the Manage Availability page
- Set the tab to "recurring" (handled by existing `tabParam` logic)
- Pass the spot ID for pre-selection

---

### 2. Update ManageAvailability.tsx - Pre-select Source Spot for Recurring Tab

Add a `useEffect` to initialize `sourceSpotId` and `recurringSelectedSpots` when:
- The tab is `recurring`
- A `spotIdParam` is provided
- Spots have been loaded
- Recurring rules have been fetched

**New useEffect to add (after spots/rules are loaded):**
```typescript
// Pre-select source spot and recurring selected spots when coming from Dashboard
useEffect(() => {
  if (
    activeTab === 'recurring' &&
    spotIdParam &&
    spots.length > 0 &&
    spots.some(s => s.id === spotIdParam) &&
    Object.keys(spotRecurringRules).length > 0
  ) {
    // Set as source spot (loads its schedule into the grid)
    if (!sourceSpotId) {
      setSourceSpotId(spotIdParam);
    }
    // Pre-select for "Apply to" if not already selected
    if (!recurringSelectedSpots.includes(spotIdParam)) {
      setRecurringSelectedSpots(prev => [...prev, spotIdParam]);
    }
  }
}, [activeTab, spotIdParam, spots, spotRecurringRules]);
```

This ensures:
1. The spot's schedule is loaded into the WeeklyScheduleGrid (via `sourceSpotId`)
2. The spot is pre-checked in the "Apply to" section (via `recurringSelectedSpots`)

---

## User Flow After Changes

1. Host clicks "Schedule" on a listing in My Listings
2. Navigates to `/manage-availability?tab=recurring&spotId=xxx`
3. Recurring tab is active
4. The dropdown "Load Schedule From" shows the selected spot
5. The WeeklyScheduleGrid shows that spot's current recurring schedule
6. The spot is pre-checked in "Apply to Spots" section
7. Host can modify the schedule and apply to additional spots if desired

---

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/Dashboard.tsx` | Update navigate path from `/edit-availability/{id}` to `/manage-availability?tab=recurring&spotId={id}` |
| `src/pages/ManageAvailability.tsx` | Add useEffect to pre-select `sourceSpotId` and `recurringSelectedSpots` based on URL params |
