

## Show Address Instead of Spot Title in "Load Schedule From" Dropdown

### Problem
In the Manage Availability page's Recurring Schedule tab, the "Load Schedule From" dropdown currently displays spots by their title (spot type like "Driveway", "Garage", etc.) instead of by address. This makes it difficult to identify which spot is which when you have multiple spots of the same type.

**Current display**: `Driveway — 24/7` or `Garage — Mon-Fri 9-5`

**Desired display**: `123 Main St — 24/7` or `456 Oak Ave — Mon-Fri 9-5`

### Solution
Update the dropdown to show the street address (using the existing `getStreetAddress` utility) instead of the spot title.

---

### Technical Changes

#### File: `src/pages/ManageAvailability.tsx`

**Change 1: Add import for address utility**

**Location**: Near the top imports (around line 22)

Add:
```typescript
import { getStreetAddress } from '@/lib/addressUtils';
```

**Change 2: Update dropdown display**

**Location**: Lines 1362-1364

**Current code**:
```typescript
<SelectItem key={spot.id} value={spot.id}>
  {spot.title} — {getRecurringScheduleSummary(spot.id)}
</SelectItem>
```

**New code**:
```typescript
<SelectItem key={spot.id} value={spot.id}>
  {getStreetAddress(spot.address)} — {getRecurringScheduleSummary(spot.id)}
</SelectItem>
```

---

### Files to Modify
| File | Lines | Change |
|------|-------|--------|
| `src/pages/ManageAvailability.tsx` | ~22 | Add `getStreetAddress` import |
| `src/pages/ManageAvailability.tsx` | 1363 | Replace `spot.title` with `getStreetAddress(spot.address)` |

---

### Result
- **Before**: `Driveway — 24/7`
- **After**: `123 Main St — 24/7`

The `getStreetAddress` utility extracts just the street portion from a full address (removing city, state, ZIP), keeping the dropdown items concise while being more identifiable.

