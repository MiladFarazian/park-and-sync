import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const useTypingIndicator = (
  conversationId: string | null,
  currentUserId: string | undefined
) => {
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBroadcastRef = useRef<number>(0);

  // Broadcast that current user is typing
  const broadcastTyping = useCallback(() => {
    if (!channelRef.current || !currentUserId || !conversationId) return;
    
    // Throttle broadcasts to max 1 per 500ms
    const now = Date.now();
    if (now - lastBroadcastRef.current < 500) return;
    lastBroadcastRef.current = now;

    channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: currentUserId }
    });
  }, [currentUserId, conversationId]);

  // Broadcast that current user stopped typing
  const broadcastStoppedTyping = useCallback(() => {
    if (!channelRef.current || !currentUserId || !conversationId) return;

    channelRef.current.send({
      type: 'broadcast',
      event: 'stopped_typing',
      payload: { userId: currentUserId }
    });
  }, [currentUserId, conversationId]);

  useEffect(() => {
    if (!conversationId || !currentUserId) return;

    // Create a unique channel for this conversation pair
    const channelName = `typing:${[currentUserId, conversationId].sort().join(':')}`;
    
    const channel = supabase.channel(channelName);
    
    channel
      .on('broadcast', { event: 'typing' }, (payload) => {
        // Only show typing if it's from the other person
        if (payload.payload?.userId === conversationId) {
          setIsPartnerTyping(true);
          
          // Auto-clear typing after 3 seconds of no updates
          if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
          }
          typingTimeoutRef.current = setTimeout(() => {
            setIsPartnerTyping(false);
          }, 3000);
        }
      })
      .on('broadcast', { event: 'stopped_typing' }, (payload) => {
        if (payload.payload?.userId === conversationId) {
          setIsPartnerTyping(false);
          if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
          }
        }
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [conversationId, currentUserId]);

  return {
    isPartnerTyping,
    broadcastTyping,
    broadcastStoppedTyping
  };
};
