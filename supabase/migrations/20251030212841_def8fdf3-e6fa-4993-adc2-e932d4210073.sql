-- Make the message-media bucket public so images can be displayed
UPDATE storage.buckets 
SET public = true 
WHERE name = 'message-media';