-- Drop the previous trigger and function
DROP TRIGGER IF EXISTS on_support_message_created ON public.messages;
DROP FUNCTION IF EXISTS notify_support_message();

-- Note: We'll use Supabase's built-in Database Webhooks feature instead
-- This needs to be configured in the Supabase Dashboard under Database > Webhooks
-- For now, we'll just add a comment noting this

-- To set up the webhook manually:
-- 1. Go to Supabase Dashboard > Database > Webhooks
-- 2. Create a new webhook with:
--    - Table: messages
--    - Events: INSERT
--    - Type: HTTP Request
--    - URL: https://mqbupmusmciijsjmzbcu.supabase.co/functions/v1/forward-support-messages
--    - HTTP Headers: Add Authorization header with service role key

COMMENT ON TABLE public.messages IS 'Webhook needed: Configure in Dashboard to forward support messages to forward-support-messages edge function';