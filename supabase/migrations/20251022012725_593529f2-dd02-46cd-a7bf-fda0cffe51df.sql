-- Add notification preference columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN notification_booking_updates boolean DEFAULT true,
ADD COLUMN notification_host_messages boolean DEFAULT true;