
-- Insert a test review where the host reviewed Milad (driver) after a booking
INSERT INTO public.reviews (booking_id, reviewer_id, reviewee_id, rating, comment, is_public)
VALUES (
  'c1296fd3-73f3-4a86-8dc0-7499a1dbe684',
  'ee01eaa1-9ab0-4211-b681-615430225673',
  '4b63dc97-3ca5-4e6b-b40b-fc9f77f300ed',
  5,
  'Great driver! Arrived on time and left the spot clean. Would definitely host again.',
  true
);

-- Update the reviewee's (Milad's) profile rating
UPDATE public.profiles
SET 
  rating = CASE 
    WHEN review_count = 0 THEN 5.0
    ELSE ((COALESCE(rating, 0) * COALESCE(review_count, 0)) + 5) / (COALESCE(review_count, 0) + 1)
  END,
  review_count = COALESCE(review_count, 0) + 1
WHERE user_id = '4b63dc97-3ca5-4e6b-b40b-fc9f77f300ed';
