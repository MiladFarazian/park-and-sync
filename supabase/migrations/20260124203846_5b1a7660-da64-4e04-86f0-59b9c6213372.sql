-- Create the atomic booking hold function with row locking
CREATE OR REPLACE FUNCTION public.create_booking_hold_atomic(
  p_spot_id UUID,
  p_user_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ,
  p_expires_at TIMESTAMPTZ,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, hold_id UUID, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hold_id UUID;
  v_existing_hold_id UUID;
  v_conflict_count INTEGER;
BEGIN
  -- Check for existing hold with same idempotency key (return existing if found)
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_hold_id
    FROM booking_holds
    WHERE idempotency_key = p_idempotency_key
      AND user_id = p_user_id
      AND expires_at > NOW();
    
    IF v_existing_hold_id IS NOT NULL THEN
      RETURN QUERY SELECT TRUE, v_existing_hold_id, NULL::TEXT;
      RETURN;
    END IF;
  END IF;

  -- Lock the spot row to prevent race conditions
  PERFORM id FROM spots WHERE id = p_spot_id FOR UPDATE;

  -- Check for conflicting active bookings
  SELECT COUNT(*) INTO v_conflict_count
  FROM bookings
  WHERE spot_id = p_spot_id
    AND status IN ('active', 'confirmed', 'pending', 'held')
    AND start_at < p_end_at
    AND end_at > p_start_at;

  IF v_conflict_count > 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Spot is not available for the requested time - booking conflict'::TEXT;
    RETURN;
  END IF;

  -- Check for conflicting active holds (excluding expired ones)
  SELECT COUNT(*) INTO v_conflict_count
  FROM booking_holds
  WHERE spot_id = p_spot_id
    AND status = 'active'
    AND expires_at > NOW()
    AND user_id != p_user_id  -- Allow same user to get a new hold
    AND start_at < p_end_at
    AND end_at > p_start_at;

  IF v_conflict_count > 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Another user is currently booking this spot'::TEXT;
    RETURN;
  END IF;

  -- Expire any old holds by this user for this spot/time
  UPDATE booking_holds
  SET status = 'expired'
  WHERE spot_id = p_spot_id
    AND user_id = p_user_id
    AND status = 'active'
    AND start_at < p_end_at
    AND end_at > p_start_at;

  -- Create the new hold
  INSERT INTO booking_holds (
    spot_id,
    user_id,
    start_at,
    end_at,
    expires_at,
    status,
    idempotency_key
  ) VALUES (
    p_spot_id,
    p_user_id,
    p_start_at,
    p_end_at,
    p_expires_at,
    'active',
    p_idempotency_key
  )
  RETURNING id INTO v_hold_id;

  RETURN QUERY SELECT TRUE, v_hold_id, NULL::TEXT;
END;
$$;