-- Fix validate_booking trigger to skip availability check during cancellations
CREATE OR REPLACE FUNCTION public.validate_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Skip validation if status is being set to canceled
  IF NEW.status = 'canceled' THEN
    RETURN NEW;
  END IF;

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
$function$;