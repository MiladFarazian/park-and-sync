
-- Enable required extensions for cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Create cron job to detect overstays every 5 minutes
SELECT cron.schedule(
  'detect-overstays-every-5-minutes',
  '*/5 * * * *',
  $$
  SELECT
    net.http_post(
        url:='https://mqbupmusmciijsjmzbcu.supabase.co/functions/v1/detect-overstays',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xYnVwbXVzbWNpaWpzam16YmN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgzNDE4NDIsImV4cCI6MjA3MzkxNzg0Mn0.KH78FaqEJRubmX22V4Kq6pTfGSqBLNmzGmHPESv0-yU"}'::jsonb,
        body:=concat('{"time": "', now(), '"}')::jsonb
    ) as request_id;
  $$
);
