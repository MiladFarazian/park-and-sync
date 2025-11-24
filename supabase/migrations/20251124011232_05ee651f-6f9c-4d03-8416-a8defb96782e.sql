
-- Fix validate_booking trigger to exclude the renter's own holds when checking availability
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

  -- Check spot availability, excluding the renter's own holds
  SELECT check_spot_availability(
    NEW.spot_id,
    NEW.start_at,
    NEW.end_at,
    NEW.renter_id  -- Exclude this user's holds from the availability check
  ) INTO v_is_available;

  IF NOT v_is_available THEN
    RAISE EXCEPTION 'Spot is not available for the requested time';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
