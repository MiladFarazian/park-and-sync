import { useEffect, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Message } from './useMessages';

export function useRealtimeMessages(
  conversationUserId: string | null,
  currentUserId: string | undefined,
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const pendingUpdatesRef = useRef<Array<() => void>>([]);
  const batchTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!conversationUserId || !currentUserId) return;
    
    let cancelled = false;

    // Batch multiple Realtime events into single state update (60fps = ~16ms batching)
    const batchUpdate = (updateFn: () => void) => {
      pendingUpdatesRef.current.push(updateFn);
      
      if (!batchTimeoutRef.current) {
        batchTimeoutRef.current = window.requestAnimationFrame(() => {
          if (cancelled) return;
          
          const updates = pendingUpdatesRef.current;
          pendingUpdatesRef.current = [];
          batchTimeoutRef.current = null;
          
          // Apply all pending updates in one batch
          updates.forEach(fn => fn());
        });
      }
    };

    async function setupChannel() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || cancelled) return;

      // Ensure socket has valid auth token
      supabase.realtime.setAuth(session.access_token);
      console.log('[realtime] Setting up channel for:', conversationUserId);

      // Remove old channel
      if (channelRef.current) {
        await supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      // Handler for broadcast (instant echo for cross-client)
      const handleBroadcast = (payload: any) => {
        if (cancelled) return;
        const msg = payload.payload as Message & { client_id?: string };

        batchUpdate(() => {
          setMessages(prev => {
            // Dedupe by client_id
            if (prev.some(m => m.client_id === msg.client_id || m.id === msg.id)) return prev;
            
            const ephemeral = {
              ...msg,
              id: `temp-${msg.client_id}`,
              status: 'sending' as const,
            };
            
            const next = [...prev, ephemeral];
            next.sort((a, b) => {
              const ta = new Date(a.created_at).getTime();
              const tb = new Date(b.created_at).getTime();
              return ta === tb ? String(a.id).localeCompare(String(b.id)) : ta - tb;
            });
            return next;
          });
        });
      };

      // Handler for postgres_changes (reconcile with canonical row)
      const handleNewMessage = (payload: any) => {
        if (cancelled) return;
        const realtimeLatency = performance.now();
        const msg = payload.new as Message & { client_id?: string };
        console.log('[PERF] realtime:postgres-insert-latency-ms', realtimeLatency - new Date(msg.created_at).getTime());

        batchUpdate(() => {
          setMessages(prev => {
            // Dedupe by id OR client_id (handles optimistic reconciliation)
            const existingIndex = prev.findIndex(m => 
              m.id === msg.id || 
              (msg.client_id && m.id === `temp-${msg.client_id}`) ||
              (msg.client_id && m.id === `error-${msg.client_id}`)
            );

            if (existingIndex !== -1) {
              // Replace optimistic message with real one
              const next = [...prev];
              next[existingIndex] = msg;
              return next;
            }

            // New message - add and sort
            const next = [...prev, msg];
            
            // Sort by created_at, then by id for timestamp collisions
            next.sort((a, b) => {
              const ta = new Date(a.created_at).getTime();
              const tb = new Date(b.created_at).getTime();
              return ta === tb ? String(a.id).localeCompare(String(b.id)) : ta - tb;
            });

            return next;
          });
        });
      };

      // Subscribe to messages in this conversation (both directions)
      const channel = supabase
        .channel(`messages:${currentUserId}:${conversationUserId}`, {
          config: { broadcast: { ack: false } }
        })
        // Listen for instant broadcast (cross-client echo)
        .on('broadcast', { event: 'pending_message' }, handleBroadcast)
        // Listen for postgres inserts (reconcile)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `sender_id=eq.${currentUserId},recipient_id=eq.${conversationUserId}`
        }, handleNewMessage)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `sender_id=eq.${conversationUserId},recipient_id=eq.${currentUserId}`
        }, handleNewMessage)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `sender_id=eq.${currentUserId},recipient_id=eq.${conversationUserId}`
        }, (payload) => {
          if (cancelled) return;
          const updatedMsg = payload.new as Message;
          batchUpdate(() => {
            setMessages(prev => prev.map(m => m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m));
          });
        })
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `sender_id=eq.${conversationUserId},recipient_id=eq.${currentUserId}`
        }, (payload) => {
          if (cancelled) return;
          const updatedMsg = payload.new as Message;
          batchUpdate(() => {
            setMessages(prev => prev.map(m => m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m));
          });
        })
        .subscribe((status) => {
          console.log('[realtime] Subscription status:', status, `${currentUserId}:${conversationUserId}`);
        });

      channelRef.current = channel;
    }

    setupChannel();

    // Safety net: refetch on focus/online (handles network drops/tab sleep)
    const refetchMessages = async () => {
      if (cancelled) return;
      
      console.log('[realtime] Refetching messages (focus/online event)');
      
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${currentUserId},recipient_id.eq.${conversationUserId}),and(sender_id.eq.${conversationUserId},recipient_id.eq.${currentUserId})`)
        .order('created_at', { ascending: true });

      if (!error && data) {
        setMessages(prev => {
          const seen = new Set(prev.map(m => m.id));
          const merged = [...prev];
          
          for (const m of data) {
            if (!seen.has(m.id)) {
              merged.push(m as Message);
            }
          }
          
          merged.sort((a, b) => {
            const ta = new Date(a.created_at).getTime();
            const tb = new Date(b.created_at).getTime();
            return ta === tb ? String(a.id).localeCompare(String(b.id)) : ta - tb;
          });
          
          return merged;
        });
      }
    };

    window.addEventListener('focus', refetchMessages);
    window.addEventListener('online', refetchMessages);

    return () => {
      cancelled = true;
      if (batchTimeoutRef.current) {
        cancelAnimationFrame(batchTimeoutRef.current);
        batchTimeoutRef.current = null;
      }
      pendingUpdatesRef.current = [];
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      window.removeEventListener('focus', refetchMessages);
      window.removeEventListener('online', refetchMessages);
    };
  }, [conversationUserId, currentUserId, setMessages]);
}
