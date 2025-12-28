-- Add guest booking fields to bookings table
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS is_guest boolean DEFAULT false;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS guest_full_name text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS guest_email text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS guest_phone text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS guest_car_model text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS guest_license_plate text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS guest_access_token text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS guest_user_id uuid;

-- Create index for efficient guest access token lookups
CREATE INDEX IF NOT EXISTS idx_bookings_guest_access_token 
ON public.bookings (guest_access_token) WHERE guest_access_token IS NOT NULL;