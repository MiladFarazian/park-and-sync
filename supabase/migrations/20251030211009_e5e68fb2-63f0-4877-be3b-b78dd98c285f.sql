-- Add optimized indexes for message queries
-- Index for fetching messages in a conversation (most common query)
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages (sender_id, recipient_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_reverse ON public.messages (recipient_id, sender_id, created_at ASC);

-- Remove the less useful delivered_at index since we now have conversation indexes
DROP INDEX IF EXISTS idx_messages_delivered_at;