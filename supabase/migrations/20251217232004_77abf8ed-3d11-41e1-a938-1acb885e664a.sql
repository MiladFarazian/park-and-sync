-- Clear all overstay-related notifications
DELETE FROM notifications 
WHERE type IN (
  'booking_ending_soon',
  'overstay_warning',
  'overstay_detected',
  'overstay_action_needed',
  'overstay_grace_ended',
  'overstay_charge_update',
  'overstay_charge_finalized',
  'overstay_booking_completed'
);

-- Fix the overstay_action check constraint to include 'pending_action'
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_overstay_action_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_overstay_action_check 
CHECK (overstay_action IN ('charging', 'towing', 'pending_action') OR overstay_action IS NULL);