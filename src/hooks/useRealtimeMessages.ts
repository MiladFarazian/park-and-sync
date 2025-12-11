import { useEffect, useRef, useCallback } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Message } from './useMessages';

export function useRealtimeMessages(
  conversationUserId: string | null,
  currentUserId: string | undefined,
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const setMessagesRef = useRef(setMessages);
  const activeConversationRef = useRef(conversationUserId);

  // Keep refs in sync
  useEffect(() => {
    setMessagesRef.current = setMessages;
    activeConversationRef.current = conversationUserId;
  });

  // Fetch latest messages from database
  const fetchLatestMessages = useCallback(async () => {
    if (!conversationUserId || !currentUserId) return;
    
    console.log('[realtime] Fetching latest messages');
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${currentUserId},recipient_id.eq.${conversationUserId}),and(sender_id.eq.${conversationUserId},recipient_id.eq.${currentUserId})`)
      .order('created_at', { ascending: true });

    if (!error && data) {
      setMessagesRef.current(data as Message[]);
    }
  }, [conversationUserId, currentUserId]);

  useEffect(() => {
    if (!conversationUserId || !currentUserId) return;
    
    let cancelled = false;
    const thisConversationId = conversationUserId;

    async function setupChannel() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || cancelled) return;

      // Ensure socket has valid auth token
      supabase.realtime.setAuth(session.access_token);
      console.log('[realtime] Setting up broadcast channel for:', conversationUserId);

      // Remove old channel
      if (channelRef.current) {
        await supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      // Handler for broadcast messages (instant cross-client)
      const handleBroadcast = (payload: any) => {
        if (cancelled || activeConversationRef.current !== thisConversationId) return;
        const msg = payload.payload as Message & { client_id?: string };
        
        console.log('[realtime] Broadcast received:', msg.client_id);

        setMessagesRef.current(prev => {
          // Check if already exists
          if (prev.some(m => m.client_id === msg.client_id || m.id === msg.id)) {
            return prev;
          }
          
          const ephemeral: Message = {
            ...msg,
            id: `temp-${msg.client_id}`,
          };
          
          const next = [...prev, ephemeral];
          next.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          return next;
        });

        // Fetch from DB to reconcile with real IDs after a short delay
        setTimeout(() => {
          if (!cancelled && activeConversationRef.current === thisConversationId) {
            fetchLatestMessages();
          }
        }, 500);
      };

      // Create channel for both directions of the conversation
      // Channel names need to be consistent for both parties
      const channelKey1 = `messages:${currentUserId}:${conversationUserId}`;
      const channelKey2 = `messages:${conversationUserId}:${currentUserId}`;
      
      const channel = supabase
        .channel(`chat:${thisConversationId}:${currentUserId}`, {
          config: { broadcast: { ack: false } }
        })
        // Listen on both possible channel directions
        .on('broadcast', { event: 'pending_message' }, handleBroadcast)
        .on('broadcast', { event: 'new_message' }, () => {
          console.log('[realtime] new_message broadcast received');
          if (!cancelled && activeConversationRef.current === thisConversationId) {
            fetchLatestMessages();
          }
        })
        .subscribe((status, err) => {
          console.log('[realtime] Channel status:', status, err || '');
        });

      channelRef.current = channel;

      // Also subscribe to the reverse channel to catch messages from the other user
      const reverseChannel = supabase
        .channel(channelKey2, { config: { broadcast: { ack: false } } })
        .on('broadcast', { event: 'pending_message' }, handleBroadcast)
        .subscribe();

      // Store for cleanup
      const cleanup = channelRef.current;
      channelRef.current = channel;
      
      // Return cleanup for reverse channel
      return () => {
        supabase.removeChannel(reverseChannel);
      };
    }

    let reverseCleanup: (() => void) | undefined;
    setupChannel().then(cleanup => {
      reverseCleanup = cleanup;
    });

    // Poll for new messages periodically as fallback (every 3 seconds)
    const pollInterval = setInterval(() => {
      if (!cancelled && activeConversationRef.current === thisConversationId) {
        fetchLatestMessages();
      }
    }, 3000);

    // Safety net: refetch on focus/online
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !cancelled) {
        fetchLatestMessages();
      }
    };
    
    const handleOnline = () => {
      if (!cancelled) fetchLatestMessages();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', fetchLatestMessages);
    window.addEventListener('online', handleOnline);

    return () => {
      cancelled = true;
      clearInterval(pollInterval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', fetchLatestMessages);
      window.removeEventListener('online', handleOnline);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      reverseCleanup?.();
    };
  }, [conversationUserId, currentUserId, fetchLatestMessages]);
}
