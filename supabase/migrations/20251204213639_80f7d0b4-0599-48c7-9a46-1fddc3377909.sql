-- Add category column to spots table
ALTER TABLE public.spots ADD COLUMN category text;

-- Add a check constraint for valid categories
ALTER TABLE public.spots ADD CONSTRAINT spots_category_check 
CHECK (category IN ('Residential Driveway', 'Apartment / Condo Lot', 'Commercial Lot', 'Garage', 'Street Parking', 'Event / Venue Lot'));