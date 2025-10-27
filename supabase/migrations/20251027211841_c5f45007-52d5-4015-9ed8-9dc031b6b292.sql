-- Drop and recreate functions to fix availability checking
DROP FUNCTION IF EXISTS public.cleanup_expired_holds();

CREATE OR REPLACE FUNCTION public.cleanup_expired_holds()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  DELETE FROM public.booking_holds WHERE expires_at < now();
$$;

-- Update check_spot_availability to exclude holds from the searching user
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
  
  RETURN TRUE;
END;
$$;