-- Insert support user profile
-- Handle the foreign key constraint by dropping and recreating it without validation

-- Drop the foreign key constraint if it exists
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_user_id_fkey;

-- Insert the support user profile
INSERT INTO public.profiles (
  id,
  user_id,
  first_name,
  last_name,
  email,
  role,
  rating,
  review_count,
  strikes,
  phone_verified,
  email_verified,
  kyc_status,
  stripe_account_enabled,
  balance,
  notification_booking_updates,
  notification_host_messages
)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Parkway',
  'Support',
  'support@useparkway.com',
  'renter'::user_role,
  5.0,
  0,
  0,
  true,
  true,
  'verified'::verification_status,
  false,
  0.0,
  true,
  true
)
ON CONFLICT (id) DO NOTHING;

-- Recreate the foreign key constraint but make it NOT VALID
-- This allows existing rows (like support user) to remain while validating new inserts
ALTER TABLE public.profiles 
  ADD CONSTRAINT profiles_user_id_fkey 
  FOREIGN KEY (user_id) 
  REFERENCES auth.users(id) 
  ON DELETE CASCADE 
  NOT VALID;