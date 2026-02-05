
## Goal
In **Manage Availability**, show **today’s date** with an **orange outline** (accent ring) instead of an **orange filled background**, to avoid confusion with selected/blocked/available states.

## What’s happening now (root cause)
Even though `src/components/ui/calendar.tsx` was updated, **ManageAvailability overrides the calendar styles locally** and still sets:
- `day_today: "bg-accent text-accent-foreground"`

So the “today” cell stays orange-filled on `/manage-availability` regardless of the shared Calendar component styling.

## Implementation approach
### 1) Update ManageAvailability’s inline DayPicker `classNames`
**File:** `src/pages/ManageAvailability.tsx` (around the calendar block near the “Select Dates” section)

Change:
- `day_today: "bg-accent text-accent-foreground"`
to an outline-based style, for example:
- `day_today: "ring-2 ring-accent ring-inset text-foreground aria-selected:ring-0"`

Notes:
- `ring-accent` = orange outline.
- `aria-selected:ring-0` prevents an orange ring around a selected-today date (so selected stays clearly “selected” in purple).
- This keeps “today” visually distinct without implying selection.

### 2) Make the shared Calendar component consistent (recommended)
**File:** `src/components/ui/calendar.tsx`

Update `day_today` to match the new behavior app-wide:
- From: `ring-2 ring-primary ring-inset text-foreground`
- To: `ring-2 ring-accent ring-inset text-foreground aria-selected:ring-0`

This ensures any other places that use the shared `<Calendar />` (without local overrides) also follow the “orange outline for today” rule.

## Validation checklist (what to test)
1. Go to: `/manage-availability?...`
2. Confirm **today** shows as an **orange outline** only (no orange fill).
3. Confirm **selected dates** still show as **purple filled**.
4. Confirm tapping dates still works and the UI doesn’t accidentally apply orange fill to “today” unless the user is actively hovering (desktop) or selecting.
5. Test on mobile width to ensure the ring is visible and doesn’t look like selection.

## Edge cases considered
- **Today is selected:** should appear selected (purple) and not double-emphasized by the orange ring (handled via `aria-selected:ring-0`).
- **Disabled/past days:** should remain muted; the today ring should only apply when DayPicker marks the day as today (and in ManageAvailability, past dates are disabled anyway).

## Files to change
- `src/pages/ManageAvailability.tsx` (fix the local override that’s causing the orange fill)
- `src/components/ui/calendar.tsx` (optional but recommended for consistency across the app)
