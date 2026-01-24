
## Fix: Declined Booking Notifications Routing to Wrong Page

### Problem
When you click on a "booking declined" notification, you're taken to the booking confirmation page instead of the booking declined page.

### Root Cause
The `reject-booking` edge function creates the notification with `type: 'booking'` instead of `type: 'booking_declined'`. The notification routing logic in the app correctly handles `booking_declined` type, but the wrong type is being set when the notification is created.

### Solution
Update the `reject-booking` edge function to use the correct notification type.

---

### Technical Details

**File to modify:** `supabase/functions/reject-booking/index.ts`

**Change:** Line 130

| Before | After |
|--------|-------|
| `type: 'booking',` | `type: 'booking_declined',` |

This ensures the notification matches what `NotificationBell.tsx` expects for routing to `/booking-declined/:bookingId`.

---

### Fixing Existing Notifications

Since the old notification is already stored with the wrong type, you may want to update it directly in the database. After deploying the fix, any new declined booking notifications will route correctly.

To fix the existing notification for this booking, I can run a database update to change its type from `booking` to `booking_declined`.
