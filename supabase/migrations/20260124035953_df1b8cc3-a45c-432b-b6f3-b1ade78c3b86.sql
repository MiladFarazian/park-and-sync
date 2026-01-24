-- Drop the old constraint and add updated one with booking_declined type
ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;

ALTER TABLE notifications ADD CONSTRAINT notifications_type_check 
CHECK (type = ANY (ARRAY[
  'booking'::text, 
  'booking_host'::text, 
  'booking_ending_soon'::text, 
  'overstay_warning'::text, 
  'overstay_detected'::text, 
  'overstay_action_needed'::text, 
  'overstay_grace_ended'::text, 
  'overstay_charge_update'::text, 
  'overstay_charge_finalized'::text, 
  'overstay_booking_completed'::text, 
  'booking_completed'::text, 
  'booking_extended'::text, 
  'booking_pending'::text, 
  'booking_approval_required'::text, 
  'booking_reminder_host'::text,
  'booking_declined'::text
]));

-- Fix existing declined booking notifications that were created with wrong type
UPDATE notifications 
SET type = 'booking_declined' 
WHERE type = 'booking' 
  AND title LIKE '%Declined%';