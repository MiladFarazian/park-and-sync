-- Create function to sync profile name to auth.users metadata
CREATE OR REPLACE FUNCTION public.sync_profile_name_to_auth()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Update auth.users raw_user_meta_data with the new first_name and last_name
  UPDATE auth.users
  SET raw_user_meta_data = 
    COALESCE(raw_user_meta_data, '{}'::jsonb) || 
    jsonb_build_object(
      'first_name', NEW.first_name,
      'last_name', NEW.last_name,
      'full_name', TRIM(COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, ''))
    )
  WHERE id = NEW.user_id;
  
  RETURN NEW;
END;
$$;

-- Create trigger to fire on profile name updates
CREATE TRIGGER on_profile_name_updated
  AFTER UPDATE OF first_name, last_name ON public.profiles
  FOR EACH ROW
  WHEN (OLD.first_name IS DISTINCT FROM NEW.first_name OR OLD.last_name IS DISTINCT FROM NEW.last_name)
  EXECUTE FUNCTION public.sync_profile_name_to_auth();