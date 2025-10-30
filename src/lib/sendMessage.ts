import { supabase } from '@/integrations/supabase/client';
import type { Message } from '@/hooks/useMessages';

export async function sendMessage({
  recipientId,
  senderId,
  messageText,
  mediaUrl,
  mediaType,
  setMessages,
  onSuccess,
  onError,
}: {
  recipientId: string;
  senderId: string;
  messageText: string;
  mediaUrl: string | null;
  mediaType: string | null;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  onSuccess?: () => void;
  onError?: (error: any) => void;
}) {
  const clientId = crypto.randomUUID();
  const tempId = `temp-${clientId}`;

  // Optimistic update - add message immediately
  const optimisticMessage: Message = {
    id: tempId,
    sender_id: senderId,
    recipient_id: recipientId,
    message: messageText,
    created_at: new Date().toISOString(),
    read_at: null,
    delivered_at: null,
    media_url: mediaUrl,
    media_type: mediaType,
  };

  // Add optimistic message (no in-place mutation)
  setMessages(prev => [...prev, optimisticMessage]);

  // 1) Broadcast immediately for instant cross-client echo
  const channel = supabase.channel(`messages:${recipientId}:${senderId}`);
  channel.send({
    type: 'broadcast',
    event: 'pending_message',
    payload: {
      client_id: clientId,
      sender_id: senderId,
      recipient_id: recipientId,
      message: messageText,
      media_url: mediaUrl,
      media_type: mediaType,
      created_at: optimisticMessage.created_at,
    }
  });

  // 2) Fire-and-forget insert (non-blocking)
  supabase
    .from('messages')
    .insert({
      sender_id: senderId,
      recipient_id: recipientId,
      message: messageText,
      media_url: mediaUrl,
      media_type: mediaType,
      delivered_at: new Date().toISOString(),
      client_id: clientId,
    })
    .then(({ error }) => {
      if (error) {
        console.error('Error sending message:', error);
        // Mark message as error (keep in UI to allow retry)
        setMessages(prev => 
          prev.map(m => m.id === tempId ? { ...m, id: `error-${clientId}` } : m)
        );
        onError?.(error);
      } else {
        // Success - Realtime will reconcile the optimistic message
        onSuccess?.();
      }
    });
}
