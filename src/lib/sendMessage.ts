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
  const tempId = `temp-${crypto.randomUUID()}`;

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

  try {
    // Insert into database
    const { data, error } = await supabase
      .from('messages')
      .insert({
        sender_id: senderId,
        recipient_id: recipientId,
        message: messageText,
        media_url: mediaUrl,
        media_type: mediaType,
        delivered_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    // Reconcile optimistic message with server response
    setMessages(prev => 
      prev.map(m => m.id === tempId ? (data as Message) : m)
    );

    onSuccess?.();
  } catch (error) {
    console.error('Error sending message:', error);
    
    // Rollback optimistic update on error
    setMessages(prev => prev.filter(m => m.id !== tempId));
    
    onError?.(error);
  }
}
