-- Update check_spot_availability to check availability_rules
CREATE OR REPLACE FUNCTION public.check_spot_availability(
  p_spot_id uuid, 
  p_start_at timestamptz, 
  p_end_at timestamptz,
  p_exclude_user_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_start_time time;
  v_end_time time;
  v_start_day int;
  v_end_day int;
  v_has_rules boolean;
  v_is_available boolean;
BEGIN
  -- Check for conflicting bookings
  IF EXISTS (
    SELECT 1 FROM public.bookings 
    WHERE spot_id = p_spot_id 
    AND status NOT IN ('canceled', 'refunded')
    AND NOT (end_at <= p_start_at OR start_at >= p_end_at)
  ) THEN
    RETURN FALSE;
  END IF;
  
  -- Check for conflicting active holds (excluding the searching user's own holds)
  IF EXISTS (
    SELECT 1 FROM public.booking_holds 
    WHERE spot_id = p_spot_id 
    AND expires_at > now()
    AND (p_exclude_user_id IS NULL OR user_id != p_exclude_user_id)
    AND NOT (end_at <= p_start_at OR start_at >= p_end_at)
  ) THEN
    RETURN FALSE;
  END IF;
  
  -- Check if there are any availability rules for this spot
  SELECT EXISTS (
    SELECT 1 FROM public.availability_rules
    WHERE spot_id = p_spot_id
  ) INTO v_has_rules;
  
  -- If no rules exist, spot is available by default
  IF NOT v_has_rules THEN
    RETURN TRUE;
  END IF;
  
  -- Extract time and day from the requested period
  v_start_time := p_start_at::time;
  v_end_time := p_end_at::time;
  v_start_day := EXTRACT(DOW FROM p_start_at)::int; -- 0 = Sunday, 6 = Saturday
  v_end_day := EXTRACT(DOW FROM p_end_at)::int;
  
  -- Check calendar overrides first (they take precedence)
  IF EXISTS (
    SELECT 1 FROM public.calendar_overrides
    WHERE spot_id = p_spot_id
    AND override_date >= p_start_at::date
    AND override_date <= p_end_at::date
    AND is_available = false
  ) THEN
    RETURN FALSE;
  END IF;
  
  -- If same day booking, check if there's a matching availability rule
  IF v_start_day = v_end_day THEN
    SELECT EXISTS (
      SELECT 1 FROM public.availability_rules
      WHERE spot_id = p_spot_id
      AND day_of_week = v_start_day
      AND is_available = true
      AND start_time <= v_start_time
      AND end_time >= v_end_time
    ) INTO v_is_available;
    
    RETURN v_is_available;
  END IF;
  
  -- For multi-day bookings, check each day has availability
  -- This is simplified - checks if each day has ANY availability rule
  FOR i IN 0..(EXTRACT(EPOCH FROM (p_end_at - p_start_at)) / 86400)::int LOOP
    DECLARE
      v_check_day int;
    BEGIN
      v_check_day := EXTRACT(DOW FROM (p_start_at + (i || ' days')::interval))::int;
      
      IF NOT EXISTS (
        SELECT 1 FROM public.availability_rules
        WHERE spot_id = p_spot_id
        AND day_of_week = v_check_day
        AND is_available = true
      ) THEN
        RETURN FALSE;
      END IF;
    END;
  END LOOP;
  
  RETURN TRUE;
END;
$$;