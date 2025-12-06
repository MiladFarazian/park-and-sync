-- Update the handle_new_user function to capture phone number for phone-authenticated users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, phone, email_verified, phone_verified)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.phone,
    NEW.email_confirmed_at IS NOT NULL,
    NEW.phone_confirmed_at IS NOT NULL
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Backfill existing phone-authenticated users who have null phone in profiles
UPDATE public.profiles p
SET phone = u.phone
FROM auth.users u
WHERE p.user_id = u.id
  AND p.phone IS NULL
  AND u.phone IS NOT NULL;