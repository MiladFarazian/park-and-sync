-- Update notifications type constraint to include new booking approval types
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (
  type IN (
    'booking', 
    'booking_host', 
    'booking_pending',
    'booking_approval_required',
    'message', 
    'review',
    'booking_ending_soon',
    'overstay_warning',
    'overstay_detected',
    'overstay_action_needed',
    'overstay_grace_ended',
    'overstay_charge_update',
    'overstay_charge_finalized',
    'overstay_booking_completed',
    'booking_completed',
    'booking_extended'
  )
);