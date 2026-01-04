-- Enable pg_net extension if not already enabled (for HTTP calls from triggers)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create function to delete auth user when profile is deleted
CREATE OR REPLACE FUNCTION public.handle_profile_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  supabase_url text;
  internal_secret text;
  request_id bigint;
BEGIN
  -- Get environment variables from vault or use hardcoded project URL
  supabase_url := 'https://mqbupmusmciijsjmzbcu.supabase.co';
  
  -- Get internal secret from vault
  SELECT decrypted_secret INTO internal_secret
  FROM vault.decrypted_secrets
  WHERE name = 'INTERNAL_SECRET'
  LIMIT 1;
  
  -- If no internal secret found, log error and skip
  IF internal_secret IS NULL THEN
    RAISE WARNING '[handle_profile_delete] INTERNAL_SECRET not found in vault, skipping auth user deletion for user_id: %', OLD.user_id;
    RETURN OLD;
  END IF;

  -- Call edge function to delete auth user
  SELECT net.http_post(
    url := supabase_url || '/functions/v1/delete-auth-user',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', internal_secret
    ),
    body := jsonb_build_object('user_id', OLD.user_id)
  ) INTO request_id;
  
  RAISE LOG '[handle_profile_delete] Triggered auth user deletion for user_id: %, request_id: %', OLD.user_id, request_id;
  
  RETURN OLD;
END;
$$;

-- Create trigger on profiles table
DROP TRIGGER IF EXISTS on_profile_delete ON public.profiles;

CREATE TRIGGER on_profile_delete
  AFTER DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_profile_delete();