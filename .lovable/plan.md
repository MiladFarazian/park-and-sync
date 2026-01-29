
# Recurring Calendar Tab Redesign

## Overview

The current Recurring Schedule tab has a flow where users:
1. First set hours on a blank weekly grid
2. Then select which spots to apply those hours to

The user wants to change this to:
1. First select a spot from a dropdown to view its existing schedule
2. The grid populates with that spot's current weekly schedule
3. Modify the schedule as needed
4. Select which spots to apply the new schedule to (with the source spot pre-selected)
5. Save to override all selected spots' recurring schedules

This creates a more intuitive "copy and modify" workflow.

---

## Current vs New Flow

```text
CURRENT FLOW:
Step 1: Draw schedule on blank grid
Step 2: Select spots to apply it to
Step 3: Save

NEW FLOW:
Step 1: Select source spot from dropdown (grid auto-fills with its schedule)
Step 2: Modify schedule as needed
Step 3: Select which spots to apply it to (source spot pre-selected)
Step 4: Save
```

---

## UI Changes

### Step 1: Source Spot Dropdown (NEW)

Add a dropdown at the top of the recurring tab labeled "Load schedule from:" with all the host's spots listed. When a spot is selected:
- The WeeklyScheduleGrid initializes with that spot's existing rules
- The spot is auto-selected in the "apply to" list

### Step 2: Schedule Grid

- Grid is no longer blank by default
- Initializes with the selected source spot's rules
- Host can modify freely using drag, quick actions (24/7, M-F 9-5), or undo

### Step 3: Apply To Selection

- The source spot from Step 1 is pre-checked
- Host can select additional spots to apply the same schedule to
- Shows current schedule summary for each spot so host can see what will be replaced

---

## Technical Implementation

### File to Modify
`src/pages/ManageAvailability.tsx`

### State Changes

Add new state variable:
```typescript
const [sourceSpotId, setSourceSpotId] = useState<string | null>(null);
```

### Logic Changes

1. When `sourceSpotId` changes, load that spot's rules from `spotRecurringRules[sourceSpotId]` and update `recurringRules`

2. Auto-add the source spot to `recurringSelectedSpots` when it's selected

3. Convert stored rules format to grid format (they're the same `AvailabilityRule` type)

### WeeklyScheduleGrid Changes

The `WeeklyScheduleGrid` component needs a way to reset with new initial rules. Currently it only uses `initialRules` on mount. Two options:

**Option A**: Add a `key` prop that forces remount when source spot changes
```tsx
<WeeklyScheduleGrid
  key={sourceSpotId || 'blank'}
  initialRules={spotRecurringRules[sourceSpotId] || []}
  onChange={setRecurringRules}
/>
```

**Option B**: Add a controlled mode or `reset` mechanism to the component

Option A (using key) is simpler and works well for this use case.

---

## Updated Recurring Tab Layout

```text
+------------------------------------------------------+
| 1. Load Schedule From                                |
|                                                      |
| [ Select a spot to load its schedule... v ]  <- Dropdown
|                                                      |
+------------------------------------------------------+

+------------------------------------------------------+
| 2. Set Your Weekly Hours                             |
|                                                      |
| +--------------------------------------------------+ |
| |  When2Meet Grid (pre-filled if spot selected)    | |
| |                                                  | |
| |  [24/7] [M-F 9-5] [Undo]                         | |
| +--------------------------------------------------+ |
+------------------------------------------------------+

+------------------------------------------------------+
| 3. Apply to Spots                                    |
|                                                      |
| [ ] Select All                                       |
| [x] Venice Beach Driveway ($5/hr) - Current: 24/7    |  <- Pre-selected
| [ ] Santa Monica Spot ($3/hr) - Current: M-F 9-5     |
| [ ] Downtown Garage ($8/hr) - Current: No schedule   |
+------------------------------------------------------+

+------------------------------------------------------+
|             [ Apply to 1 Spot ]                      |
+------------------------------------------------------+
```

---

## Changes Required

### 1. Add Source Spot Dropdown

Import the Select components and add above the grid:

```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
```

Add in the recurring tab before the grid section:

```tsx
<section>
  <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
    <span className="bg-primary...">1</span>
    Load Schedule From
  </h2>
  
  <Select value={sourceSpotId || ''} onValueChange={(value) => {
    setSourceSpotId(value || null);
    // Auto-select this spot for applying
    if (value && !recurringSelectedSpots.includes(value)) {
      setRecurringSelectedSpots(prev => [...prev, value]);
    }
  }}>
    <SelectTrigger>
      <SelectValue placeholder="Select a spot to load its schedule..." />
    </SelectTrigger>
    <SelectContent className="bg-background">
      {spots.map(spot => (
        <SelectItem key={spot.id} value={spot.id}>
          {spot.title} - {getRecurringScheduleSummary(spot.id)}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
  
  <p className="text-xs text-muted-foreground mt-2">
    Or start with a blank schedule and use the quick actions below
  </p>
</section>
```

### 2. Update WeeklyScheduleGrid with Dynamic Key

```tsx
<WeeklyScheduleGrid
  key={sourceSpotId || 'blank'}
  initialRules={sourceSpotId ? (spotRecurringRules[sourceSpotId] || []) : []}
  onChange={setRecurringRules}
/>
```

### 3. Renumber Steps

- Step 1: Load Schedule From (new)
- Step 2: Set Your Weekly Hours (was Step 1)
- Step 3: Select Spots to Update (was Step 2)

### 4. Update Preview Section Text

Clarify that the new schedule will replace existing schedules:

```tsx
<p className="text-sm">
  <strong>{recurringSelectedSpots.length}</strong> spot{recurringSelectedSpots.length !== 1 ? 's' : ''} 
  will have their recurring schedule replaced with:
</p>
```

---

## Edge Cases Handled

1. **No source spot selected**: Grid starts blank, user can draw or use quick actions
2. **Source spot has no schedule**: Grid starts blank, same as above
3. **User changes source spot**: Grid resets to new spot's schedule (via key change)
4. **Source spot removed from apply list**: Allowed (user might want to copy but not update source)

---

## Summary of Changes

| File | Change |
|------|--------|
| `src/pages/ManageAvailability.tsx` | Add `sourceSpotId` state, add Select dropdown section, pass `key` and `initialRules` to grid, renumber sections, update Preview text |

No changes needed to `WeeklyScheduleGrid.tsx` since using the `key` prop handles the reset behavior.
