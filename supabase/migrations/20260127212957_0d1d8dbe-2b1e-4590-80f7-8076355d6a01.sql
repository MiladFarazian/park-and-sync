-- Create a function to get public booking stats (count only, no sensitive data)
CREATE OR REPLACE FUNCTION public.get_public_booking_count()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COUNT(*)::integer
  FROM public.bookings
  WHERE status IN ('paid', 'active', 'completed');
$$;