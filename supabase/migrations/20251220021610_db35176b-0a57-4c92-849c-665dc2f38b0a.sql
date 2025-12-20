-- Add ADA accessible column to spots table
ALTER TABLE public.spots 
ADD COLUMN is_ada_accessible boolean DEFAULT false;