-- Add instant_book column to spots table (default true for instant booking)
ALTER TABLE public.spots 
ADD COLUMN instant_book boolean NOT NULL DEFAULT true;

-- Update all existing spots to be instant book (they already will be due to default, but being explicit)
UPDATE public.spots SET instant_book = true WHERE instant_book IS NULL;