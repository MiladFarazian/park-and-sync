-- Disable the validate booking trigger
ALTER TABLE bookings DISABLE TRIGGER trg_validate_booking;

-- Fix the 2 stuck bookings from November
UPDATE bookings 
SET status = 'completed', overstay_action = 'pending_action', updated_at = now()
WHERE id IN ('473706af-abab-4fd9-a192-d99ddb4ad1f1', '569d5055-89a1-414c-bbd0-e2b70863fe70');

-- Re-enable the trigger
ALTER TABLE bookings ENABLE TRIGGER trg_validate_booking;

-- Clear all existing overstay_grace_ended notifications
DELETE FROM notifications WHERE type = 'overstay_grace_ended';