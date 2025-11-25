-- Fix timezone conversion in check_spot_availability function
CREATE OR REPLACE FUNCTION check_spot_availability(
  p_spot_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_exclude_booking_id uuid DEFAULT NULL,
  p_exclude_user_id uuid DEFAULT NULL
) RETURNS boolean AS $$
DECLARE
  v_current_date date;
  v_end_date date;
  v_day_of_week int;
  v_available boolean;
  v_override record;
  v_rule record;
  v_local_start timestamptz;
  v_local_end timestamptz;
  v_current_start_time time;
  v_current_end_time time;
BEGIN
  -- Convert UTC to Pacific Time for proper date/time comparisons
  v_local_start := p_start_at AT TIME ZONE 'America/Los_Angeles';
  v_local_end := p_end_at AT TIME ZONE 'America/Los_Angeles';
  
  -- Extract dates from local times
  v_current_date := v_local_start::date;
  v_end_date := v_local_end::date;

  -- Check for conflicting bookings (excluding specific booking or user's holds)
  IF EXISTS (
    SELECT 1 FROM bookings
    WHERE spot_id = p_spot_id
      AND status IN ('paid', 'active', 'held')
      AND (p_exclude_booking_id IS NULL OR id != p_exclude_booking_id)
      AND (p_exclude_user_id IS NULL OR renter_id != p_exclude_user_id)
      AND (
        (start_at <= p_start_at AND end_at > p_start_at) OR
        (start_at < p_end_at AND end_at >= p_end_at) OR
        (start_at >= p_start_at AND end_at <= p_end_at)
      )
  ) THEN
    RETURN false;
  END IF;

  -- Check for conflicting booking holds (excluding user's own holds)
  IF EXISTS (
    SELECT 1 FROM booking_holds
    WHERE spot_id = p_spot_id
      AND expires_at > NOW()
      AND (p_exclude_user_id IS NULL OR user_id != p_exclude_user_id)
      AND (
        (start_at <= p_start_at AND end_at > p_start_at) OR
        (start_at < p_end_at AND end_at >= p_end_at) OR
        (start_at >= p_start_at AND end_at <= p_end_at)
      )
  ) THEN
    RETURN false;
  END IF;

  -- Check availability for each day in the range
  WHILE v_current_date <= v_end_date LOOP
    v_day_of_week := EXTRACT(DOW FROM v_current_date);
    v_available := false;

    -- Determine time range for this day
    IF v_current_date = v_local_start::date THEN
      v_current_start_time := v_local_start::time;
    ELSE
      v_current_start_time := '00:00:00'::time;
    END IF;

    IF v_current_date = v_local_end::date THEN
      v_current_end_time := v_local_end::time;
    ELSE
      v_current_end_time := '23:59:00'::time;
    END IF;

    -- First, check for calendar overrides (higher priority)
    SELECT * INTO v_override
    FROM calendar_overrides
    WHERE spot_id = p_spot_id
      AND override_date = v_current_date
    LIMIT 1;

    IF FOUND THEN
      -- Override exists for this date
      IF v_override.is_available THEN
        -- Check if the requested time falls within override hours
        IF v_override.start_time IS NULL OR v_override.end_time IS NULL THEN
          -- Available all day
          v_available := true;
        ELSIF v_current_start_time >= v_override.start_time 
          AND v_current_end_time <= v_override.end_time THEN
          v_available := true;
        END IF;
      END IF;
    ELSE
      -- No override, check regular availability rules
      SELECT * INTO v_rule
      FROM availability_rules
      WHERE spot_id = p_spot_id
        AND day_of_week = v_day_of_week
        AND is_available = true
      LIMIT 1;

      IF FOUND THEN
        -- Check if the requested time falls within available hours
        IF v_current_start_time >= v_rule.start_time 
          AND v_current_end_time <= v_rule.end_time THEN
          v_available := true;
        END IF;
      END IF;
    END IF;

    -- If this day is not available, return false immediately
    IF NOT v_available THEN
      RETURN false;
    END IF;

    v_current_date := v_current_date + INTERVAL '1 day';
  END LOOP;

  -- All days passed the availability check
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;