-- Atomic booking functions to prevent race conditions
-- ===================================================
-- This migration replaces the separate check-then-insert pattern with
-- atomic functions that use row-level locking to prevent TOCTOU vulnerabilities.

-- 1. Create an atomic booking hold function that:
--    - Locks the spot row FOR UPDATE to prevent concurrent modifications
--    - Checks availability within the same transaction
--    - Creates the hold atomically
--    - Returns the hold or NULL if spot is unavailable

CREATE OR REPLACE FUNCTION public.create_booking_hold_atomic(
  p_spot_id uuid,
  p_user_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_expires_at timestamptz,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TABLE (
  hold_id uuid,
  success boolean,
  error_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hold_id uuid;
  v_existing_hold_id uuid;
  v_idempotency text;
BEGIN
  -- Generate idempotency key if not provided
  v_idempotency := COALESCE(p_idempotency_key, gen_random_uuid()::text);

  -- Check for existing hold with same idempotency key (idempotency support)
  SELECT id INTO v_existing_hold_id
  FROM booking_holds
  WHERE idempotency_key = v_idempotency
    AND user_id = p_user_id
    AND spot_id = p_spot_id
    AND expires_at > NOW();

  IF v_existing_hold_id IS NOT NULL THEN
    -- Return existing hold (idempotent retry)
    RETURN QUERY SELECT v_existing_hold_id, true, NULL::text;
    RETURN;
  END IF;

  -- Lock the spot row to prevent concurrent hold/booking creation
  -- This serializes all booking attempts for this spot
  PERFORM 1 FROM spots WHERE id = p_spot_id FOR UPDATE;

  -- Clean up expired holds for this spot within the transaction
  DELETE FROM booking_holds
  WHERE spot_id = p_spot_id
    AND expires_at <= NOW();

  -- Check for conflicting active bookings (with lock)
  IF EXISTS (
    SELECT 1 FROM bookings
    WHERE spot_id = p_spot_id
      AND status IN ('paid', 'active', 'held', 'pending')
      AND renter_id != p_user_id  -- Allow user's own bookings to not conflict
      AND (
        (start_at <= p_start_at AND end_at > p_start_at) OR
        (start_at < p_end_at AND end_at >= p_end_at) OR
        (start_at >= p_start_at AND end_at <= p_end_at)
      )
    FOR UPDATE SKIP LOCKED  -- Skip locked rows to avoid deadlocks
  ) THEN
    RETURN QUERY SELECT NULL::uuid, false, 'Spot has a conflicting booking'::text;
    RETURN;
  END IF;

  -- Check for conflicting holds from OTHER users (with lock)
  IF EXISTS (
    SELECT 1 FROM booking_holds
    WHERE spot_id = p_spot_id
      AND user_id != p_user_id  -- Exclude user's own holds
      AND expires_at > NOW()
      AND (
        (start_at <= p_start_at AND end_at > p_start_at) OR
        (start_at < p_end_at AND end_at >= p_end_at) OR
        (start_at >= p_start_at AND end_at <= p_end_at)
      )
    FOR UPDATE SKIP LOCKED
  ) THEN
    RETURN QUERY SELECT NULL::uuid, false, 'Spot is currently being booked by another user'::text;
    RETURN;
  END IF;

  -- Check availability rules (calendar-based availability)
  IF NOT check_spot_availability(p_spot_id, p_start_at, p_end_at, NULL, p_user_id) THEN
    RETURN QUERY SELECT NULL::uuid, false, 'Spot is not available during this time'::text;
    RETURN;
  END IF;

  -- All checks passed, create the hold
  INSERT INTO booking_holds (spot_id, user_id, start_at, end_at, expires_at, idempotency_key)
  VALUES (p_spot_id, p_user_id, p_start_at, p_end_at, p_expires_at, v_idempotency)
  RETURNING id INTO v_hold_id;

  RETURN QUERY SELECT v_hold_id, true, NULL::text;

EXCEPTION
  WHEN exclusion_violation THEN
    -- EXCLUDE constraint caught a race condition (fallback safety)
    RETURN QUERY SELECT NULL::uuid, false, 'Spot is not available for the requested time'::text;
  WHEN OTHERS THEN
    RETURN QUERY SELECT NULL::uuid, false, SQLERRM::text;
END;
$$;

-- 2. Create an atomic booking creation function that:
--    - Verifies the hold exists and belongs to the user
--    - Locks relevant rows to prevent concurrent modifications
--    - Creates the booking within the same transaction
--    - Returns the booking or error

CREATE OR REPLACE FUNCTION public.create_booking_atomic(
  p_spot_id uuid,
  p_user_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_vehicle_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_will_use_ev_charging boolean DEFAULT false,
  p_hourly_rate numeric DEFAULT NULL,
  p_total_hours numeric DEFAULT NULL,
  p_subtotal numeric DEFAULT NULL,
  p_platform_fee numeric DEFAULT NULL,
  p_total_amount numeric DEFAULT NULL,
  p_host_earnings numeric DEFAULT NULL,
  p_ev_charging_fee numeric DEFAULT NULL
)
RETURNS TABLE (
  booking_id uuid,
  success boolean,
  error_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking_id uuid;
  v_existing_booking_id uuid;
  v_hold_id uuid;
  v_spot_host_id uuid;
  v_idempotency text;
BEGIN
  -- Generate idempotency key if not provided
  v_idempotency := COALESCE(p_idempotency_key, gen_random_uuid()::text);

  -- Check for existing booking with same idempotency key (idempotency support)
  SELECT id INTO v_existing_booking_id
  FROM bookings
  WHERE idempotency_key = v_idempotency
    AND renter_id = p_user_id
    AND spot_id = p_spot_id
    AND status NOT IN ('canceled', 'refunded');

  IF v_existing_booking_id IS NOT NULL THEN
    -- Return existing booking (idempotent retry)
    RETURN QUERY SELECT v_existing_booking_id, true, NULL::text;
    RETURN;
  END IF;

  -- Lock the spot row to serialize booking creation for this spot
  SELECT host_id INTO v_spot_host_id
  FROM spots
  WHERE id = p_spot_id
  FOR UPDATE;

  IF v_spot_host_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, false, 'Spot not found'::text;
    RETURN;
  END IF;

  -- Prevent self-booking
  IF p_user_id = v_spot_host_id THEN
    RETURN QUERY SELECT NULL::uuid, false, 'You cannot book your own parking spot'::text;
    RETURN;
  END IF;

  -- Verify user has a valid, non-expired hold for this exact time window
  SELECT id INTO v_hold_id
  FROM booking_holds
  WHERE spot_id = p_spot_id
    AND user_id = p_user_id
    AND start_at = p_start_at
    AND end_at = p_end_at
    AND expires_at > NOW()
  FOR UPDATE;  -- Lock the hold row

  IF v_hold_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, false, 'No valid booking hold found. Please try booking again.'::text;
    RETURN;
  END IF;

  -- Re-verify no conflicting bookings were created since the hold
  IF EXISTS (
    SELECT 1 FROM bookings
    WHERE spot_id = p_spot_id
      AND status IN ('paid', 'active', 'held', 'pending')
      AND renter_id != p_user_id
      AND (
        (start_at <= p_start_at AND end_at > p_start_at) OR
        (start_at < p_end_at AND end_at >= p_end_at) OR
        (start_at >= p_start_at AND end_at <= p_end_at)
      )
    FOR UPDATE SKIP LOCKED
  ) THEN
    -- Delete the invalid hold
    DELETE FROM booking_holds WHERE id = v_hold_id;
    RETURN QUERY SELECT NULL::uuid, false, 'Spot is no longer available for the requested time'::text;
    RETURN;
  END IF;

  -- Cancel any existing pending bookings for same spot/time/user
  UPDATE bookings
  SET status = 'canceled',
      cancellation_reason = 'Superseded by new booking attempt',
      updated_at = NOW()
  WHERE spot_id = p_spot_id
    AND renter_id = p_user_id
    AND start_at = p_start_at
    AND end_at = p_end_at
    AND status = 'pending';

  -- Create the booking
  v_booking_id := gen_random_uuid();

  INSERT INTO bookings (
    id,
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
    idempotency_key,
    will_use_ev_charging,
    ev_charging_fee
  ) VALUES (
    v_booking_id,
    p_spot_id,
    p_user_id,
    p_vehicle_id,
    p_start_at,
    p_end_at,
    'pending',
    p_hourly_rate,
    p_total_hours,
    p_subtotal,
    p_platform_fee,
    p_total_amount,
    p_host_earnings,
    v_idempotency,
    p_will_use_ev_charging,
    COALESCE(p_ev_charging_fee, 0)
  );

  -- Delete the hold since booking is now created
  DELETE FROM booking_holds WHERE id = v_hold_id;

  RETURN QUERY SELECT v_booking_id, true, NULL::text;

EXCEPTION
  WHEN exclusion_violation THEN
    -- EXCLUDE constraint caught a race condition (fallback safety)
    RETURN QUERY SELECT NULL::uuid, false, 'Spot is not available for the requested time'::text;
  WHEN OTHERS THEN
    RETURN QUERY SELECT NULL::uuid, false, SQLERRM::text;
END;
$$;

-- Grant execute permissions to authenticated users
REVOKE ALL ON FUNCTION public.create_booking_hold_atomic(uuid, uuid, timestamptz, timestamptz, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_booking_hold_atomic(uuid, uuid, timestamptz, timestamptz, timestamptz, text) TO authenticated;

REVOKE ALL ON FUNCTION public.create_booking_atomic(uuid, uuid, timestamptz, timestamptz, uuid, text, boolean, numeric, numeric, numeric, numeric, numeric, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_booking_atomic(uuid, uuid, timestamptz, timestamptz, uuid, text, boolean, numeric, numeric, numeric, numeric, numeric, numeric, numeric) TO authenticated;

-- Add helpful comments
COMMENT ON FUNCTION public.create_booking_hold_atomic IS 'Atomically creates a booking hold with proper row locking to prevent race conditions';
COMMENT ON FUNCTION public.create_booking_atomic IS 'Atomically creates a booking from a valid hold with proper row locking to prevent race conditions';
