

# Plan: Improve Changes Preview UI in Manage Availability

## Problem
The current "Changes Preview" section is inconsistent and confusing:
- **Before** shows "Available all day (recurring)" with a source indicator
- **After** shows just "Available all day" without context

This creates confusion because:
1. The "(recurring)" label only appears on one side
2. It doesn't clearly communicate that a **date override** is replacing the **recurring schedule**
3. The visual distinction between the two states is minimal

## Solution: Enhanced Changes Preview Design

Replace the simple Before/After text boxes with a more informative, visually distinct preview that clearly shows:
1. The **source** of both the current and new availability
2. **Visual indicators** (icons) for different states
3. A **clear transition arrow** between states

### New UI Layout

```text
┌──────────────────────────────────────────────────────┐
│  🔄 Changes Preview                                  │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌─────────────────────┐     ┌─────────────────────┐│
│  │ CURRENT             │     │ NEW (Override)      ││
│  │ ─────────────────── │     │ ─────────────────── ││
│  │ 🔁 From weekly      │     │ 📅 For selected     ││
│  │    schedule         │ ──▶ │    dates only       ││
│  │                     │     │                     ││
│  │ ✓ Available all day │     │ ✓ Available all day ││
│  └─────────────────────┘     └─────────────────────┘│
│                                                      │
│  Updating 1 spot × 1 date                           │
└──────────────────────────────────────────────────────┘
```

## Implementation Details

### 1. Update `getCurrentAvailabilityDisplay()` to return structured data

Instead of returning just a string, return an object with:
- `text`: The availability description (e.g., "Available all day")
- `source`: The source type ("override" | "recurring" | "none")
- `icon`: Appropriate icon indicator

```typescript
interface AvailabilityDisplayInfo {
  text: string;
  source: 'override' | 'recurring' | 'none';
  sourceLabel: string;
}

const getCurrentAvailabilityInfo = (): AvailabilityDisplayInfo => {
  if (selectedSpots.length === 0) {
    return { text: 'No spots selected', source: 'none', sourceLabel: '' };
  }
  
  const firstSpotId = selectedSpots[0];
  const data = spotAvailability[firstSpotId];
  
  if (!data) {
    return { text: 'Loading...', source: 'none', sourceLabel: '' };
  }
  
  if (data.overrides.length > 0) {
    const override = data.overrides[0];
    const text = !override.is_available 
      ? 'Blocked'
      : isFullDayTimeRange(override.start_time, override.end_time)
        ? 'Available all day'
        : `${formatTimeDisplay(override.start_time!)} - ${formatTimeDisplay(override.end_time!)}`;
    return { text, source: 'override', sourceLabel: 'Date override' };
  }
  
  if (data.rules.length > 0) {
    const rule = data.rules[0];
    const text = !rule.is_available 
      ? 'Blocked'
      : isFullDayTimeRange(rule.start_time, rule.end_time)
        ? 'Available all day'
        : `${formatTimeDisplay(rule.start_time)} - ${formatTimeDisplay(rule.end_time)}`;
    return { text, source: 'recurring', sourceLabel: 'Weekly schedule' };
  }
  
  return { text: 'No schedule set', source: 'none', sourceLabel: '' };
};
```

### 2. Update `getPendingAvailabilityDisplay()` similarly

```typescript
const getPendingAvailabilityInfo = (): AvailabilityDisplayInfo => {
  let text: string;
  
  if (availabilityMode === 'unavailable') {
    text = 'Blocked';
  } else if (availabilityMode === 'available') {
    text = 'Available all day' + (defaultCustomRate ? ` ($${defaultCustomRate}/hr)` : '');
  } else {
    const blocks = timeBlocks.map(b => {
      const rate = b.customRate ?? defaultCustomRate;
      const rateStr = rate ? ` ($${rate}/hr)` : '';
      return `${format(b.startTime, 'h:mm a')} - ${format(b.endTime, 'h:mm a')}${rateStr}`;
    });
    text = blocks.join(', ');
  }
  
  return { 
    text, 
    source: 'override', 
    sourceLabel: 'Date override' 
  };
};
```

### 3. Redesign the Changes Preview Section

Replace the simple grid with a more informative layout:

```tsx
<Card className="p-4 border-primary/30 bg-primary/5">
  <div className="flex items-center gap-3">
    {/* Before Card */}
    <div className="flex-1 bg-background rounded-lg border p-3">
      <div className="flex items-center gap-1.5 mb-2">
        {currentInfo.source === 'recurring' ? (
          <Repeat className="h-3.5 w-3.5 text-muted-foreground" />
        ) : currentInfo.source === 'override' ? (
          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
        ) : null}
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Current
        </span>
      </div>
      {currentInfo.sourceLabel && (
        <p className="text-xs text-muted-foreground mb-1">{currentInfo.sourceLabel}</p>
      )}
      <p className="text-sm font-medium">{currentInfo.text}</p>
    </div>
    
    {/* Arrow */}
    <ArrowRight className="h-5 w-5 text-primary shrink-0" />
    
    {/* After Card */}
    <div className="flex-1 bg-primary/10 rounded-lg border border-primary/30 p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <CalendarDays className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-medium text-primary uppercase tracking-wide">
          New
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-1">Date override</p>
      <p className="text-sm font-medium">{pendingInfo.text}</p>
    </div>
  </div>
  
  {/* Summary footer */}
  <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
    ...
  </div>
</Card>
```

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/ManageAvailability.tsx` | Refactor display functions to return structured data; redesign Changes Preview UI with icons, source labels, and arrow transition |

## Visual Improvements

1. **Clear source indicators**: Icons (🔁 Repeat for recurring, 📅 Calendar for override) visually distinguish the source
2. **Consistent labeling**: Both sides show a source label ("Weekly schedule" vs "Date override")
3. **Arrow transition**: A clear `→` arrow shows the change direction
4. **Better hierarchy**: "Current" and "New" headers with source labels underneath, then the actual availability text

## Edge Cases

| Scenario | Display |
|----------|---------|
| No existing schedule | Current: "No schedule set" (no source label) |
| Existing override | Current: shows "Date override" as source |
| Multiple spots with different schedules | Current: shows first selected spot with "(varies)" indicator if others differ |

