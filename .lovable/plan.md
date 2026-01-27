
# Plan: Fix Availability Filtering Logic in search-spots-lite

## Problem Identified

Spots are appearing on the map even when they're outside their window of availability. The root cause is a **logic inversion** in how `search-spots-lite` handles spots without availability rules.

### Current (Buggy) Behavior in `search-spots-lite`

```javascript
// Lines 383-406 in search-spots-lite/index.ts
} else {
  // No override - check recurring rules for this day of week
  const dayRule = rules.find(r => r.day_of_week === dayOfWeek);

  if (dayRule) {
    // ... check rules
  }
  // If no rule exists for this day, spot is considered available (no restrictions)
}
```

When no `availability_rule` exists for a day, the spot is considered **available** (passed through).

### Correct Behavior in Database `check_spot_availability` Function

```sql
SELECT * INTO v_rule FROM availability_rules
WHERE spot_id = p_spot_id AND day_of_week = v_day_of_week AND is_available = true
LIMIT 1;

IF FOUND THEN
  -- Check if time falls within available hours
  IF v_current_start_time >= v_rule.start_time 
    AND v_current_end_time <= v_rule.end_time THEN
    v_available := true;
  END IF;
END IF;

IF NOT v_available THEN
  RETURN false;  -- ← Spot is UNAVAILABLE if no matching rule
END IF;
```

When no matching availability rule exists, `v_available` remains `false` and the spot is **unavailable**.

### The Mismatch

| Scenario | `check_spot_availability` (DB) | `search-spots-lite` (Edge) |
|----------|-------------------------------|---------------------------|
| No rule for day | **Unavailable** ❌ | **Available** ✓ (bug!) |
| Rule exists, time within window | Available ✓ | Available ✓ |
| Rule exists, time outside window | Unavailable ❌ | Unavailable ❌ |

## Additional Issue: End Time Edge Case

Some spots have `end_time: 24:00:00` in the database, but the search logic uses string comparison with times like `23:59:59`. String comparison of `"23:59:59" > "24:00:00"` incorrectly returns `false` (because `"2" < "3"` in ASCII).

## Solution

Update `search-spots-lite` to match the database function's behavior:

1. **Require a matching availability rule** - if no rule exists for a day, the spot should be marked unavailable
2. **Handle 24:00:00 end times** - normalize to comparable values

### Code Changes

**File: `supabase/functions/search-spots-lite/index.ts`**

Replace lines 383-406:

```typescript
} else {
  // No override - check recurring rules for this day of week
  const dayRule = rules.find(r => r.day_of_week === dayOfWeek && r.is_available);

  if (!dayRule) {
    // No availability rule for this day = spot is unavailable
    isAvailableForAllDates = false;
    break;
  }

  // Rule exists - check if search time falls within the available window
  if (dayRule.start_time && dayRule.end_time) {
    const ruleStart = normalizeTimeStr(dayRule.start_time);
    // Handle 24:00 as end-of-day (treat as 23:59:59 for comparison)
    let ruleEnd = normalizeTimeStr(dayRule.end_time);
    if (ruleEnd === '24:00:00') {
      ruleEnd = '23:59:59';
    }
    
    // Pacific time string comparison - search time must be within rule window
    if (searchStartTimeOnDate < ruleStart || searchEndTimeOnDate > ruleEnd) {
      isAvailableForAllDates = false;
      break;
    }
  }
  // If rule has no time range (null/null), treat as available all day
}
```

## Summary of Changes

| File | Change |
|------|--------|
| `supabase/functions/search-spots-lite/index.ts` | Fix availability logic: require matching rule for each day, handle 24:00 end times |

## Verification Steps

After the fix:
1. A spot with availability rules for Mon-Fri (9 AM - 5 PM) should NOT appear for a Saturday search
2. A spot with no availability rules for a specific day should NOT appear for that day
3. A spot with `end_time: 24:00:00` should correctly appear for late-night searches
4. The behavior should match the database `check_spot_availability` function exactly

## Edge Cases Handled

- **No rules for a day**: Spot is unavailable (matches DB function)
- **Rule with `is_available: false`**: Spot is unavailable for that day
- **Rule with `24:00:00` end time**: Normalized to `23:59:59` for proper comparison
- **Multi-day searches**: Each day must have a valid availability window
