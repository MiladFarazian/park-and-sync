-- Add refund columns to bookings table
ALTER TABLE public.bookings
ADD COLUMN refund_amount numeric DEFAULT 0,
ADD COLUMN stripe_refund_id text;