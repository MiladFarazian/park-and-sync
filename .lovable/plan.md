

## Fix Instant Book Filter and Display Inconsistency

### Problem
There's a naming inconsistency between components causing two issues:
1. **Display Bug**: All spots in the MapView carousel show "Request" badge instead of correctly showing "Instant" for instant-book spots
2. **Root Cause**: Property naming mismatch between `instantBook` (camelCase) and `instant_book` (snake_case)

### How the Bug Manifests
- `Explore.tsx` transforms spots with property `instantBook` (camelCase)
- `MapView.tsx` interface defines `instant_book` (snake_case)  
- MapView checks `spot.instant_book` which is `undefined` for all spots
- Since `undefined` is falsy, all spots show the "Request" badge regardless of their actual booking type

### Verification
I tested in the browser and confirmed:
- A spot at "844 W 32nd St" has `instant_book: true` in the database
- But the carousel card displays "Request" badge instead of "Instant"
- The filter count updates correctly (showing fewer spots when filter is applied)
- But because the display is wrong, it appears as if the filter isn't working

### Solution
Update `MapView.tsx` to use the correct camelCase property name `instantBook` that matches how spots are transformed in `Explore.tsx`.

---

### Technical Changes

**File: `src/components/map/MapView.tsx`**

**Change 1: Update the Spot interface (line 43)**

Current:
```typescript
instant_book?: boolean; // Whether the spot supports instant booking
```

New:
```typescript
instantBook?: boolean; // Whether the spot supports instant booking
```

**Change 2: Update the badge conditional (line 1349)**

Current:
```typescript
{spot.instant_book ? (
```

New:
```typescript
{spot.instantBook ? (
```

---

### Files to Modify

| File | Lines | Change |
|------|-------|--------|
| `src/components/map/MapView.tsx` | 43 | Rename `instant_book` to `instantBook` in Spot interface |
| `src/components/map/MapView.tsx` | 1349 | Change `spot.instant_book` to `spot.instantBook` in conditional |

---

### Result
- Spots with Instant Book enabled will correctly show the "Instant" badge (yellow with lightning bolt)
- Spots requiring host confirmation will correctly show the "Request" badge
- The Instant Book filter will appear to work correctly because the visual display will now match the actual filter behavior

