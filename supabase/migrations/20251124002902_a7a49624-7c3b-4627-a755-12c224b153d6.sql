-- Fix the validate_booking trigger to skip availability check on status-only updates
CREATE OR REPLACE FUNCTION public.validate_booking()
RETURNS TRIGGER AS $$
DECLARE
  v_is_available boolean;
BEGIN
  -- Skip availability check if this is an UPDATE and booking times haven't changed
  IF TG_OP = 'UPDATE' THEN
    IF (OLD.start_at = NEW.start_at AND OLD.end_at = NEW.end_at) THEN
      -- Times haven't changed, skip availability check
      RETURN NEW;
    END IF;
  END IF;

  -- Validate that end_at is after start_at
  IF NEW.end_at <= NEW.start_at THEN
    RAISE EXCEPTION 'Booking end time must be after start time';
  END IF;

  -- Check spot availability
  SELECT check_spot_availability(
    NEW.spot_id,
    NEW.start_at,
    NEW.end_at
  ) INTO v_is_available;

  IF NOT v_is_available THEN
    RAISE EXCEPTION 'Spot is not available for the requested time';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fix any existing stuck bookings that were charged but stuck in pending
-- Only update bookings that have a payment intent ID but are still pending
UPDATE bookings
SET status = 'active'
WHERE status = 'pending'
  AND stripe_payment_intent_id IS NOT NULL
  AND stripe_payment_intent_id != '';