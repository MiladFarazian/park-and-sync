-- Create spot-photos storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('spot-photos', 'spot-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can view spot photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload spot photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own spot photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own spot photos" ON storage.objects;

-- Policy: Anyone can view photos from spot-photos bucket
CREATE POLICY "Anyone can view spot photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'spot-photos');

-- Policy: Authenticated users can upload their own spot photos
CREATE POLICY "Users can upload spot photos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'spot-photos' 
  AND auth.role() = 'authenticated'
);

-- Policy: Users can update their own spot photos
CREATE POLICY "Users can update own spot photos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'spot-photos'
  AND auth.role() = 'authenticated'
);

-- Policy: Users can delete their own spot photos
CREATE POLICY "Users can delete own spot photos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'spot-photos'
  AND auth.role() = 'authenticated'
);