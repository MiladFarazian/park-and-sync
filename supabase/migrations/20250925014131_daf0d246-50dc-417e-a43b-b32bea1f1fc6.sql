-- Add photos for the LA parking spots
INSERT INTO public.spot_photos (spot_id, url, is_primary, sort_order)
SELECT s.id, '/src/assets/usc-garage.jpg', true, 0
FROM public.spots s 
WHERE s.title = 'USC Campus Adjacent Garage';

INSERT INTO public.spot_photos (spot_id, url, is_primary, sort_order)
SELECT s.id, '/src/assets/exposition-driveway.jpg', true, 0
FROM public.spots s 
WHERE s.title = 'Exposition Park Driveway';

INSERT INTO public.spot_photos (spot_id, url, is_primary, sort_order)
SELECT s.id, '/src/assets/santa-monica-pier.jpg', true, 0
FROM public.spots s 
WHERE s.title = 'Santa Monica Pier Parking';

INSERT INTO public.spot_photos (spot_id, url, is_primary, sort_order)
SELECT s.id, '/src/assets/third-street-garage.jpg', true, 0
FROM public.spots s 
WHERE s.title = 'Third Street Promenade Garage';

INSERT INTO public.spot_photos (spot_id, url, is_primary, sort_order)
SELECT s.id, '/src/assets/sunset-strip.jpg', true, 0
FROM public.spots s 
WHERE s.title = 'Sunset Strip Premium';

INSERT INTO public.spot_photos (spot_id, url, is_primary, sort_order)
SELECT s.id, '/src/assets/rodeo-drive.jpg', true, 0
FROM public.spots s 
WHERE s.title = 'Rodeo Drive Luxury';

INSERT INTO public.spot_photos (spot_id, url, is_primary, sort_order)
SELECT s.id, '/src/assets/venice-beach.jpg', true, 0
FROM public.spots s 
WHERE s.title = 'Venice Beach Boardwalk';

INSERT INTO public.spot_photos (spot_id, url, is_primary, sort_order)
SELECT s.id, '/src/assets/staples-center.jpg', true, 0
FROM public.spots s 
WHERE s.title = 'Staples Center Event Parking';

-- Add placeholder images for remaining spots
INSERT INTO public.spot_photos (spot_id, url, is_primary, sort_order)
SELECT s.id, '/placeholder.svg', true, 0
FROM public.spots s 
WHERE s.title NOT IN (
  'USC Campus Adjacent Garage',
  'Exposition Park Driveway', 
  'Santa Monica Pier Parking',
  'Third Street Promenade Garage',
  'Sunset Strip Premium',
  'Rodeo Drive Luxury',
  'Venice Beach Boardwalk',
  'Staples Center Event Parking'
);