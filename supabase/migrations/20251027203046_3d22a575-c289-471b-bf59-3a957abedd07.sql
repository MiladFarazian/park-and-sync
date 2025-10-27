-- Enable RLS on booking_holds table
ALTER TABLE booking_holds ENABLE ROW LEVEL SECURITY;

-- Allow users to insert their own booking holds
CREATE POLICY "Users can create their own booking holds"
ON booking_holds
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Allow users to view their own booking holds
CREATE POLICY "Users can view their own booking holds"
ON booking_holds
FOR SELECT
USING (auth.uid() = user_id);

-- Allow users to delete their own booking holds (for cleanup)
CREATE POLICY "Users can delete their own booking holds"
ON booking_holds
FOR DELETE
USING (auth.uid() = user_id);

-- Allow service role to manage all holds (for cleanup functions)
CREATE POLICY "Service role can manage all booking holds"
ON booking_holds
FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role');
