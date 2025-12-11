-- Enable full replica identity for complete row data in real-time events
ALTER TABLE public.messages REPLICA IDENTITY FULL;

-- Add messages table to the realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;