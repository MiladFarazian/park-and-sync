-- Add balance tracking to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS balance numeric DEFAULT 0.0 NOT NULL;

-- Add host earnings tracking to bookings
ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS host_earnings numeric;

COMMENT ON COLUMN public.profiles.balance IS 'Pending earnings balance that can be withdrawn once Stripe is connected';
COMMENT ON COLUMN public.bookings.host_earnings IS 'Amount owed to host (subtotal minus platform fee)';
