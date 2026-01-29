
# Detailed Preview for Manage Availability

## Overview

The current preview section on `/manage-availability` shows a summary like "24/7 availability" or "3 days with custom hours". The user wants a more detailed preview that:

1. Lists specific day names and time ranges
2. Shows small, narrow cards for each spot being updated

---

## Current vs Proposed Preview

### Date Override Tab - Current
```text
+----------------------------------------------+
| Changes Preview                              |
|                                              |
| [Current: Available all day] → [New: Blocked]|
|                                              |
| 3 spots × 2 dates will be updated            |
| Dates: Jan 29, Jan 30                        |
+----------------------------------------------+
```

### Date Override Tab - Proposed
```text
+----------------------------------------------+
| Changes Preview                              |
|                                              |
| [Current: Available all day] → [New: Blocked]|
|                                              |
| Applies to:                                  |
| +--------+ +--------+ +--------+             |
| |Venice  | |Santa   | |Downtown|             |
| |Beach   | |Monica  | |Garage  |             |
| +--------+ +--------+ +--------+             |
|                                              |
| Dates: Wed Jan 29, Thu Jan 30                |
+----------------------------------------------+
```

### Recurring Tab - Current
```text
+----------------------------------------------+
| Preview                                      |
|                                              |
| 2 spots will have their recurring schedule   |
| replaced with:                               |
|                                              |
| [3 days with custom hours]                   |
+----------------------------------------------+
```

### Recurring Tab - Proposed
```text
+----------------------------------------------+
| Preview                                      |
|                                              |
| New Schedule:                                |
| • Mon:  9:00 AM - 5:00 PM                    |
| • Tue:  9:00 AM - 5:00 PM                    |
| • Wed:  9:00 AM - 12:00 PM, 2:00 PM - 6:00 PM|
| • Thu:  Closed                               |
| • Fri:  9:00 AM - 5:00 PM                    |
| • Sat:  10:00 AM - 4:00 PM                   |
| • Sun:  Closed                               |
|                                              |
| Applies to:                                  |
| +--------+ +--------+                        |
| |Venice  | |Downtown|                        |
| |Beach   | |Garage  |                        |
| +--------+ +--------+                        |
+----------------------------------------------+
```

---

## Technical Implementation

### File to Modify
`src/pages/ManageAvailability.tsx`

### 1. Create Helper Function for Detailed Day/Time Breakdown

Add a new function that converts `recurringRules` into a detailed per-day breakdown:

```typescript
const getDetailedRecurringPreview = (): { day: string; times: string }[] => {
  const DAYS_FULL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const result: { day: string; times: string }[] = [];
  
  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const dayRules = recurringRules.filter(r => r.day_of_week === dayIndex);
    
    if (dayRules.length === 0) {
      result.push({ day: DAYS_FULL[dayIndex], times: 'Closed' });
    } else {
      // Check for 24h
      const totalMinutes = dayRules.reduce((sum, r) => {
        const [sh, sm] = r.start_time.split(':').map(Number);
        const [eh, em] = r.end_time.split(':').map(Number);
        return sum + ((eh * 60 + em) - (sh * 60 + sm));
      }, 0);
      
      if (totalMinutes >= 24 * 60 - 30) {
        result.push({ day: DAYS_FULL[dayIndex], times: '24 hours' });
      } else {
        // Format each time range
        const ranges = dayRules.map(r => {
          return `${formatTime12h(r.start_time)} - ${formatTime12h(r.end_time)}`;
        });
        result.push({ day: DAYS_FULL[dayIndex], times: ranges.join(', ') });
      }
    }
  }
  
  return result;
};
```

### 2. Add Time Formatting Helper

```typescript
const formatTime12h = (time: string): string => {
  const [hours, minutes] = time.split(':').map(Number);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  if (minutes === 0) return `${hour12} ${ampm}`;
  return `${hour12}:${minutes.toString().padStart(2, '0')} ${ampm}`;
};
```

### 3. Update Recurring Tab Preview Section (lines ~1401-1425)

Replace the simple preview with detailed day breakdown and spot cards:

```tsx
{recurringSelectedSpots.length > 0 && (
  <section>
    <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
      <RefreshCw className="h-5 w-5" />
      Preview
    </h2>
    
    <Card className="p-4 border-primary/30 bg-primary/5">
      <div className="space-y-4">
        {/* Day/Time Breakdown */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase mb-2">
            New Schedule
          </p>
          {recurringRules.length === 0 ? (
            <p className="text-sm text-amber-600 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Schedule will be cleared (no hours)
            </p>
          ) : (
            <div className="space-y-1">
              {getDetailedRecurringPreview().map(({ day, times }) => (
                <div key={day} className="flex text-sm">
                  <span className="w-10 font-medium text-muted-foreground">{day}:</span>
                  <span className={cn(
                    times === 'Closed' && 'text-muted-foreground italic'
                  )}>
                    {times}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Spot Cards */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase mb-2">
            Applies to
          </p>
          <div className="flex flex-wrap gap-1.5">
            {recurringSelectedSpots.map(spotId => {
              const spot = spots.find(s => s.id === spotId);
              if (!spot) return null;
              return (
                <div
                  key={spotId}
                  className="bg-background border rounded px-2 py-1 text-xs font-medium truncate max-w-[120px]"
                  title={spot.title}
                >
                  {spot.title}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  </section>
)}
```

### 4. Update Date Override Tab Preview Section (lines ~1160-1224)

Add spot cards below the current before/after comparison:

```tsx
{/* Affected spots/dates summary */}
<div className="mt-3 pt-3 border-t space-y-3">
  {/* Dates List */}
  <div>
    <p className="text-xs font-medium text-muted-foreground uppercase mb-1.5">
      Dates
    </p>
    <p className="text-sm">
      {selectedDates.length <= 5 
        ? selectedDates.map(d => format(d, 'EEE MMM d')).join(', ')
        : `${selectedDates.length} dates selected`
      }
    </p>
  </div>
  
  {/* Spot Cards */}
  <div>
    <p className="text-xs font-medium text-muted-foreground uppercase mb-1.5">
      Applies to
    </p>
    <div className="flex flex-wrap gap-1.5">
      {selectedSpots.map(spotId => {
        const spot = spots.find(s => s.id === spotId);
        if (!spot) return null;
        return (
          <div
            key={spotId}
            className="bg-background border rounded px-2 py-1 text-xs font-medium truncate max-w-[120px]"
            title={spot.title}
          >
            {spot.title}
          </div>
        );
      })}
    </div>
  </div>
</div>
```

---

## Summary of Changes

| Location | Change |
|----------|--------|
| New helper function | `getDetailedRecurringPreview()` - returns per-day time breakdown |
| New helper function | `formatTime12h()` - formats "HH:MM" to "12:00 PM" style |
| Recurring tab preview (lines ~1401-1425) | Replace simple summary with day-by-day breakdown + spot cards |
| Date override tab preview (lines ~1210-1220) | Add spot cards below dates summary |

---

## Design Notes

- **Spot cards**: Small, narrow (height ~24px), with truncated text and max-width of 120px
- **Day breakdown**: Compact list with abbreviated day names (Mon, Tue, etc.)
- **Closed days**: Shown in italic muted text
- **Time format**: 12-hour format without leading zeros (9 AM, 12 PM, etc.)
- **Multiple ranges**: Shown comma-separated on same line (e.g., "9 AM - 12 PM, 2 PM - 6 PM")
