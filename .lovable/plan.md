

## Redirect "Edit Availability" to the New Manage Availability Page

### Problem
The "Edit Availability" button on the Edit Spot page (`/edit-spot/:spotId`) navigates to the old `/edit-availability/:spotId` page (the standalone `EditSpotAvailability` component). It should instead navigate to the new `/manage-availability` page with the spot pre-loaded, matching the behavior of the "Schedule" button on the Dashboard.

### Solution
Update the `onClick` handler in `src/pages/EditSpot.tsx` (line 1136) to navigate to the new manage availability page with the spot ID as a URL parameter.

---

### Technical Details

**File: `src/pages/EditSpot.tsx`**

Change line 1136 from:
```typescript
onClick={() => navigate(`/edit-availability/${spotId}`)}
```
To:
```typescript
onClick={() => navigate(`/manage-availability?tab=recurring&spotId=${spotId}`)}
```

This matches the existing pattern used by the Dashboard's "Schedule" button, which deep-links to the manage availability page with the spot pre-loaded and pre-selected.

### Files to Modify

| File | Change |
|------|--------|
| `src/pages/EditSpot.tsx` | Update navigation target from old route to new manage availability page |

