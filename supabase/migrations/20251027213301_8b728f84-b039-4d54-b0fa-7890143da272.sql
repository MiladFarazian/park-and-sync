-- Create function to safely increment host balance
CREATE OR REPLACE FUNCTION public.increment_balance(
  user_id uuid,
  amount numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.profiles
  SET balance = balance + amount
  WHERE profiles.user_id = increment_balance.user_id;
END;
$$;

COMMENT ON FUNCTION public.increment_balance IS 'Safely increment a user balance when they earn money from bookings';
