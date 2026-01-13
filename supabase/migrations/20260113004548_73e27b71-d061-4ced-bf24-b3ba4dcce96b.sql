-- Create favorite_spots table for users to save parking spots
CREATE TABLE public.favorite_spots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  spot_id UUID NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, spot_id)
);

-- Enable RLS
ALTER TABLE public.favorite_spots ENABLE ROW LEVEL SECURITY;

-- Users can view their own favorites
CREATE POLICY "Users can view own favorites" ON public.favorite_spots
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own favorites
CREATE POLICY "Users can insert own favorites" ON public.favorite_spots
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can delete their own favorites
CREATE POLICY "Users can delete own favorites" ON public.favorite_spots
  FOR DELETE USING (auth.uid() = user_id);

-- Add index for faster lookups
CREATE INDEX idx_favorite_spots_user_id ON public.favorite_spots(user_id);
CREATE INDEX idx_favorite_spots_spot_id ON public.favorite_spots(spot_id);