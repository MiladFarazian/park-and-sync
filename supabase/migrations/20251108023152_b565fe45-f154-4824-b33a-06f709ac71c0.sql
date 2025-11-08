-- Create a webhook to trigger support message forwarding
-- This will call the edge function when a message is sent to the support user

CREATE OR REPLACE FUNCTION notify_support_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  payload jsonb;
  request_id bigint;
BEGIN
  -- Only forward messages sent TO support (not FROM support)
  IF NEW.recipient_id = '00000000-0000-0000-0000-000000000001'::uuid THEN
    -- Prepare payload
    payload := jsonb_build_object(
      'type', 'INSERT',
      'table', 'messages',
      'record', row_to_json(NEW),
      'schema', 'public'
    );
    
    -- Make async HTTP request to edge function
    SELECT http_post INTO request_id FROM net.http_post(
      url := 'https://mqbupmusmciijsjmzbcu.supabase.co/functions/v1/forward-support-messages',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := payload
    );
    
    -- Log the request (optional, for debugging)
    RAISE NOTICE 'Support message forwarding triggered for message %', NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to call the function after insert
DROP TRIGGER IF EXISTS on_support_message_created ON public.messages;

CREATE TRIGGER on_support_message_created
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_support_message();