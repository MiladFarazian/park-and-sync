
# Booking Extension Notifications - Implementation Plan

## Current Gap Analysis

The booking extension flow currently has incomplete notification coverage:

| Notification Type | Host | Driver |
|-------------------|------|--------|
| In-app (Bell) | Yes (`booking_extended`) | Missing |
| Push | Yes | Yes |
| Email | Missing | Missing |

## Implementation Overview

We will add complete notification parity for booking extensions, matching the experience of the initial booking confirmation.

---

## 1. Database: Add `extension_confirmed` Notification Type

Add a new notification type to the database constraint for driver extension confirmations.

**Migration:**
```sql
ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check 
CHECK (type = ANY (ARRAY[
  -- existing types...
  'extension_confirmed'::text  -- NEW: for driver extension confirmation
]));
```

---

## 2. Edge Function: Create Driver In-App Notification

**File:** `supabase/functions/extend-booking/index.ts`

Add an in-app notification for the driver (currently only push notification is sent):

```typescript
// After host notification - add driver in-app notification
const { error: driverNotifError } = await supabase
  .from('notifications')
  .insert({
    user_id: userData.user.id,
    type: 'extension_confirmed',
    title: 'Extension Confirmed',
    message: driverMessage,
    related_id: bookingId,
  });
```

This change applies to both the finalize path (line ~300) and the direct payment path (line ~488).

---

## 3. Edge Function: Send Extension Confirmation Emails

**New File:** `supabase/functions/send-extension-confirmation/index.ts`

Create a new edge function to send styled HTML emails for extension confirmations:

- **Driver Email:** "Extension Confirmed" with updated booking times and total
- **Host Email:** "Booking Extended" with extension details and updated earnings

The email templates will follow the same design pattern as `send-booking-confirmation`, including:
- Parkzy branding header
- Updated booking details (new end time, extension duration)
- Updated payment summary (original + extension cost)
- Magic link authentication for one-click access
- CTA buttons to view booking

---

## 4. Edge Function: Trigger Email from extend-booking

**File:** `supabase/functions/extend-booking/index.ts`

Add call to the new email function after successful extension:

```typescript
// Send extension confirmation emails
try {
  await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-extension-confirmation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    },
    body: JSON.stringify({
      bookingId,
      driverEmail,
      driverName,
      hostEmail,
      hostName,
      spotTitle: booking.spots.title,
      spotAddress: booking.spots.address,
      originalEndTime: booking.end_at,
      newEndTime: newEndTime.toISOString(),
      extensionHours,
      extensionCost,
      newTotalAmount: booking.total_amount + extensionCost,
      hostEarnings,
    }),
  });
} catch (emailError) {
  console.error('Failed to send extension emails:', emailError);
}
```

---

## 5. Frontend: Update NotificationBell Routing

**File:** `src/components/layout/NotificationBell.tsx`

Add handling for `extension_confirmed` notification type:

```typescript
// In getNotificationIcon
case 'extension_confirmed':
case 'booking_extended':
  return CalendarPlus;  // Or Clock icon for time extension

// In getIconColor
case 'extension_confirmed':
case 'booking_extended':
  return "text-green-600";  // Success color

// In navigateToNotification
} else if (notification.type === "extension_confirmed") {
  // Driver's extension confirmed - switch to driver mode
  if (mode === 'host') setMode('driver');
  navigate(`/booking/${notification.related_id}`);
} else if (notification.type === "booking_extended") {
  // Host sees booking was extended - switch to host mode
  if (mode === 'driver') setMode('host');
  navigate(`/booking/${notification.related_id}`);
}
```

---

## 6. Import CalendarPlus Icon

**File:** `src/components/layout/NotificationBell.tsx`

Add the `CalendarPlus` icon import for extension notifications:

```typescript
import { Bell, Calendar, MessageCircle, AlertTriangle, Check, Clock, CheckCheck, CalendarPlus } from "lucide-react";
```

---

## Files to Modify/Create

| File | Action |
|------|--------|
| `supabase/migrations/YYYYMMDD_add_extension_confirmed_type.sql` | Create |
| `supabase/functions/extend-booking/index.ts` | Modify (add driver notification + email trigger) |
| `supabase/functions/send-extension-confirmation/index.ts` | Create (new email function) |
| `src/components/layout/NotificationBell.tsx` | Modify (add icon + routing) |

---

## User Experience After Implementation

### Driver Experience
1. Extends booking
2. Receives in-app notification "Extension Confirmed" with new end time
3. Receives push notification "Extension Confirmed"
4. Receives email "Extension Confirmed" with updated booking details
5. Clicking notification navigates to `/booking/:id` showing updated info

### Host Experience
1. Driver extends booking
2. Receives in-app notification "Booking Extended" with new end time
3. Receives push notification "Booking Extended"
4. Receives email "Booking Extended" with updated earnings
5. Clicking notification navigates to `/booking/:id` showing updated info

---

## Technical Notes

- The existing `BookingDetail.tsx` page already displays `extension_charges` in the Payment Details section, so no page modifications are needed
- The booking data already includes `original_total_amount` and `extension_charges` fields for accurate display
- Email template will require fetching driver/host profile data for names and emails
