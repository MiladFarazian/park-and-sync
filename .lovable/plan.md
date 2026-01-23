

## Fix Incorrect Availability Hours Display on Booking Page

### Problem
When a spot has availability set for fewer than 7 days (e.g., Monday-Friday only), the booking page displays just the day names ("Mon, Tue, Wed, Thu, Fri") without showing the actual time ranges. This is confusing because users need to know **when** the spot is available, not just which days.

### Root Cause
In `src/pages/Booking.tsx` (lines 226-246), the availability display logic has three branches:

```typescript
if (rulesData.length === 0) {
  setAvailabilityDisplay('No schedule set');
} else if (rulesData.length === 7) {
  // ✅ Shows time range (8:00 AM - 6:00 PM)
} else {
  // ❌ BUG: Only shows day names ("Mon, Tue, Wed, Thu, Fri")
  // Missing the time range entirely!
  setAvailabilityDisplay(availableDays.map(d => DAYS[d]).join(', '));
}
```

### Solution
Update the `else` branch to include both the days AND the time range, matching the format used when all 7 days are available.

### Technical Changes

**File:** `src/pages/Booking.tsx`

Update lines 242-246 to include time information:

```typescript
} else {
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const availableDays = [...new Set(rulesData.map(r => r.day_of_week))].sort((a, b) => a - b);
  const daysList = availableDays.map(d => DAYS[d]).join(', ');
  
  // Get unique time ranges and format them
  const times = [...new Set(rulesData.map(r => 
    `${formatTimeToAMPM(r.start_time)} - ${formatTimeToAMPM(r.end_time)}`
  ))];
  
  if (times.length === 1) {
    // All days have same hours: "Mon-Fri, 8:00 AM - 6:00 PM"
    setAvailabilityDisplay(`${daysList} • ${times[0]}`);
  } else {
    // Different hours on different days
    setAvailabilityDisplay(`${daysList} • Varied hours`);
  }
}
```

### Expected Result

| Before | After |
|--------|-------|
| "Mon, Tue, Wed, Thu, Fri" | "Mon, Tue, Wed, Thu, Fri • 8:00 AM - 6:00 PM" |
| "Mon, Tue, Wed" | "Mon, Tue, Wed • 9:00 AM - 5:00 PM" |
| Days with different hours | "Mon, Tue, Wed • Varied hours" |

### Files to Modify
- `src/pages/Booking.tsx` - Fix the availability display logic in the `else` branch (around lines 242-246)

