

# Plan: Add Swipe-to-Dismiss for Host Calendar Date Popup

## Overview
Replace the current `Sheet` (Radix Dialog) component with the `Drawer` (vaul) component for the Host Calendar date detail popup. The Drawer component natively supports swipe-to-dismiss gestures, providing the exact UX you're looking for - dragging/swiping down on the top of the popup will close it and return to the full calendar view.

## Current Implementation
- The Host Calendar uses `Sheet` from `@radix-ui/react-dialog` with `side="bottom"` (lines 1105-1244)
- The Sheet opens when clicking a calendar date (`handleDayClick`) and displays availability and booking details
- Sheet does not support native swipe-to-dismiss

## Solution
The project already has a `Drawer` component (powered by vaul) that includes:
- Native swipe-to-dismiss gesture handling
- A visual "handle" indicator at the top (the gray pill/bar that signals it's draggable)
- Smooth animations for opening/closing
- Same bottom-sheet positioning

## Implementation Steps

### 1. Update Imports in HostCalendar.tsx
Replace:
```typescript
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
```
With:
```typescript
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
```

### 2. Replace Sheet with Drawer Component
Change the day detail sheet JSX from:
```tsx
<Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
  <SheetContent side="bottom" className="h-[85vh] rounded-t-xl">
    <SheetHeader className="pb-4 border-b">
      <SheetTitle>...</SheetTitle>
    </SheetHeader>
    {/* content */}
  </SheetContent>
</Sheet>
```
To:
```tsx
<Drawer open={sheetOpen} onOpenChange={setSheetOpen}>
  <DrawerContent className="max-h-[85vh]">
    <DrawerHeader className="pb-4 border-b">
      <DrawerTitle>...</DrawerTitle>
    </DrawerHeader>
    {/* content */}
  </DrawerContent>
</Drawer>
```

### 3. Adjust Scroll Container Height
Update the inner scrollable area to work with the Drawer:
```tsx
<div className="py-4 space-y-6 overflow-y-auto max-h-[calc(85vh-120px)] px-4">
```
The extra height accounts for the Drawer handle and header padding.

## Technical Details

### Why Drawer (vaul) Works
The Drawer component from vaul is specifically designed for mobile-first bottom sheets with built-in gesture support:
- Tracks touch/pointer movements on the handle and content
- Calculates drag velocity and distance to determine dismissal
- Provides smooth spring animations
- Already includes the visual drag indicator (gray bar at top)

### No Additional Hooks Needed
Unlike custom swipe implementations, vaul handles all gesture detection internally. The existing `useSwipeNavigation` hook is for horizontal navigation between weeks/months and remains separate.

## Files to Modify
| File | Changes |
|------|---------|
| `src/pages/HostCalendar.tsx` | Replace Sheet imports with Drawer, update JSX for the day detail popup |

## Expected Behavior After Implementation
1. User taps a date on the calendar
2. Drawer slides up from the bottom showing date details
3. User can swipe/drag down on the handle (gray bar) or the header area to dismiss
4. Drawer slides down and calendar is fully visible again

