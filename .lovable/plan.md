
## Fix Spot Availability Display on Selection

### Problem
When a host selects a specific spot in the Manage Availability page, non-selected spots incorrectly display "Loading..." for their hourly availability. This happens because:

1. The `fetchAvailabilityData()` function only fetches data for **selected spots**
2. The `getSpotAvailabilityDisplay()` function returns "Loading..." when no data exists for a spot
3. All spots render this display regardless of selection state

### Solution
Update the UI to only show availability information for **selected spots**. Non-selected spots will display a neutral indicator ("Select to view availability") instead of a misleading "Loading..." state.

### Technical Changes

**File:** `src/pages/ManageAvailability.tsx`

#### 1. Update `getSpotAvailabilityDisplay()` to accept selection context

Modify the function to handle the "not selected" case explicitly:

```typescript
// Get current availability display for a spot
const getSpotAvailabilityDisplay = (spotId: string): { text: string; isLoading: boolean } => {
  // If spot is not selected, don't show availability
  if (!selectedSpots.includes(spotId)) {
    return { text: 'Select to view', isLoading: false };
  }
  
  const data = spotAvailability[spotId];
  if (!data) {
    return { text: 'Loading...', isLoading: true };
  }
  
  // ... rest of existing logic, returning { text: displayString, isLoading: false }
};
```

#### 2. Update the spot card rendering to use the new return type

The spot cards (lines 539-571) will be updated to:
- Only show the loading spinner when `isLoading: true`
- Display the neutral "Select to view" text for non-selected spots
- Style non-selected availability text as more muted

```tsx
{spots.map(spot => {
  const availabilityInfo = getSpotAvailabilityDisplay(spot.id);
  return (
    <Card key={spot.id} ...>
      <div className="flex items-center gap-3">
        {/* ... existing checkbox and title ... */}
        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
          {availabilityInfo.isLoading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Clock className="h-3 w-3" />
          )}
          <span className={cn(
            !selectedSpots.includes(spot.id) && "italic opacity-70"
          )}>
            {availabilityInfo.text}
          </span>
        </div>
      </div>
    </Card>
  );
})}
```

#### 3. Alternative: Hide availability line for non-selected spots entirely

For an even cleaner UX, we could hide the availability line completely for non-selected spots:

```tsx
{selectedSpots.includes(spot.id) && (
  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
    <Clock className="h-3 w-3" />
    {getSpotAvailabilityDisplay(spot.id)}
  </div>
)}
```

### Implementation Details

The recommended approach is **Option 2** (show "Select to view" with muted styling) because:
- It maintains consistent card heights across spots
- Users understand that availability info is available upon selection
- Avoids layout shift when toggling spot selection

### Files to Modify
- `src/pages/ManageAvailability.tsx`

### Expected Behavior After Fix
- Selecting Spot A shows its availability immediately (or brief loading state)
- Non-selected spots show "Select to view" in muted/italic text
- No misleading "Loading..." states for unselected spots
- Switching between spots updates availability cleanly without flicker
