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