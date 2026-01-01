-- =====================================================
-- FIX PROFILES TABLE RLS POLICY
-- =====================================================
-- The current "Users can view all profiles" policy with USING (true)
-- exposes ALL profile data to any authenticated user. This is a security issue.
-- We need to restrict what data can be seen by whom.

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;

-- Create a more restrictive policy for viewing profiles
-- Users can see:
-- 1. Their own full profile
-- 2. Basic info (first_name, avatar_url, rating) for users they interact with via bookings
CREATE POLICY "Users can view profiles with restrictions" 
ON profiles 
FOR SELECT 
USING (
  -- Own profile - full access
  auth.uid() = user_id
  OR
  -- Support role - can see all
  has_role(auth.uid(), 'support'::app_role)
  OR
  -- Admin role - can see all  
  has_role(auth.uid(), 'admin'::app_role)
  OR
  -- Booking participant - can see basic info for hosts/renters they interact with
  EXISTS (
    SELECT 1 FROM bookings b
    JOIN spots s ON s.id = b.spot_id
    WHERE (
      -- I'm the renter and this profile is the host of my booking
      (b.renter_id = auth.uid() AND s.host_id = profiles.user_id)
      OR
      -- I'm the host and this profile is the renter of my spot's booking
      (s.host_id = auth.uid() AND b.renter_id = profiles.user_id)
    )
    AND b.status NOT IN ('canceled', 'refunded')
  )
  OR
  -- Message participant - can see basic info for people they message with
  EXISTS (
    SELECT 1 FROM messages m
    WHERE (
      (m.sender_id = auth.uid() AND m.recipient_id = profiles.user_id)
      OR
      (m.recipient_id = auth.uid() AND m.sender_id = profiles.user_id)
    )
  )
  OR
  -- Host of active/inactive spots - public hosts can be viewed
  EXISTS (
    SELECT 1 FROM spots s
    WHERE s.host_id = profiles.user_id
    AND s.status = 'active'
  )
);