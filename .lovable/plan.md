
## Fix Calabasas Spots Not Showing in Search Results

### Root Cause
The `search-spots-lite` edge function has a **timezone bug** when checking availability rules. The availability times in the database are stored in Pacific time (e.g., `00:00:00` to `23:59:00` means midnight to 11:59 PM Pacific), but the function compares them against UTC search times without timezone conversion.

**Example of the bug:**
- User searches for 2:26 PM to 4:26 PM Pacific (which is 10:26 PM to 12:26 AM UTC)
- Spot has availability `00:00:00` to `23:59:00` Pacific (should be available all day)
- Function creates naive dates: `2026-01-23T00:00:00` and `2026-01-23T23:59:00` (interpreted as UTC)
- Search end time `2026-01-24T00:26:23Z` > rule end `2026-01-23T23:59:00` → **incorrectly marked unavailable**

This affects **all spots** when searches cross certain time boundaries.

---

### Solution
Update `search-spots-lite` to properly handle Pacific timezone when comparing availability rules against search times.

#### Technical Changes

**File:** `supabase/functions/search-spots-lite/index.ts`

1. **Add Pacific timezone conversion function** (around line 50):
```typescript
// Convert a date string and time string to a proper Pacific timezone Date
const toPacificDate = (dateStr: string, timeStr: string): Date => {
  // Parse the time components
  const [hours, minutes, seconds = '00'] = timeStr.split(':');
  
  // Create a date in Pacific timezone by using the proper ISO format
  // We need to account for PST (-08:00) or PDT (-07:00)
  // For simplicity, we'll use a calculation approach
  const utcDate = new Date(`${dateStr}T${hours}:${minutes}:${seconds}Z`);
  
  // Get the Pacific offset for this date (handles DST automatically)
  const pacificFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // Parse what the target time should be in Pacific
  const targetDate = new Date(dateStr + 'T12:00:00Z'); // Use noon to avoid DST edge cases
  const parts = pacificFormatter.formatToParts(targetDate);
  const offset = targetDate.getTimezoneOffset(); // Won't work in Deno
  
  // Actually, Deno supports Temporal or we can use a simpler approach:
  // Add 8 hours for PST (or 7 for PDT) - check if date is in DST
  const isPDT = isDaylightSaving(new Date(dateStr));
  const offsetHours = isPDT ? 7 : 8;
  
  return new Date(`${dateStr}T${hours}:${minutes}:${seconds}Z`);
};
```

2. **Better approach - convert search times to Pacific instead** (simpler and cleaner):

Instead of converting rule times to UTC, convert the search times to Pacific time strings for comparison:

```typescript
// Helper to get Pacific time components from a UTC date
const toPacificTimeString = (utcDate: Date): { date: string; time: string; dayOfWeek: number } => {
  const pacificDate = new Date(utcDate.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  return {
    date: pacificDate.toISOString().split('T')[0],
    time: pacificDate.toTimeString().substring(0, 8),
    dayOfWeek: pacificDate.getDay()
  };
};
```

3. **Update the date range calculation** (lines 199-219):

Convert search times to Pacific when generating the date range:

```typescript
// Convert search times to Pacific for proper date extraction
const startPacific = new Date(new Date(start_time).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
const endPacific = new Date(new Date(end_time).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));

const searchDates: string[] = [];
const currentDate = new Date(startPacific);
currentDate.setHours(0, 0, 0, 0);
const endDateMidnight = new Date(endPacific);
endDateMidnight.setHours(0, 0, 0, 0);
```

4. **Update the availability check** (lines 318-330):

Compare times as Pacific time strings rather than Date objects:

```typescript
if (dayRule.start_time && dayRule.end_time) {
  // Convert search times to Pacific time strings for this date
  const searchStartUtc = new Date(start_time);
  const searchEndUtc = new Date(end_time);
  
  // Get Pacific time strings
  const searchStartPacificStr = new Date(searchStartUtc.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
    .toTimeString().substring(0, 8);
  const searchEndPacificStr = new Date(searchEndUtc.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
    .toTimeString().substring(0, 8);
  
  const ruleStartStr = dayRule.start_time.length === 5 ? dayRule.start_time + ':00' : dayRule.start_time;
  const ruleEndStr = dayRule.end_time.length === 5 ? dayRule.end_time + ':00' : dayRule.end_time;
  
  // Simple string comparison (HH:MM:SS format)
  if (searchStartPacificStr < ruleStartStr || searchEndPacificStr > ruleEndStr) {
    isAvailableForAllDates = false;
    break;
  }
}
```

---

### Alternative: Use the Database Function

The `check_spot_availability` PostgreSQL function already handles timezones correctly. We could call it from `search-spots-lite` for each spot, but this would be slower (one RPC call per spot instead of batch).

A hybrid approach: Use the fast batch filtering for distance/EV/price, then use `check_spot_availability` only for the remaining spots (usually < 50).

---

### Files to Modify
1. `supabase/functions/search-spots-lite/index.ts` - Add timezone-aware availability checking

### Testing
After the fix, the Calabasas spots should appear when searching from Woodland Hills because:
- Search: 2:26 PM - 4:26 PM Pacific
- Availability: 12:00 AM - 11:59 PM Pacific
- The search time now correctly falls within the availability window
