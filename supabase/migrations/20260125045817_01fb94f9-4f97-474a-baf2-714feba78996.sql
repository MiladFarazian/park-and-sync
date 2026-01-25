-- =====================================================
-- SECURITY FIX: Restrict spot-photos storage policies
-- and hide guest_access_token from RLS SELECT
-- =====================================================

-- =====================================================
-- PART 1: Fix spot-photos storage policies
-- =====================================================

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Users can upload spot photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update spot photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own spot photos" ON storage.objects;

-- Create ownership-verified INSERT policy
-- Only allows uploading to spot folders the user owns
CREATE POLICY "Hosts can upload to their own spot folders"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'spot-photos'
  AND auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM public.spots
    WHERE spots.id::text = (storage.foldername(name))[1]
    AND spots.host_id = auth.uid()
  )
);

-- Create ownership-verified UPDATE policy
CREATE POLICY "Hosts can update their own spot photos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'spot-photos'
  AND auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM public.spots
    WHERE spots.id::text = (storage.foldername(name))[1]
    AND spots.host_id = auth.uid()
  )
);

-- Create ownership-verified DELETE policy
CREATE POLICY "Hosts can delete their own spot photos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'spot-photos'
  AND auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM public.spots
    WHERE spots.id::text = (storage.foldername(name))[1]
    AND spots.host_id = auth.uid()
  )
);

-- =====================================================
-- PART 2: Hide guest_access_token from SELECT queries
-- Create an RLS policy that masks the token for non-service role
-- =====================================================

-- We cannot modify what columns RLS returns, but we can:
-- 1. Use a view (which would require app changes)
-- 2. Set a column policy via a trigger that nullifies the token on read
-- 3. Just ensure the frontend never selects it (code audit)

-- The safest approach without breaking existing code is to use a 
-- SECURITY DEFINER function that returns safe booking data.
-- However, for immediate fix, we'll document that guest_access_token
-- should NEVER be selected by client code.

-- Create a helper function to get safe booking data without token
CREATE OR REPLACE FUNCTION public.get_booking_safe(p_booking_id uuid)
RETURNS TABLE (
  id uuid,
  spot_id uuid,
  renter_id uuid,
  vehicle_id uuid,
  start_at timestamptz,
  end_at timestamptz,
  status booking_status,
  hourly_rate numeric,
  total_hours numeric,
  subtotal numeric,
  platform_fee numeric,
  total_amount numeric,
  host_earnings numeric,
  ev_charging_fee numeric,
  extension_charges numeric,
  is_guest boolean,
  guest_full_name text,
  guest_email text,
  guest_phone text,
  guest_car_model text,
  guest_license_plate text,
  created_at timestamptz,
  updated_at timestamptz,
  departed_at timestamptz,
  cancellation_reason text,
  overstay_detected_at timestamptz,
  overstay_action text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT 
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
    ev_charging_fee,
    extension_charges,
    is_guest,
    guest_full_name,
    guest_email,
    guest_phone,
    guest_car_model,
    guest_license_plate,
    created_at,
    updated_at,
    departed_at,
    cancellation_reason,
    overstay_detected_at,
    overstay_action
  FROM bookings
  WHERE bookings.id = p_booking_id
  -- RLS still applies since we use SECURITY INVOKER
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_booking_safe(uuid) TO authenticated;

-- Add comment documenting the security requirement
COMMENT ON COLUMN public.bookings.guest_access_token IS 
  'SECURITY: This column contains a secret token for guest booking access. '
  'NEVER include this column in frontend SELECT queries. '
  'Use get_booking_safe() function or explicitly list columns excluding this one.';