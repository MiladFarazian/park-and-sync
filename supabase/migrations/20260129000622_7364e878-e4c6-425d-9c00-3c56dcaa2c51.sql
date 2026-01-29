-- Update validate_booking to skip availability check when only linking guest bookings
-- (updating renter_id/guest_user_id on an existing booking)

CREATE OR REPLACE FUNCTION validate_booking()
RETURNS TRIGGER AS $$
BEGIN
  -- Skip validation when only updating linking fields (guest_user_id, renter_id)
  -- This is needed for the link-guest-bookings flow where we link existing bookings to new accounts
  IF TG_OP = 'UPDATE' THEN
    -- If spot_id, start_at, or end_at haven't changed, skip the availability check
    -- This allows updating renter_id for guest booking linking without re-validating
    IF OLD.spot_id = NEW.spot_id 
       AND OLD.start_at = NEW.start_at 
       AND OLD.end_at = NEW.end_at THEN
      RETURN NEW;
    END IF;
  END IF;

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
$$ LANGUAGE plpgsql;