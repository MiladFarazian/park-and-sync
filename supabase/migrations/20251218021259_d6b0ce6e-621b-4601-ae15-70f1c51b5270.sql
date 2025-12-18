-- Schedule the expire-pending-bookings job to run every 5 minutes
SELECT cron.schedule(
  'expire-pending-bookings-every-5-min',
  '*/5 * * * *',
  $$
  SELECT
    net.http_post(
        url:='https://mqbupmusmciijsjmzbcu.supabase.co/functions/v1/expire-pending-bookings',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xYnVwbXVzbWNpaWpzam16YmN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgzNDE4NDIsImV4cCI6MjA3MzkxNzg0Mn0.KH78FaqEJRubmX22V4Kq6pTfGSqBLNmzGmHPESv0-yU"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);