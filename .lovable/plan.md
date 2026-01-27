
# Plan: Fix Scrolling on GuestBookingDetail Page

## Problem
The guest booking detail page (`/guest-booking/:bookingId`) does not scroll on iOS devices, particularly in PWA/standalone mode. Users cannot scroll down to see all booking details, access instructions, the chat pane, or action buttons.

## Root Cause
The `GuestBookingDetail.tsx` component renders outside of `AppLayout` (which is correct for guest pages), but it's missing the iOS-specific CSS properties that enable touch scrolling. The app's other scrollable pages (AppLayout, Messages) include these properties, but this standalone page does not.

The scrollable container on line 213:
```tsx
<div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-2xl mx-auto w-full" 
     style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 2rem)' }}>
```

Is missing the critical iOS scroll properties.

## Solution
Add iOS-specific scroll properties to the scrollable container in `GuestBookingDetail.tsx`.

## Implementation Details

### File to Modify
`src/pages/GuestBookingDetail.tsx`

### Change Required (Line 213)
Update the scrollable container's style to include iOS touch scroll fixes:

**Before:**
```tsx
<div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-2xl mx-auto w-full" 
     style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 2rem)' }}>
```

**After:**
```tsx
<div 
  className="flex-1 overflow-y-auto p-4 space-y-4 max-w-2xl mx-auto w-full" 
  style={{ 
    paddingBottom: 'calc(env(safe-area-inset-bottom) + 2rem)',
    WebkitOverflowScrolling: 'touch',
    overscrollBehaviorY: 'contain',
    minHeight: 0,
  } as React.CSSProperties}
>
```

### Why These Properties

| Property | Purpose |
|----------|---------|
| `WebkitOverflowScrolling: 'touch'` | Enables momentum/inertia scrolling on iOS Safari and PWAs |
| `overscrollBehaviorY: 'contain'` | Prevents scroll chaining (page doesn't bounce or scroll parent when reaching edges) |
| `minHeight: 0` | Required for flex children to enable proper overflow behavior in flex containers |

## Testing
After implementation:
1. Open the guest booking link on an iOS device (Safari or PWA)
2. Verify the page scrolls smoothly with momentum
3. Confirm all content is reachable (photos, details, chat pane, action buttons, account CTA)
4. Test edge scrolling doesn't cause page bounce or navigation
