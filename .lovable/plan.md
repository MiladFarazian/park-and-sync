
## Fix: Booking Extension Notification Routing and Earnings Display

### Problems Identified

**Problem 1: Wrong Routing**
When a host taps on a "Booking Extended" notification, they are taken to `/host-booking-confirmation/:id` which shows a full "Booking Confirmed!" page with confetti messaging. This is confusing because they already confirmed the booking earlier—this is just an extension update.

**Problem 2: Incorrect Earnings Calculation**  
The Host Booking Confirmation page shows:
- Booking Subtotal: $6
- Platform Fee (15%): -$1
- Your Earnings: $6 ← Should be $5

The displayed earnings don't reflect the platform fee subtraction shown above.

---

### Solution

#### Part 1: Route Extension Notifications to Booking Detail

Change the `extend-booking` edge function to:
1. Use notification type `booking_extended` instead of `booking_host`
2. Update the push notification URL to `/booking/:bookingId` instead of `/host-booking-confirmation/:bookingId`

Then update `NotificationBell.tsx` to route `booking_extended` notifications to `/booking/:id`.

This ensures the host sees the existing booking detail page with updated times, rather than a new "confirmation" experience.

#### Part 2: Fix Earnings Display in HostBookingConfirmation

The page currently shows `hostEarnings` for the "Your Earnings" line, but this value comes from the database's `host_earnings` field (or a fallback calculation). The display should be consistent:
- Either show the breakdown using the stored values
- Or use the `getHostNetEarnings` utility for consistency across the app

---

### Technical Details

**File 1: `supabase/functions/extend-booking/index.ts`**

Lines 246-254 (first occurrence) and 433-441 (second occurrence):

| Before | After |
|--------|-------|
| `type: 'booking_host',` | `type: 'booking_extended',` |

Lines 270 and 454 (push notification URL):

| Before | After |
|--------|-------|
| `url: '/host-booking-confirmation/${bookingId}',` | `url: '/booking/${bookingId}',` |

---

**File 2: `src/components/layout/NotificationBell.tsx`**

Add a new case at line 197 (inside `navigateToNotification`):

```text
Before lines 197-199:
  } else if (notification.type === "booking_host" || notification.type === "booking_approval_required") {
    if (mode === 'driver') setMode('host');
    navigate(`/host-booking-confirmation/${notification.related_id}`);

Add after:
  } else if (notification.type === "booking_extended") {
    if (mode === 'driver') setMode('host');
    navigate(`/booking/${notification.related_id}`);
```

---

**File 3: `src/pages/HostBookingConfirmation.tsx`**

Line 202 - Fix earnings calculation:

| Before | After |
|--------|-------|
| `const hostEarnings = booking.host_earnings \|\| (booking.subtotal - booking.platform_fee);` | Import and use `getHostNetEarnings(booking)` from `@/lib/hostEarnings` |

Lines 340-350 - The earnings breakdown display currently shows a formula but uses a potentially different value. Two options:

**Option A (Recommended):** Simply show the final earnings amount without the misleading breakdown, since the breakdown formula (subtotal - 15%) doesn't match actual host earnings calculation.

**Option B:** Calculate the breakdown correctly using the actual pricing logic.

---

### Summary of Changes

| File | Change |
|------|--------|
| `supabase/functions/extend-booking/index.ts` | Change notification type from `booking_host` to `booking_extended`; update push URL to `/booking/:id` |
| `src/components/layout/NotificationBell.tsx` | Add routing for `booking_extended` type → `/booking/:id` |
| `src/pages/HostBookingConfirmation.tsx` | Use `getHostNetEarnings()` for consistent earnings display |
