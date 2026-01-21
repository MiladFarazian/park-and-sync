ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS privacy_show_profile_photo BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS privacy_show_full_name BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS privacy_show_in_reviews BOOLEAN DEFAULT true;