-- Update existing pending bookings that have payment intents to active status
-- This fixes bookings that were created before the webhook properly set the status
UPDATE bookings 
SET status = 'active' 
WHERE status = 'pending' 
AND stripe_payment_intent_id IS NOT NULL;