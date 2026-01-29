-- Fix PostgreSQL function overloading conflict for create_booking_atomic
-- Drop both existing function signatures to resolve PGRST203 error

DROP FUNCTION IF EXISTS public.create_booking_atomic(
  UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, BOOLEAN, 
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC
);

DROP FUNCTION IF EXISTS public.create_booking_atomic(
  UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, NUMERIC, 
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, BOOLEAN, NUMERIC, TEXT
);

-- Recreate with consistent parameter order matching edge function calls
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
  v_spot_quantity INTEGER;
  v_available_quantity INTEGER;
  v_existing_booking_id UUID;
BEGIN
  -- Lock the spot row for the duration of this transaction
  SELECT quantity INTO v_spot_quantity
  FROM spots
  WHERE id = p_spot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::UUID, 'Spot not found'::TEXT;
    RETURN;
  END IF;

  -- Check for existing booking with same idempotency key (idempotency)
  SELECT id INTO v_existing_booking_id
  FROM bookings
  WHERE idempotency_key = p_idempotency_key
  LIMIT 1;

  IF v_existing_booking_id IS NOT NULL THEN
    RETURN QUERY SELECT true, v_existing_booking_id, NULL::TEXT;
    RETURN;
  END IF;

  -- Get available quantity using the helper function
  v_available_quantity := get_spot_available_quantity(
    p_spot_id,
    p_start_at,
    p_end_at,
    NULL,        -- no booking to exclude
    p_user_id    -- exclude current user's holds
  );

  -- Check if there's availability
  IF v_available_quantity < 1 THEN
    RETURN QUERY SELECT false, NULL::UUID, 'No spots available for the selected time'::TEXT;
    RETURN;
  END IF;

  -- Create the booking
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
    'pending',
    p_hourly_rate,
    p_total_hours,
    p_subtotal,
    p_platform_fee,
    p_total_amount,
    p_host_earnings,
    p_will_use_ev_charging,
    p_ev_charging_fee,
    p_idempotency_key
  )
  RETURNING id INTO v_booking_id;

  -- Delete user's hold for this spot and time range (if any)
  DELETE FROM booking_holds
  WHERE user_id = p_user_id
    AND spot_id = p_spot_id
    AND start_at = p_start_at
    AND end_at = p_end_at;

  RETURN QUERY SELECT true, v_booking_id, NULL::TEXT;
END;
$$;