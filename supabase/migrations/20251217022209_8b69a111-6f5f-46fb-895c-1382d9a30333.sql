-- Drop the existing check constraint on notifications type
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Add a new check constraint that includes all notification types
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (
  type IN (
    'booking',
    'booking_host',
    'message',
    'payment',
    'review',
    'system',
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