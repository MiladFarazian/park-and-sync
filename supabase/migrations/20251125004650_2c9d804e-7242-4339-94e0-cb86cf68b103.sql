-- Fix parameter order in validate_booking function
-- The 4th and 5th parameters were swapped, causing user's own holds to not be excluded
CREATE OR REPLACE FUNCTION validate_booking()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if the spot is available for the requested time
  IF NOT check_spot_availability(
    NEW.spot_id,
    NEW.start_at,
    NEW.end_at,
    CASE WHEN TG_OP = 'UPDATE' THEN NEW.id ELSE NULL END,  -- Exclude this booking on UPDATE
    NEW.renter_id  -- Exclude user's own holds
  ) THEN
    RAISE EXCEPTION 'Spot is not available for the requested time';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;