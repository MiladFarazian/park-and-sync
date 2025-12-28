-- Add EV charging columns to spots table
ALTER TABLE public.spots ADD COLUMN IF NOT EXISTS ev_charging_instructions text;
ALTER TABLE public.spots ADD COLUMN IF NOT EXISTS ev_charging_premium_per_hour numeric DEFAULT 0;

-- Add EV charging columns to bookings table
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS will_use_ev_charging boolean DEFAULT false;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS ev_charging_fee numeric DEFAULT 0;