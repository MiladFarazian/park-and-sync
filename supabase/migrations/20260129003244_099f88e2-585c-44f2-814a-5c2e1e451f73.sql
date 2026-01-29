-- Add quantity column to spots table (1-1000 spots per listing)
ALTER TABLE spots 
ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;

-- Add check constraint for quantity range
ALTER TABLE spots 
ADD CONSTRAINT spots_quantity_range CHECK (quantity >= 1 AND quantity <= 1000);

-- Create function to count concurrent bookings for a spot in a time window
CREATE OR REPLACE FUNCTION get_spot_booking_count(
  p_spot_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ,
  p_exclude_booking_id UUID DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  booking_count INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER INTO booking_count
  FROM bookings
  WHERE spot_id = p_spot_id
    AND status IN ('pending', 'held', 'paid', 'active')
    AND start_at < p_end_at
    AND end_at > p_start_at
    AND (p_exclude_booking_id IS NULL OR id != p_exclude_booking_id);
  
  RETURN COALESCE(booking_count, 0);
END;
$$;

-- Create function to count active holds for a spot in a time window
CREATE OR REPLACE FUNCTION get_spot_hold_count(
  p_spot_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ,
  p_exclude_user_id UUID DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hold_count INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER INTO hold_count
  FROM booking_holds
  WHERE spot_id = p_spot_id
    AND expires_at > NOW()
    AND start_at < p_end_at
    AND end_at > p_start_at
    AND (p_exclude_user_id IS NULL OR user_id != p_exclude_user_id);
  
  RETURN COALESCE(hold_count, 0);
END;
$$;

-- Create function to get available quantity for a spot
CREATE OR REPLACE FUNCTION get_spot_available_quantity(
  p_spot_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ,
  p_exclude_booking_id UUID DEFAULT NULL,
  p_exclude_user_id UUID DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  spot_quantity INTEGER;
  booking_count INTEGER;
  hold_count INTEGER;
BEGIN
  -- Get spot quantity
  SELECT quantity INTO spot_quantity FROM spots WHERE id = p_spot_id;
  
  IF spot_quantity IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Get booking count
  booking_count := get_spot_booking_count(p_spot_id, p_start_at, p_end_at, p_exclude_booking_id);
  
  -- Get hold count
  hold_count := get_spot_hold_count(p_spot_id, p_start_at, p_end_at, p_exclude_user_id);
  
  RETURN GREATEST(spot_quantity - booking_count - hold_count, 0);
END;
$$;

-- Update check_spot_availability to use quantity-aware logic
CREATE OR REPLACE FUNCTION check_spot_availability(
  p_spot_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ,
  p_exclude_booking_id UUID DEFAULT NULL,
  p_exclude_user_id UUID DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  available_qty INTEGER;
BEGIN
  available_qty := get_spot_available_quantity(p_spot_id, p_start_at, p_end_at, p_exclude_booking_id, p_exclude_user_id);
  RETURN available_qty >= 1;
END;
$$;

-- Update create_booking_hold_atomic to use quantity-aware availability
CREATE OR REPLACE FUNCTION create_booking_hold_atomic(
  p_spot_id UUID,
  p_user_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ,
  p_expires_at TIMESTAMPTZ,
  p_idempotency_key TEXT DEFAULT NULL
) RETURNS TABLE(success BOOLEAN, hold_id UUID, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hold_id UUID;
  v_spot_quantity INTEGER;
  v_available_qty INTEGER;
  v_existing_hold_id UUID;
BEGIN
  -- Check for existing hold with same idempotency key (return it if found)
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
  
  -- Lock the spot row to prevent concurrent modifications
  SELECT quantity INTO v_spot_quantity
  FROM spots
  WHERE id = p_spot_id
  FOR UPDATE;
  
  IF v_spot_quantity IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Spot not found'::TEXT;
    RETURN;
  END IF;
  
  -- Calculate available quantity (excluding current user's holds)
  v_available_qty := get_spot_available_quantity(p_spot_id, p_start_at, p_end_at, NULL, p_user_id);
  
  IF v_available_qty < 1 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'No spots available for the requested time'::TEXT;
    RETURN;
  END IF;
  
  -- Create the hold
  INSERT INTO booking_holds (spot_id, user_id, start_at, end_at, expires_at, idempotency_key)
  VALUES (p_spot_id, p_user_id, p_start_at, p_end_at, p_expires_at, p_idempotency_key)
  RETURNING id INTO v_hold_id;
  
  RETURN QUERY SELECT TRUE, v_hold_id, NULL::TEXT;
END;
$$;

-- Update create_booking_atomic to use quantity-aware availability
CREATE OR REPLACE FUNCTION create_booking_atomic(
  p_spot_id UUID,
  p_user_id UUID,
  p_vehicle_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ,
  p_hourly_rate NUMERIC,
  p_total_hours NUMERIC,
  p_subtotal NUMERIC,
  p_platform_fee NUMERIC,
  p_total_amount NUMERIC,
  p_host_earnings NUMERIC,
  p_will_use_ev_charging BOOLEAN,
  p_ev_charging_fee NUMERIC,
  p_idempotency_key TEXT
) RETURNS TABLE(success BOOLEAN, booking_id UUID, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking_id UUID;
  v_spot_quantity INTEGER;
  v_available_qty INTEGER;
  v_existing_booking_id UUID;
  v_instant_book BOOLEAN;
  v_initial_status booking_status;
BEGIN
  -- Check for existing booking with same idempotency key
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_booking_id
    FROM bookings
    WHERE idempotency_key = p_idempotency_key
      AND renter_id = p_user_id;
    
    IF v_existing_booking_id IS NOT NULL THEN
      RETURN QUERY SELECT TRUE, v_existing_booking_id, NULL::TEXT;
      RETURN;
    END IF;
  END IF;
  
  -- Lock the spot row to prevent concurrent modifications
  SELECT quantity, instant_book INTO v_spot_quantity, v_instant_book
  FROM spots
  WHERE id = p_spot_id
  FOR UPDATE;
  
  IF v_spot_quantity IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Spot not found'::TEXT;
    RETURN;
  END IF;
  
  -- Calculate available quantity (excluding current user's holds)
  v_available_qty := get_spot_available_quantity(p_spot_id, p_start_at, p_end_at, NULL, p_user_id);
  
  IF v_available_qty < 1 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'No spots available for the requested time'::TEXT;
    RETURN;
  END IF;
  
  -- Determine initial status based on instant_book
  IF v_instant_book THEN
    v_initial_status := 'held';
  ELSE
    v_initial_status := 'pending';
  END IF;
  
  -- Delete any existing holds for this user/spot/time
  DELETE FROM booking_holds
  WHERE user_id = p_user_id
    AND spot_id = p_spot_id
    AND start_at = p_start_at
    AND end_at = p_end_at;
  
  -- Create the booking
  INSERT INTO bookings (
    spot_id, renter_id, vehicle_id, start_at, end_at,
    hourly_rate, total_hours, subtotal, platform_fee, total_amount,
    host_earnings, will_use_ev_charging, ev_charging_fee, idempotency_key, status
  )
  VALUES (
    p_spot_id, p_user_id, p_vehicle_id, p_start_at, p_end_at,
    p_hourly_rate, p_total_hours, p_subtotal, p_platform_fee, p_total_amount,
    p_host_earnings, p_will_use_ev_charging, p_ev_charging_fee, p_idempotency_key, v_initial_status
  )
  RETURNING id INTO v_booking_id;
  
  RETURN QUERY SELECT TRUE, v_booking_id, NULL::TEXT;
END;
$$;

-- Add performance index for concurrent booking queries
CREATE INDEX IF NOT EXISTS idx_bookings_spot_time_status 
ON bookings(spot_id, start_at, end_at) 
WHERE status IN ('pending', 'held', 'paid', 'active');

-- Add index for holds queries
CREATE INDEX IF NOT EXISTS idx_booking_holds_spot_time 
ON booking_holds(spot_id, start_at, end_at, expires_at);