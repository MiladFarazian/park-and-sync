-- Add extension_confirmed notification type for driver extension confirmations
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check 
CHECK (type = ANY (ARRAY[
  'booking'::text,
  'booking_pending'::text,
  'booking_host'::text,
  'booking_approval_required'::text,
  'booking_declined'::text,
  'booking_rejected'::text,
  'booking_extended'::text,
  'extension_confirmed'::text,
  'booking_ending_soon'::text,
  'message'::text,
  'overstay_warning'::text,
  'overstay_detected'::text,
  'overstay_action_needed'::text,
  'overstay_grace_ended'::text,
  'overstay_charge_applied'::text,
  'overstay_charge_finalized'::text,
  'overstay_charge_update'::text,
  'overstay_charging'::text,
  'overstay_towing'::text,
  'overstay_booking_completed'::text,
  'departure_confirmed'::text
]));