-- booking_holds table has no status column; treat holds as active when expires_at > now()
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
  -- Optional idempotency: return existing unexpired hold for this user + key
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

  -- Ensure spot exists and lock row to prevent races
  IF NOT EXISTS (SELECT 1 FROM spots WHERE id = p_spot_id FOR UPDATE) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Spot not found'::TEXT;
    RETURN;
  END IF;

  -- Conflicting bookings: statuses that represent an in-flight or active booking
  SELECT COUNT(*) INTO v_conflict_count
  FROM bookings
  WHERE spot_id = p_spot_id
    AND status IN (
      'pending'::booking_status,
      'held'::booking_status,
      'paid'::booking_status,
      'active'::booking_status
    )
    AND start_at < p_end_at
    AND end_at > p_start_at;

  IF v_conflict_count > 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Spot is not available for the requested time - booking conflict'::TEXT;
    RETURN;
  END IF;

  -- Conflicting holds: any unexpired hold overlaps the requested time (exclude same user)
  SELECT COUNT(*) INTO v_conflict_count
  FROM booking_holds
  WHERE spot_id = p_spot_id
    AND expires_at > NOW()
    AND user_id <> p_user_id
    AND start_at < p_end_at
    AND end_at > p_start_at;

  IF v_conflict_count > 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Another user is currently booking this spot'::TEXT;
    RETURN;
  END IF;

  -- Expire any overlapping holds by the same user by setting expires_at to now()
  UPDATE booking_holds
  SET expires_at = NOW()
  WHERE spot_id = p_spot_id
    AND user_id = p_user_id
    AND expires_at > NOW()
    AND start_at < p_end_at
    AND end_at > p_start_at;

  -- Create new hold
  INSERT INTO booking_holds (
    spot_id,
    user_id,
    start_at,
    end_at,
    expires_at,
    idempotency_key
  ) VALUES (
    p_spot_id,
    p_user_id,
    p_start_at,
    p_end_at,
    p_expires_at,
    p_idempotency_key
  )
  RETURNING id INTO v_hold_id;

  RETURN QUERY SELECT TRUE, v_hold_id, NULL::TEXT;
END;
$$;