-- Create missing RPC used by the create-booking edge function
-- This performs an atomic booking insert with row locking and conflict checks.

CREATE OR REPLACE FUNCTION public.create_booking_atomic(
  p_spot_id UUID,
  p_user_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ,
  p_vehicle_id UUID,
  p_idempotency_key TEXT,
  p_will_use_ev_charging BOOLEAN,
  p_hourly_rate NUMERIC,
  p_total_hours NUMERIC,
  p_subtotal NUMERIC,
  p_platform_fee NUMERIC,
  p_total_amount NUMERIC,
  p_host_earnings NUMERIC,
  p_ev_charging_fee NUMERIC
)
RETURNS TABLE(success BOOLEAN, booking_id UUID, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking_id UUID;
  v_existing_booking_id UUID;
  v_conflict_count INTEGER;
  v_spot_host_id UUID;
BEGIN
  -- Basic validation
  IF p_start_at IS NULL OR p_end_at IS NULL OR p_end_at <= p_start_at THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Invalid time range'::TEXT;
    RETURN;
  END IF;

  -- Idempotency: return existing booking for the same user + key
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_booking_id
    FROM bookings
    WHERE renter_id = p_user_id
      AND idempotency_key = p_idempotency_key
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing_booking_id IS NOT NULL THEN
      RETURN QUERY SELECT TRUE, v_existing_booking_id, NULL::TEXT;
      RETURN;
    END IF;
  END IF;

  -- Lock the spot row to prevent race conditions
  SELECT host_id INTO v_spot_host_id
  FROM spots
  WHERE id = p_spot_id
  FOR UPDATE;

  IF v_spot_host_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Spot not found'::TEXT;
    RETURN;
  END IF;

  -- Prevent self-booking (defense-in-depth)
  IF v_spot_host_id = p_user_id THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'You cannot book your own spot'::TEXT;
    RETURN;
  END IF;

  -- Validate vehicle ownership if provided
  IF p_vehicle_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM vehicles
      WHERE id = p_vehicle_id AND user_id = p_user_id
    ) THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, 'Invalid vehicle selection'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- Conflicting bookings for this spot (only in-flight/active statuses)
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
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Spot is not available for the requested time'::TEXT;
    RETURN;
  END IF;

  -- Conflicting holds by other users (unexpired)
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

  -- Insert booking
  INSERT INTO bookings (
    spot_id,
    renter_id,
    vehicle_id,
    start_at,
    end_at,
    status,
    hourly_rate,
    total_hours,
    subtotal,
    platform_fee,
    total_amount,
    host_earnings,
    will_use_ev_charging,
    ev_charging_fee,
    idempotency_key
  ) VALUES (
    p_spot_id,
    p_user_id,
    p_vehicle_id,
    p_start_at,
    p_end_at,
    'pending'::booking_status,
    p_hourly_rate,
    p_total_hours,
    p_subtotal,
    p_platform_fee,
    p_total_amount,
    p_host_earnings,
    COALESCE(p_will_use_ev_charging, FALSE),
    COALESCE(p_ev_charging_fee, 0),
    p_idempotency_key
  )
  RETURNING id INTO v_booking_id;

  -- Clear any overlapping unexpired holds for this user/spot
  DELETE FROM booking_holds
  WHERE spot_id = p_spot_id
    AND user_id = p_user_id
    AND expires_at > NOW()
    AND start_at < p_end_at
    AND end_at > p_start_at;

  RETURN QUERY SELECT TRUE, v_booking_id, NULL::TEXT;
END;
$$;

-- Ensure authenticated users can execute this RPC (create-booking is JWT-protected)
GRANT EXECUTE ON FUNCTION public.create_booking_atomic(
  UUID,
  UUID,
  TIMESTAMPTZ,
  TIMESTAMPTZ,
  UUID,
  TEXT,
  BOOLEAN,
  NUMERIC,
  NUMERIC,
  NUMERIC,
  NUMERIC,
  NUMERIC,
  NUMERIC,
  NUMERIC
) TO authenticated;