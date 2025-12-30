-- Create favorite_locations table for syncing across devices
CREATE TABLE public.favorite_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create unique constraint to prevent duplicate locations per user
CREATE UNIQUE INDEX favorite_locations_user_location_idx 
ON public.favorite_locations (user_id, latitude, longitude);

-- Enable RLS
ALTER TABLE public.favorite_locations ENABLE ROW LEVEL SECURITY;

-- Users can view their own favorites
CREATE POLICY "Users can view their own favorite locations"
ON public.favorite_locations
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own favorites
CREATE POLICY "Users can create their own favorite locations"
ON public.favorite_locations
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own favorites
CREATE POLICY "Users can delete their own favorite locations"
ON public.favorite_locations
FOR DELETE
USING (auth.uid() = user_id);

-- Add index for faster lookups by user
CREATE INDEX favorite_locations_user_id_idx ON public.favorite_locations(user_id);