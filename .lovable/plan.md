
# Fix Tooltip Touch Support on Mobile

## Problem
Radix UI Tooltips are hover-based and don't work on touch devices. When users tap the info icon on the Booking page (e.g., the service fee tooltip), nothing happens because mobile devices don't have hover events.

## Solution
Create a "HybridTooltip" component that automatically switches between:
- **Desktop**: Uses standard Tooltip (hover-based)
- **Mobile**: Uses Popover (tap-based)

This is a common pattern for making tooltips accessible on touch devices.

---

## Implementation

### 1. Create HybridTooltip Component

**New file**: `src/components/ui/hybrid-tooltip.tsx`

This component will:
- Detect if the device is mobile using the existing `useIsMobile` hook
- Render a Tooltip on desktop (hover to show)
- Render a Popover on mobile (tap to show)
- Accept the same props as Tooltip for a seamless drop-in replacement

```text
┌─────────────────────────────────────────┐
│           HybridTooltip                 │
├─────────────────────────────────────────┤
│  if (isMobile)                          │
│    → Render Popover (tap to toggle)     │
│  else                                   │
│    → Render Tooltip (hover to show)     │
└─────────────────────────────────────────┘
```

**Component API**:
```tsx
<HybridTooltip content="Tooltip text here">
  <span>Trigger element</span>
</HybridTooltip>
```

### 2. Update Booking.tsx

Replace the service fee tooltip with HybridTooltip:

**Before**:
```tsx
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <span className="text-muted-foreground flex items-center gap-1 cursor-help">
        Service fee
        <Info className="h-3 w-3" />
      </span>
    </TooltipTrigger>
    <TooltipContent>
      <p className="text-xs max-w-[200px]">This fee helps cover...</p>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

**After**:
```tsx
<HybridTooltip content="This fee helps cover platform costs and ensures secure payments.">
  <span className="text-muted-foreground flex items-center gap-1 cursor-help">
    Service fee
    <Info className="h-3 w-3" />
  </span>
</HybridTooltip>
```

### 3. Update EVChargerBadge.tsx (bonus fix)

Also has tooltips that won't work on mobile. Update to use HybridTooltip for consistency.

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/components/ui/hybrid-tooltip.tsx` | **Create** - New hybrid component |
| `src/pages/Booking.tsx` | **Modify** - Replace service fee tooltip with HybridTooltip |
| `src/components/ev/EVChargerBadge.tsx` | **Modify** - Replace tooltip with HybridTooltip |

---

## Technical Details

### HybridTooltip Component Structure

```tsx
import { useIsMobile } from "@/hooks/use-mobile";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

interface HybridTooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}

export function HybridTooltip({ content, children, side = "top", className }: HybridTooltipProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    // On mobile: use Popover (click-based)
    return (
      <Popover>
        <PopoverTrigger asChild>{children}</PopoverTrigger>
        <PopoverContent side={side} className={...}>
          {content}
        </PopoverContent>
      </Popover>
    );
  }

  // On desktop: use Tooltip (hover-based)
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side} className={className}>
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
```

### Popover Styling for Tooltip-like Appearance

The Popover will be styled to look like a tooltip:
- Smaller width (`w-auto max-w-[220px]` instead of `w-72`)
- Smaller padding (`p-2` instead of `p-4`)
- Smaller text (`text-xs`)
