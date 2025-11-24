-- Fix check_spot_availability to properly handle calendar overrides (both available and unavailable)
DROP FUNCTION IF EXISTS check_spot_availability(uuid, timestamptz, timestamptz, uuid, uuid);

CREATE OR REPLACE FUNCTION check_spot_availability(
  p_spot_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_exclude_booking_id uuid DEFAULT NULL,
  p_exclude_user_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_date date;
  v_end_date date;
  v_day_of_week int;
  v_start_time time;
  v_end_time time;
  v_has_override boolean;
  v_override_available boolean;
  v_override_start time;
  v_override_end time;
  v_has_weekly_rule boolean;
BEGIN
  -- Check for conflicting bookings or holds (existing logic)
  IF EXISTS (
    SELECT 1 FROM bookings
    WHERE spot_id = p_spot_id
      AND status NOT IN ('canceled', 'refunded')
      AND (id != p_exclude_booking_id OR p_exclude_booking_id IS NULL)
      AND (renter_id != p_exclude_user_id OR p_exclude_user_id IS NULL)
      AND (
        (start_at, end_at) OVERLAPS (p_start_at, p_end_at)
      )
  ) THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM booking_holds
    WHERE spot_id = p_spot_id
      AND expires_at > NOW()
      AND (user_id != p_exclude_user_id OR p_exclude_user_id IS NULL)
      AND (
        (start_at, end_at) OVERLAPS (p_start_at, p_end_at)
      )
  ) THEN
    RETURN FALSE;
  END IF;

  -- Check availability for each day in the booking range
  v_current_date := p_start_at::date;
  v_end_date := p_end_at::date;

  WHILE v_current_date <= v_end_date LOOP
    v_day_of_week := EXTRACT(DOW FROM v_current_date);
    
    -- Determine time range for this day
    IF v_current_date = p_start_at::date THEN
      v_start_time := p_start_at::time;
    ELSE
      v_start_time := '00:00:00'::time;
    END IF;

    IF v_current_date = p_end_at::date THEN
      v_end_time := p_end_at::time;
    ELSE
      v_end_time := '23:59:59'::time;
    END IF;

    -- STEP 1: Check for calendar overrides (BOTH available and unavailable)
    SELECT 
      EXISTS(SELECT 1 FROM calendar_overrides 
             WHERE spot_id = p_spot_id 
             AND override_date = v_current_date),
      COALESCE(MAX(is_available), FALSE),
      MIN(start_time),
      MAX(end_time)
    INTO v_has_override, v_override_available, v_override_start, v_override_end
    FROM calendar_overrides
    WHERE spot_id = p_spot_id
      AND override_date = v_current_date;

    IF v_has_override THEN
      -- Calendar override exists for this date
      IF NOT v_override_available THEN
        -- Date is explicitly marked as UNAVAILABLE
        RETURN FALSE;
      ELSE
        -- Date is explicitly marked as AVAILABLE
        -- Check if booking time fits within the override's time window
        IF v_override_start IS NOT NULL AND v_override_end IS NOT NULL THEN
          IF v_start_time < v_override_start OR v_end_time > v_override_end THEN
            RETURN FALSE;
          END IF;
        END IF;
        -- Override allows this time, continue to next day
      END IF;
    ELSE
      -- STEP 2: No calendar override, fall back to weekly rules
      SELECT EXISTS(
        SELECT 1 FROM availability_rules
        WHERE spot_id = p_spot_id
          AND day_of_week = v_day_of_week
          AND is_available = TRUE
          AND start_time <= v_start_time
          AND end_time >= v_end_time
      ) INTO v_has_weekly_rule;

      IF NOT v_has_weekly_rule THEN
        RETURN FALSE;
      END IF;
    END IF;

    v_current_date := v_current_date + interval '1 day';
  END LOOP;

  RETURN TRUE;
END;
$$;