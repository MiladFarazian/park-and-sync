-- Add client_id column for optimistic message reconciliation
ALTER TABLE public.messages 
ADD COLUMN client_id TEXT;

-- Add index for faster lookups during reconciliation
CREATE INDEX idx_messages_client_id ON public.messages(client_id) WHERE client_id IS NOT NULL;