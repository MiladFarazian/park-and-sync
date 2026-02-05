

# Add "Clear Schedule" Button to Weekly Schedule Grid

## Overview

Add a "Clear" button to the `WeeklyScheduleGrid` component's quick actions, allowing hosts to quickly clear all selected hours from their recurring schedule. This is a common action that should be easily accessible alongside the existing "24/7", "M-F 9-5", and "Undo" buttons.

---

## Solution

### File: `src/components/availability/WeeklyScheduleGrid.tsx`

**Changes:**

1. **Add import for `Trash2` icon** (line 4)
   - Add `Trash2` to the existing lucide-react import

2. **Create `clearAll` function** (after the `set24_7` function, around line 141)
   ```typescript
   const clearAll = () => {
     saveToHistory();
     setGrid(Array.from({ length: 7 }, () => Array(TOTAL_SLOTS).fill(false)));
     toast.success('Cleared all hours');
   };
   ```

3. **Add "Clear" button to quick actions** (line 361-393)
   - Add a new button between "M-F 9-5" and "Undo" (or at the end)
   - Use the `Trash2` icon for visual consistency
   - Style: `variant="outline"` with a subtle destructive hint

**Updated Quick Actions section:**
```tsx
<div className="flex gap-2 shrink-0 pt-2">
  <Button
    type="button"
    variant="outline"
    size="sm"
    className="flex-1 h-8 text-xs"
    onClick={set24_7}
  >
    <CalendarClock className="h-3.5 w-3.5 mr-1" />
    24/7
  </Button>
  <Button
    type="button"
    variant="outline"
    size="sm"
    className="flex-1 h-8 text-xs"
    onClick={set9to5MF}
  >
    <Briefcase className="h-3.5 w-3.5 mr-1" />
    M-F 9-5
  </Button>
  <Button
    type="button"
    variant="outline"
    size="sm"
    className="flex-1 h-8 text-xs"
    onClick={clearAll}
  >
    <Trash2 className="h-3.5 w-3.5 mr-1" />
    Clear
  </Button>
  <Button
    type="button"
    variant="outline"
    size="sm"
    className="flex-1 h-8 text-xs"
    onClick={undo}
    disabled={history.length === 0}
  >
    <Undo2 className="h-3.5 w-3.5 mr-1" />
    Undo
  </Button>
</div>
```

---

## Behavior

| Action | Result |
|--------|--------|
| Click "Clear" | All hours are deselected (grid becomes empty) |
| Toast | "Cleared all hours" success message |
| Undo | Previous state is saved to history, so "Undo" works |
| Parent callback | `onChange` fires with empty rules array `[]` |

---

## Visual Layout

The quick actions row will now have 4 buttons:
```text
[ 24/7 ] [ M-F 9-5 ] [ Clear ] [ Undo ]
```

Each button uses `flex-1` so they distribute evenly across the available width.

