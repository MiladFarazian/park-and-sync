-- Update the handle_new_user function to properly extract first_name and last_name from metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, phone, first_name, last_name)
  VALUES (
    new.id,
    new.email,
    new.phone,
    COALESCE(new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data ->> 'firstName'),
    COALESCE(new.raw_user_meta_data ->> 'last_name', new.raw_user_meta_data ->> 'lastName')
  )
  ON CONFLICT (user_id) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, profiles.email),
    phone = COALESCE(EXCLUDED.phone, profiles.phone),
    first_name = COALESCE(NULLIF(EXCLUDED.first_name, ''), profiles.first_name),
    last_name = COALESCE(NULLIF(EXCLUDED.last_name, ''), profiles.last_name),
    updated_at = now();
  RETURN new;
END;
$$;