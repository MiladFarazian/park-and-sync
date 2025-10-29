-- Enable Row Level Security on messages table
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view their own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can insert their own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can update their own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can delete their own messages" ON public.messages;

-- Create policy for viewing messages (user is either sender or recipient)
CREATE POLICY "Users can view their own messages" 
ON public.messages 
FOR SELECT 
USING (
  auth.uid() = sender_id OR 
  auth.uid() = recipient_id
);

-- Create policy for inserting messages (user must be the sender)
CREATE POLICY "Users can insert their own messages" 
ON public.messages 
FOR INSERT 
WITH CHECK (auth.uid() = sender_id);

-- Create policy for updating messages (user is either sender or recipient)
CREATE POLICY "Users can update their own messages" 
ON public.messages 
FOR UPDATE 
USING (
  auth.uid() = sender_id OR 
  auth.uid() = recipient_id
);

-- Create policy for deleting messages (user is either sender or recipient)
CREATE POLICY "Users can delete their own messages" 
ON public.messages 
FOR DELETE 
USING (
  auth.uid() = sender_id OR 
  auth.uid() = recipient_id
);