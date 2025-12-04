-- Drop the existing check constraint and recreate it with 'booking_host' included
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check 
CHECK (type IN ('booking', 'booking_host', 'message', 'cancellation', 'overstay', 'system'));