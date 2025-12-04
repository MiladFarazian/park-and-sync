-- Sync profiles review_count and rating with actual reviews data
UPDATE profiles p SET
  review_count = (SELECT COUNT(*) FROM reviews r WHERE r.reviewee_id = p.user_id),
  rating = COALESCE(
    (SELECT ROUND(AVG(r.rating)::numeric, 2) FROM reviews r WHERE r.reviewee_id = p.user_id),
    0
  )
WHERE EXISTS (SELECT 1 FROM reviews r WHERE r.reviewee_id = p.user_id);