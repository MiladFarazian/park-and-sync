-- Add revealed_at column to reviews table for double-blind system
ALTER TABLE public.reviews ADD COLUMN revealed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add review_window_ends_at column to bookings table
ALTER TABLE public.bookings ADD COLUMN review_window_ends_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Function to check and reveal reviews when conditions are met
CREATE OR REPLACE FUNCTION public.check_and_reveal_reviews(p_booking_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review_count INTEGER;
  v_window_expired BOOLEAN;
  v_review_window_ends_at TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Get review window end time
  SELECT review_window_ends_at INTO v_review_window_ends_at
  FROM bookings WHERE id = p_booking_id;
  
  -- Check if window expired
  v_window_expired := v_review_window_ends_at IS NOT NULL AND v_review_window_ends_at <= NOW();
  
  -- Count reviews for this booking
  SELECT COUNT(*) INTO v_review_count
  FROM reviews WHERE booking_id = p_booking_id;
  
  -- Reveal reviews if both submitted (2 reviews) OR window expired (and at least 1 review exists)
  IF v_review_count >= 2 OR (v_window_expired AND v_review_count > 0) THEN
    UPDATE reviews
    SET revealed_at = NOW()
    WHERE booking_id = p_booking_id AND revealed_at IS NULL;
  END IF;
END;
$$;

-- Trigger function to auto-check reveal on review insert
CREATE OR REPLACE FUNCTION public.trigger_check_reveal_reviews()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.check_and_reveal_reviews(NEW.booking_id);
  RETURN NEW;
END;
$$;

-- Create trigger on reviews table
DROP TRIGGER IF EXISTS after_review_insert ON public.reviews;
CREATE TRIGGER after_review_insert
AFTER INSERT ON public.reviews
FOR EACH ROW
EXECUTE FUNCTION public.trigger_check_reveal_reviews();

-- Trigger to set review_window_ends_at when booking is completed
CREATE OR REPLACE FUNCTION public.set_review_window_on_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When booking status changes to 'completed', set review window to 14 days from now
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    NEW.review_window_ends_at := NOW() + INTERVAL '14 days';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_review_window_trigger ON public.bookings;
CREATE TRIGGER set_review_window_trigger
BEFORE UPDATE ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.set_review_window_on_completion();

-- Update RLS policy for reviews - only show revealed reviews or your own pending review
DROP POLICY IF EXISTS "Anyone can view public reviews" ON public.reviews;

CREATE POLICY "Users can view revealed or own reviews"
ON public.reviews
FOR SELECT
USING (
  (revealed_at IS NOT NULL AND is_public = true)
  OR reviewer_id = auth.uid()
);