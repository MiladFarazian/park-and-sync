
# Plan: Fix Parameter Mismatch in Demand Notification Push

## Problem Identified

The `notify-hosts-demand` edge function is sending push notification requests to `send-push-notification` with **incorrect parameter names**, causing all push notifications to fail silently.

### Evidence from Logs
```
[notify-hosts-demand] Failed to send notification to host 4b63dc97-3ca5-4e6b-b40b-fc9f77f300ed
[notify-hosts-demand] Successfully notified 1 hosts  <-- Misleading: it recorded the notification, but delivery failed
```

### Root Cause: Parameter Name Mismatch

| `notify-hosts-demand` SENDS | `send-push-notification` EXPECTS |
|---------------------------|----------------------------------|
| `user_id`                 | `userId`                        |
| `message`                 | `body`                          |

**In `notify-hosts-demand/index.ts` (lines 212-218):**
```typescript
body: JSON.stringify({
  user_id: hostId,           // ❌ Wrong - should be "userId"
  title: 'Drivers searching nearby!',
  message: '...',            // ❌ Wrong - should be "body"
  url: `/manage-availability?date=${pacificDate}`,
  type: 'demand_availability',
}),
```

**In `send-push-notification/index.ts` (line 175-177):**
```typescript
const { userId, userIds, title, body, ... } = await req.json();
const targetUserIds = userIds || (userId ? [userId] : []);
// Since "user_id" is sent, "userId" is undefined → targetUserIds = []
```

## The Fix

Update `notify-hosts-demand/index.ts` to use the correct parameter names.

### Code Change

**File: `supabase/functions/notify-hosts-demand/index.ts`**

**Lines 212-218** - Change from:
```typescript
body: JSON.stringify({
  user_id: hostId,
  title: 'Drivers searching nearby!',
  message: 'Update your availability today to earn. Tap to manage your spot.',
  url: `/manage-availability?date=${pacificDate}`,
  type: 'demand_availability',
}),
```

To:
```typescript
body: JSON.stringify({
  userId: hostId,
  title: 'Drivers searching nearby!',
  body: 'Update your availability today to earn. Tap to manage your spot.',
  url: `/manage-availability?date=${pacificDate}`,
  type: 'demand_availability',
}),
```

## Summary

| Parameter | Before (broken) | After (fixed) |
|-----------|-----------------|---------------|
| User ID   | `user_id`       | `userId`      |
| Message   | `message`       | `body`        |

## Expected Result

After this fix, when a driver searches in Sawtelle and no spots are available within 0.5 miles:
1. The `notify-hosts-demand` function will correctly pass the host's user ID
2. `send-push-notification` will find and send to the host's push subscriptions
3. The host at 10 Speed Coffee will receive a push notification on their devices

## Additional Note: In-App Notifications

This fix only addresses **push notifications**. The system currently does not create an in-app notification record (in the `notifications` table) for demand alerts. If you also want in-app notifications to appear in the notification bell, that would require an additional change to insert into the `notifications` table.
