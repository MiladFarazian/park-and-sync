-- Add media and status columns to messages table
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS media_url TEXT,
ADD COLUMN IF NOT EXISTS media_type TEXT,
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE;

-- Create storage bucket for message media
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('message-media', 'message-media', false, 52428800, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies for message media
CREATE POLICY "Users can upload their own message media"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'message-media' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view message media they sent or received"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'message-media' AND
  (
    auth.uid()::text = (storage.foldername(name))[1] OR
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE (m.sender_id = auth.uid() OR m.recipient_id = auth.uid())
      AND m.media_url LIKE '%' || name || '%'
    )
  )
);

CREATE POLICY "Users can delete their own message media"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'message-media' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Create index for faster queries on delivered_at
CREATE INDEX IF NOT EXISTS idx_messages_delivered_at ON public.messages(delivered_at);