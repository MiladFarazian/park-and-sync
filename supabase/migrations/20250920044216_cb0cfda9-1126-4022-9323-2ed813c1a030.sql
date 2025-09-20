-- Fix function search path security warnings
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, email_verified)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.email_confirmed_at IS NOT NULL
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION public.cleanup_expired_holds()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.booking_holds WHERE expires_at < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.check_spot_availability(
  p_spot_id UUID,
  p_start_at TIMESTAMP WITH TIME ZONE,
  p_end_at TIMESTAMP WITH TIME ZONE
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check for conflicting bookings
  IF EXISTS (
    SELECT 1 FROM public.bookings 
    WHERE spot_id = p_spot_id 
    AND status NOT IN ('canceled', 'refunded')
    AND NOT (end_at <= p_start_at OR start_at >= p_end_at)
  ) THEN
    RETURN FALSE;
  END IF;
  
  -- Check for conflicting active holds
  IF EXISTS (
    SELECT 1 FROM public.booking_holds 
    WHERE spot_id = p_spot_id 
    AND expires_at > now()
    AND NOT (end_at <= p_start_at OR start_at >= p_end_at)
  ) THEN
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;