
# Plan: Add Recurring Schedule Tab to Manage Availability Page

## Overview
Add a new tab to the host Manage Availability page (`/manage-availability`) that allows hosts to manage recurring weekly schedules using a When2Meet-style UI. This tab will enable hosts to:
1. Create a weekly schedule visually (blank grid to start)
2. Assign the schedule to one or multiple spots simultaneously

## Current Architecture

### Existing Components
- **`ManageAvailability.tsx`**: Current page for date-specific overrides (uses `calendar_overrides` table)
- **`EditSpotAvailability.tsx`**: Single-spot management with tabs for Date Override and Weekly Schedule
- **`WeeklyScheduleGrid.tsx`**: When2Meet-style drag-to-select component for 7-day × 48-slot grid
- **`DateOverrideManager.tsx`**: Calendar-based date override selection

### Database Tables
- **`availability_rules`**: Stores recurring weekly rules (day_of_week, start_time, end_time, spot_id)
- **`calendar_overrides`**: Stores date-specific overrides

## Implementation Plan

### 1. Update ManageAvailability.tsx Page Structure

Add tabs to switch between:
- **Date Override** (current functionality) - for specific date changes
- **Recurring Schedule** (new) - for weekly recurring availability

```text
┌─────────────────────────────────────────────────┐
│  Manage Availability                            │
├────────────────┬────────────────────────────────┤
│ Date Override  │  Recurring Schedule           │
└────────────────┴────────────────────────────────┘
```

### 2. New Tab: Recurring Schedule

The new tab will have a **different workflow** from the Weekly Schedule in EditSpotAvailability:

**Workflow:**
1. Host sees a **blank** When2Meet grid (no pre-populated data)
2. Host drags to select their desired available hours
3. Host selects which spots to apply this schedule to (multi-select checkboxes)
4. Host clicks "Apply to Selected Spots"

**Key Difference:**
- The existing `EditSpotAvailability` loads rules from a specific spot and saves back to it
- This new tab starts blank and **pushes** the schedule to selected spots

### 3. UI Components Structure

```text
┌─────────────────────────────────────────────────────────┐
│  Recurring Schedule Tab                                 │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─ Step 1: Set Your Hours ─────────────────────────┐  │
│  │  [Instructions: Drag to select available hours]  │  │
│  │                                                   │  │
│  │  ┌─────────────────────────────────────────────┐ │  │
│  │  │     S   M   T   W   T   F   S               │ │  │
│  │  │ 12am ░░░ ░░░ ░░░ ░░░ ░░░ ░░░ ░░░           │ │  │
│  │  │ 1am  ░░░ ░░░ ░░░ ░░░ ░░░ ░░░ ░░░           │ │  │
│  │  │ ...  (When2Meet style grid)                 │ │  │
│  │  │ 11pm ░░░ ░░░ ░░░ ░░░ ░░░ ░░░ ░░░           │ │  │
│  │  └─────────────────────────────────────────────┘ │  │
│  │                                                   │  │
│  │  [24/7] [M-F 9-5] [Undo]                         │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─ Step 2: Select Spots to Update ─────────────────┐  │
│  │  [ ] Select All                                   │  │
│  │  [x] Downtown Parking - Current: M-F 9-5         │  │
│  │  [x] Beach Lot - Current: 24/7                   │  │
│  │  [ ] Night Spot - Current: No schedule           │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─ Preview ────────────────────────────────────────┐  │
│  │  2 spots will be updated with:                   │  │
│  │  Mon-Fri: 9:00 AM - 5:00 PM                      │  │
│  │  Sat-Sun: Closed                                  │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  [Apply to 2 Selected Spots]                            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 4. Technical Implementation Details

#### State Management
```typescript
// New state for recurring tab
const [recurringRules, setRecurringRules] = useState<AvailabilityRule[]>([]);
const [recurringSelectedSpots, setRecurringSelectedSpots] = useState<string[]>([]);

// Existing availability rules per spot (for display)
const [spotRecurringRules, setSpotRecurringRules] = useState<Record<string, AvailabilityRule[]>>({});
```

#### Data Flow
1. On page load: Fetch all spots and their existing `availability_rules`
2. Display current schedule summary for each spot in the selection list
3. When host clicks "Apply":
   - Delete existing `availability_rules` for selected spots
   - Insert new rules from the grid for each selected spot

#### Save Logic
```typescript
const handleApplyRecurringSchedule = async () => {
  for (const spotId of recurringSelectedSpots) {
    // Delete existing rules
    await supabase
      .from('availability_rules')
      .delete()
      .eq('spot_id', spotId);
    
    // Insert new rules (if any)
    if (recurringRules.length > 0) {
      const rulesWithSpotId = recurringRules.map(rule => ({
        spot_id: spotId,
        ...rule
      }));
      await supabase
        .from('availability_rules')
        .insert(rulesWithSpotId);
    }
  }
};
```

### 5. Files to Modify

| File | Changes |
|------|---------|
| `src/pages/ManageAvailability.tsx` | Add Tabs component, new "Recurring Schedule" tab content, state for recurring rules, spot selection for recurring, apply logic |

### 6. UI/UX Considerations

1. **Blank Grid Start**: Unlike EditSpotAvailability which loads existing rules, this starts blank to represent "creating a new schedule"

2. **Current Schedule Display**: Each spot in the selection list shows its current recurring schedule summary (e.g., "M-F 9-5", "24/7", "No schedule set")

3. **Confirmation Preview**: Before applying, show a summary of what will change:
   - Number of spots affected
   - Summary of the new schedule
   - Warning if replacing existing schedules

4. **Success Feedback**: After applying, show toast with number of spots updated and navigate to host calendar

### 7. Edge Cases

| Case | Handling |
|------|----------|
| No spots selected | Disable "Apply" button |
| Empty grid (no hours selected) | This clears the schedule - show confirmation dialog |
| User has no active spots | Show message with link to list a spot |

## Summary

This implementation adds a second tab to the ManageAvailability page that provides a clean, blank When2Meet-style interface for creating a recurring weekly schedule and bulk-applying it to multiple spots. It reuses the existing `WeeklyScheduleGrid` component and follows the existing patterns in the codebase.
