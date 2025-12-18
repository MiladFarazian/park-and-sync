-- Add booking_reminder_host to the notification type check constraint
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'booking', 'booking_host', 'booking_ending_soon', 'overstay_warning', 
  'overstay_detected', 'overstay_action_needed', 'overstay_grace_ended', 
  'overstay_charge_update', 'overstay_charge_finalized', 'overstay_booking_completed', 
  'booking_completed', 'booking_extended', 'booking_pending', 'booking_approval_required',
  'booking_reminder_host'
));