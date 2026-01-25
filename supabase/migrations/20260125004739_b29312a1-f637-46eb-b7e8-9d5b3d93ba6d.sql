-- Add preference for hosts to see their own spots when searching as a driver
ALTER TABLE public.profiles 
ADD COLUMN show_own_spots_in_search boolean DEFAULT false;