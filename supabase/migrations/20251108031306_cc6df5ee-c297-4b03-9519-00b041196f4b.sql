-- Create validation trigger function for bookings table
-- This enforces availability checks at the database level
CREATE OR REPLACE FUNCTION public.validate_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Validate time ordering
  IF NEW.start_at >= NEW.end_at THEN
    RAISE EXCEPTION 'end_at must be after start_at';
  END IF;

  -- Validate spot availability using existing RPC function
  IF NOT public.check_spot_availability(NEW.spot_id, NEW.start_at, NEW.end_at, NEW.renter_id) THEN
    RAISE EXCEPTION 'Spot is not available for the requested time';
  END IF;

  RETURN NEW;
END;
$$;

-- Drop trigger if it exists and create new one
DROP TRIGGER IF EXISTS trg_validate_booking ON public.bookings;

CREATE TRIGGER trg_validate_booking
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_booking();

-- Add comment for documentation
COMMENT ON FUNCTION public.validate_booking() IS 'Validates booking times and spot availability before insert/update. Provides database-level enforcement of booking rules.';