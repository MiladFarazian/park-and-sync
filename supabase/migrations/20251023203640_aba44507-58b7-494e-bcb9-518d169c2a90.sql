-- Add explicit SELECT policy for hosts to view all their own spots regardless of status
CREATE POLICY "Hosts can view all own spots"
ON spots
FOR SELECT
USING (auth.uid() = host_id);