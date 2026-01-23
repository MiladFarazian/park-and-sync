

## Show Availability for All Spots Regardless of Selection

### Problem
Currently, spot availability is only fetched and displayed for selected spots. Non-selected spots show "Select to view" which hides useful information from hosts.

### Solution
Update the page to fetch and display availability for **all spots**, not just selected ones.

### Technical Changes

**File:** `src/pages/ManageAvailability.tsx`

#### 1. Update `fetchAvailabilityData()` to fetch for all spots

Change the loop to iterate over `spots` instead of `selectedSpots`:

```typescript
// Before (line 166):
for (const spotId of selectedSpots) {

// After:
for (const spotId of spots.map(s => s.id)) {
```

Also update the condition that triggers the fetch (line 107):

```typescript
// Before:
if (selectedSpots.length > 0 && user && selectedDates.length > 0) {

// After:
if (spots.length > 0 && user && selectedDates.length > 0) {
```

#### 2. Simplify `getSpotAvailabilityDisplay()` 

Remove the selection check since we now fetch for all spots:

```typescript
const getSpotAvailabilityDisplay = (spotId: string): { text: string; isLoading: boolean } => {
  const data = spotAvailability[spotId];
  if (!data) {
    return { text: 'Loading...', isLoading: true };
  }
  
  // ... rest of existing logic unchanged
};
```

#### 3. Update the spot card rendering

Simplify the availability display since it no longer depends on selection state:

```tsx
<div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
  {availabilityInfo.isLoading ? (
    <Loader2 className="h-3 w-3 animate-spin" />
  ) : (
    <Clock className="h-3 w-3" />
  )}
  {availabilityInfo.text}
</div>
```

### Files to Modify
- `src/pages/ManageAvailability.tsx`

### Expected Behavior After Fix
- All spots display their current availability immediately on page load
- Loading states appear briefly for all spots while data is fetched
- Selecting/deselecting spots no longer affects what availability info is shown
- Hosts can see availability at a glance before deciding which spots to edit

