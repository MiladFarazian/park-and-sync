-- Create a function to send welcome email when email is confirmed
CREATE OR REPLACE FUNCTION public.send_welcome_email_on_confirm()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_first_name TEXT;
  user_email TEXT;
BEGIN
  -- Only trigger when email_confirmed_at changes from NULL to a value
  IF OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL THEN
    -- Get user info
    user_email := NEW.email;
    user_first_name := NEW.raw_user_meta_data ->> 'first_name';
    
    -- Call the edge function to send welcome email
    PERFORM net.http_post(
      url := 'https://mqbupmusmciijsjmzbcu.supabase.co/functions/v1/send-welcome-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('supabase.service_role_key', true)
      ),
      body := jsonb_build_object(
        'userId', NEW.id::text,
        'email', user_email,
        'firstName', user_first_name
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on auth.users for email confirmation
DROP TRIGGER IF EXISTS on_email_confirmed ON auth.users;
CREATE TRIGGER on_email_confirmed
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.send_welcome_email_on_confirm();