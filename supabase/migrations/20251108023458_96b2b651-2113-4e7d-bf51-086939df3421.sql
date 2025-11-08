-- Create a trigger function that calls the edge function for support messages
CREATE OR REPLACE FUNCTION public.forward_support_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  service_role_key text;
BEGIN
  -- Only process messages sent TO support (not FROM support)
  IF NEW.recipient_id = '00000000-0000-0000-0000-000000000001'::uuid THEN
    -- Get service role key from vault or use environment variable
    service_role_key := current_setting('app.settings.service_role_key', true);
    
    -- Make async HTTP request to edge function using pg_net
    PERFORM net.http_post(
      url := 'https://mqbupmusmciijsjmzbcu.supabase.co/functions/v1/forward-support-messages',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(service_role_key, '')
      ),
      body := jsonb_build_object(
        'type', 'INSERT',
        'table', 'messages',
        'record', row_to_json(NEW),
        'schema', 'public'
      )
    );
    
    -- Log for debugging
    RAISE LOG 'Support message forwarding triggered for message %', NEW.id;
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Don't fail the insert if webhook fails
    RAISE WARNING 'Failed to forward support message: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_forward_support_message ON public.messages;

-- Create trigger that fires after insert
CREATE TRIGGER trigger_forward_support_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.forward_support_message();