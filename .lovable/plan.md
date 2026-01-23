

## Speed Up Availability Loading

### Root Cause
The availability data loads slowly because:

1. **Sequential fetching**: The code loops through each spot one-by-one, waiting for each spot's queries to complete before moving to the next
2. **2 queries per spot**: Each spot requires separate queries for `availability_rules` and `calendar_overrides`
3. **Total queries**: For 5 spots = 10 database round-trips in sequence

Meanwhile, the hourly rate is instant because it's fetched in the same query as the spots (`spots.hourly_rate`).

### Solution
Fetch all availability data in **parallel** using `Promise.all()`, and use batch queries with `.in()` filters instead of individual queries per spot.

### Technical Changes

**File:** `src/pages/ManageAvailability.tsx`

#### Before (sequential, slow):
```typescript
for (const spot of spots) {
  const spotId = spot.id;
  const { data: rules } = await supabase
    .from('availability_rules')
    .select('...')
    .eq('spot_id', spotId)
    .eq('day_of_week', dayOfWeek);
  
  const { data: overrides } = await supabase
    .from('calendar_overrides')
    .select('...')
    .eq('spot_id', spotId)
    .eq('override_date', dateStr);
  
  availability[spotId] = { rules, overrides };
}
```

#### After (parallel, fast):
```typescript
// Get all spot IDs
const spotIds = spots.map(s => s.id);

// Fetch ALL rules and overrides in just 2 parallel queries
const [rulesResult, overridesResult] = await Promise.all([
  supabase
    .from('availability_rules')
    .select('spot_id, day_of_week, start_time, end_time, is_available, custom_rate')
    .in('spot_id', spotIds)
    .eq('day_of_week', dayOfWeek),
  supabase
    .from('calendar_overrides')
    .select('id, spot_id, override_date, start_time, end_time, is_available, custom_rate')
    .in('spot_id', spotIds)
    .eq('override_date', dateStr)
]);

// Group results by spot_id
const availability: Record<string, { rules: AvailabilityRule[]; overrides: CalendarOverride[] }> = {};

for (const spotId of spotIds) {
  availability[spotId] = {
    rules: (rulesResult.data || []).filter(r => r.spot_id === spotId),
    overrides: (overridesResult.data || []).filter(o => o.spot_id === spotId)
  };
}

setSpotAvailability(availability);
```

### Performance Improvement
| Before | After |
|--------|-------|
| 2N queries (sequential) | 2 queries (parallel) |
| 5 spots = 10 round-trips | 5 spots = 2 round-trips |
| ~1-2 seconds | ~100-200ms |

### Files to Modify
- `src/pages/ManageAvailability.tsx` - Refactor `fetchAvailabilityData()` to use batch queries

