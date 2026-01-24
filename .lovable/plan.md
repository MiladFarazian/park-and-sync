
## Fix: "Explore Spots" Button Shows Blank Map

### Problem
When clicking "Explore Spots" from the Saved Spots page (empty state), it navigates to `/explore` without any URL parameters. The Explore page only loads spots when `lat` and `lng` parameters are present in the URL, so users see a blank map.

### Solution
Update the "Explore Spots" button to get the user's current location, then navigate to `/explore` with:
- `lat` and `lng` - user's current position
- `start` - current time (now)
- `end` - 2 hours from now

If geolocation fails, fall back to LA's default coordinates.

---

### Technical Changes

**File: `src/pages/SavedSpots.tsx`**

**Step 1: Add date-fns import for time formatting**
```tsx
import { format, addHours } from 'date-fns';
```

**Step 2: Add constants import for default location**
```tsx
import { DEFAULT_MAP_CENTER } from '@/lib/constants';
```

**Step 3: Replace the simple button with a location-aware handler**

Current code (line 162):
```tsx
<Button onClick={() => navigate('/explore')}>Explore Spots</Button>
```

New implementation:
```tsx
<Button onClick={handleExploreSpots}>Explore Spots</Button>
```

**Step 4: Add the handler function inside the component**

This function will:
1. Try to get the user's current GPS location
2. Calculate start time (now) and end time (+2 hours)
3. Format the times as ISO strings
4. Navigate to `/explore` with all required parameters
5. Fall back to default LA coordinates if geolocation fails

```tsx
const handleExploreSpots = () => {
  const now = new Date();
  const twoHoursLater = addHours(now, 2);
  const startParam = now.toISOString();
  const endParam = twoHoursLater.toISOString();

  // Try to get current location
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        navigate(`/explore?lat=${latitude}&lng=${longitude}&start=${startParam}&end=${endParam}`);
      },
      () => {
        // Fallback to default LA location
        navigate(`/explore?lat=${DEFAULT_MAP_CENTER.lat}&lng=${DEFAULT_MAP_CENTER.lng}&start=${startParam}&end=${endParam}`);
      },
      { timeout: 5000, enableHighAccuracy: false }
    );
  } else {
    // No geolocation support - use default
    navigate(`/explore?lat=${DEFAULT_MAP_CENTER.lat}&lng=${DEFAULT_MAP_CENTER.lng}&start=${startParam}&end=${endParam}`);
  }
};
```

---

### Summary

| What Changes | Details |
|-------------|---------|
| **Imports** | Add `addHours` from date-fns and `DEFAULT_MAP_CENTER` from constants |
| **New Function** | `handleExploreSpots()` - gets location and builds proper URL |
| **Button** | Wire to new handler instead of simple navigation |

### User Experience
- User clicks "Explore Spots"
- Brief geolocation request (~1-2 seconds)
- Map loads centered on their location with spots available for the next 2 hours
- If location denied/unavailable, defaults to Downtown LA
