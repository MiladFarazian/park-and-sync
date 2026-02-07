

## Fix: Host Not Receiving Notification When Driver Cancels Booking

### Root Cause Found
The `cancel-booking` edge function tries to insert a notification with `type: 'booking_cancelled_by_driver'`, but this type is **not allowed** by the database `notifications_type_check` constraint. The insert silently fails (the error is caught and logged, but the function continues), so no notification is ever created for the host.

The same issue affects `host-cancel-booking`, which uses `type: 'booking_cancelled_by_host'` -- also not in the constraint.

### Current Allowed Types (from latest migration)
```
booking, booking_pending, booking_host, booking_approval_required,
booking_declined, booking_rejected, booking_extended, extension_confirmed,
booking_ending_soon, message, overstay_warning, overstay_detected,
overstay_action_needed, overstay_grace_ended, overstay_charge_applied,
overstay_charge_finalized, overstay_charge_update, overstay_charging,
overstay_towing, overstay_booking_completed, departure_confirmed
```

Missing: `booking_cancelled_by_driver`, `booking_cancelled_by_host`

### Fix

**Database migration** -- Add the two missing notification types to the constraint:

```sql
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
CHECK (type = ANY (ARRAY[
  'booking', 'booking_pending', 'booking_host',
  'booking_approval_required', 'booking_declined', 'booking_rejected',
  'booking_extended', 'extension_confirmed', 'booking_ending_soon',
  'booking_cancelled_by_driver', 'booking_cancelled_by_host',
  'message',
  'overstay_warning', 'overstay_detected', 'overstay_action_needed',
  'overstay_grace_ended', 'overstay_charge_applied',
  'overstay_charge_finalized', 'overstay_charge_update',
  'overstay_charging', 'overstay_towing',
  'overstay_booking_completed', 'departure_confirmed'
]));
```

That single migration is the only change needed. The edge function code already correctly builds the notification with the right user ID, message, and related booking ID -- it just fails at insert time due to the constraint.

### Files to Modify

| Resource | Change |
|----------|--------|
| New SQL migration | Add `booking_cancelled_by_driver` and `booking_cancelled_by_host` to the `notifications_type_check` constraint |

### Risk Assessment
- **Very low risk**: Only adds two new allowed values to an existing constraint; no existing data or logic is affected.
- **Immediate impact**: Both `cancel-booking` and `host-cancel-booking` notification inserts will start succeeding immediately after migration runs.

