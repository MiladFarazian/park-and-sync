-- Add extension tracking columns to bookings table
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS original_total_amount numeric,
ADD COLUMN IF NOT EXISTS extension_charges numeric DEFAULT 0;