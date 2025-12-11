import { supabase } from '@/integrations/supabase/client';
import type { Message } from '@/hooks/useMessages';

export function sendMessage({
  recipientId,
  senderId,
  messageText,
  setMessages,
  onSuccess,
  onError,
}: {
  recipientId: string;
  senderId: string;
  messageText: string;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  onSuccess?: () => void;
  onError?: (error: any) => void;
}): string {
  const clientId = crypto.randomUUID();
  const tempId = `temp-${clientId}`;

  console.time('[PERF] send:optimistic-render');
  
  // Optimistic update - add message immediately
  const optimisticMessage: Message = {
    id: tempId,
    sender_id: senderId,
    recipient_id: recipientId,
    message: messageText,
    created_at: new Date().toISOString(),
    read_at: null,
    delivered_at: null,
    media_url: null,
    media_type: null,
    client_id: clientId,
  };

  // Add optimistic message (no in-place mutation)
  setMessages(prev => {
    console.timeEnd('[PERF] send:optimistic-render');
    return [...prev, optimisticMessage];
  });

  // 1) Broadcast immediately for instant cross-client echo
  const channel = supabase.channel(`messages:${recipientId}:${senderId}`, {
    config: { broadcast: { ack: false } }
  });
  channel.send({
    type: 'broadcast',
    event: 'pending_message',
    payload: {
      client_id: clientId,
      sender_id: senderId,
      recipient_id: recipientId,
      message: messageText,
      media_url: null,
      media_type: null,
      created_at: optimisticMessage.created_at,
    }
  });
  // Prevent channel leaks: remove after next tick so the message can flush
  setTimeout(() => {
    try { supabase.removeChannel(channel); } catch {}
  }, 0);

  // 2) Fire-and-forget insert (non-blocking)
  console.time('[PERF] send:insert-request');
  const insertStartTime = performance.now();
  
  supabase
    .from('messages')
    .insert({
      sender_id: senderId,
      recipient_id: recipientId,
      message: messageText,
      delivered_at: new Date().toISOString(),
      client_id: clientId,
    })
    .then(({ error }) => {
      console.timeEnd('[PERF] send:insert-request');
      console.log('[PERF] send:insert-latency-ms', performance.now() - insertStartTime);
      
      if (error) {
        console.error('Error sending message:', error);
        // Mark message as error (keep in UI to allow retry)
        setMessages(prev => 
          prev.map(m => m.id === tempId ? { ...m, id: `error-${clientId}` } : m)
        );
        onError?.(error);
      } else {
        // Success - Broadcast to update conversation lists
        const notifyChannel = supabase.channel(`messages-broadcast-${recipientId}`);
        notifyChannel.send({
          type: 'broadcast',
          event: 'new_message',
          payload: { sender_id: senderId, recipient_id: recipientId }
        });
        setTimeout(() => {
          try { supabase.removeChannel(notifyChannel); } catch {}
        }, 100);
        
        // Also notify sender's conversation list
        const senderNotifyChannel = supabase.channel(`messages-broadcast-${senderId}`);
        senderNotifyChannel.send({
          type: 'broadcast',
          event: 'new_message',
          payload: { sender_id: senderId, recipient_id: recipientId }
        });
        setTimeout(() => {
          try { supabase.removeChannel(senderNotifyChannel); } catch {}
        }, 100);
        
        onSuccess?.();
      }
    });

  return clientId;
}
