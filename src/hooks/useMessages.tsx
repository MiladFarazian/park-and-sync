import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Conversation {
  id: string;
  user_id: string;
  name: string;
  avatar_url?: string;
  last_message: string;
  last_message_at: string;
  unread_count: number;
}

export interface Message {
  id: string;
  sender_id: string;
  recipient_id: string;
  message: string;
  created_at: string;
  read_at: string | null;
  delivered_at: string | null;
  media_url: string | null;
  media_type: string | null;
  client_id?: string | null;
}

// Helper to format message preview
const getMessagePreview = (msg: Message, currentUserId: string, senderName?: string): string => {
  const isMe = msg.sender_id === currentUserId;
  
  if (msg.media_url && msg.media_type) {
    if (msg.media_type.startsWith('image/')) {
      return isMe ? 'You sent a photo' : `${senderName || 'They'} sent a photo`;
    } else if (msg.media_type.startsWith('video/')) {
      return isMe ? 'You sent a video' : `${senderName || 'They'} sent a video`;
    }
  }
  
  return msg.message || '';
};

export const useMessages = () => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  const profileCacheRef = useRef<Map<string, { name: string; avatar_url?: string }>>(new Map());
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);


  // Load conversations
  const loadConversations = async () => {
    if (!user) return;

    try {
      setLoading(true);
      
      const { data: allMessages, error } = await supabase
        .from('messages')
        .select('*')
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!mountedRef.current) return;

      console.log('[useMessages] Processing', allMessages?.length || 0, 'messages');
      
      const conversationMap = new Map<string, any>();
      
      for (const msg of allMessages || []) {
        const partnerId = msg.sender_id === user.id ? msg.recipient_id : msg.sender_id;
        
        if (!conversationMap.has(partnerId)) {
          conversationMap.set(partnerId, {
            user_id: partnerId,
            last_message: getMessagePreview(msg, user.id),
            last_message_at: msg.created_at,
            unread_count: 0,
            messages: []
          });
        } else {
          // Update last_message if this message is newer
          const conv = conversationMap.get(partnerId);
          const existingTime = new Date(conv.last_message_at).getTime();
          const msgTime = new Date(msg.created_at).getTime();
          if (msgTime > existingTime) {
            conv.last_message = getMessagePreview(msg, user.id);
            conv.last_message_at = msg.created_at;
          }
        }
        
        const conv = conversationMap.get(partnerId);
        conv.messages.push(msg);
        
        if (msg.recipient_id === user.id && !msg.read_at) {
          conv.unread_count++;
        }
      }

      const partnerIds = Array.from(conversationMap.keys());
      if (partnerIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, first_name, last_name, avatar_url')
          .in('user_id', partnerIds);

        const convs: Conversation[] = [];
        for (const [partnerId, conv] of conversationMap) {
          const profile = profiles?.find(p => p.user_id === partnerId);
          const profileName = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unknown User' : 'Unknown User';
          
          // Find the last message for this conversation to get proper preview
          const lastMsg = conv.messages.sort((a: Message, b: Message) => 
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )[0];
          
          // Create completely new object to force React re-render
          convs.push({
            id: partnerId,
            user_id: partnerId,
            name: profileName,
            avatar_url: profile?.avatar_url,
            last_message: getMessagePreview(lastMsg, user.id, profileName),
            last_message_at: conv.last_message_at,
            unread_count: conv.unread_count
          });
        }

        convs.sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());
        console.log('[useMessages] Setting', convs.length, 'conversations, newest:', convs[0]?.last_message);
        if (mountedRef.current) {
          setConversations(convs);
        }
      } else {
        if (mountedRef.current) {
          setConversations([]);
        }
      }
    } catch (error) {
      console.error('Error loading conversations:', error);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  };

  // Helpers for realtime incremental updates
  const ensureProfileLoaded = async (partnerId: string) => {
    if (profileCacheRef.current.has(partnerId)) return;
    try {
      profileCacheRef.current.set(partnerId, { name: 'Unknown User' });
      const { data } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name, avatar_url')
        .eq('user_id', partnerId)
        .maybeSingle();
      if (data) {
        const name = `${data.first_name || ''} ${data.last_name || ''}`.trim() || 'Unknown User';
        profileCacheRef.current.set(partnerId, { name, avatar_url: data.avatar_url || undefined });
        if (mountedRef.current) {
          setConversations(prev => prev.map(c => c.user_id === partnerId ? { ...c, name, avatar_url: data.avatar_url || undefined } : c));
        }
      }
    } catch (e) {
      console.error('[useMessages] ensureProfileLoaded error:', e);
    }
  };

  const scheduleSoftReload = () => {
    try {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        if (mountedRef.current) {
          loadConversations();
        }
      }, 3000);
    } catch (e) {
      console.error('[useMessages] scheduleSoftReload error:', e);
    }
  };

  const upsertConversationFromMessage = (msg: Message) => {
    if (!user) return;
    const partnerId = msg.sender_id === user.id ? msg.recipient_id : msg.sender_id;

    setConversations(prev => {
      const existing = prev.find(c => c.user_id === partnerId);
      const isNewer = !existing || new Date(msg.created_at).getTime() >= new Date(existing.last_message_at).getTime();

      let unread = existing?.unread_count || 0;
      if (msg.recipient_id === user.id && !msg.read_at) {
        unread = (existing ? existing.unread_count : 0) + 1;
      }

      const updated: Conversation = {
        id: partnerId,
        user_id: partnerId,
        name: existing?.name || 'Unknown User',
        avatar_url: existing?.avatar_url,
        last_message: isNewer ? getMessagePreview(msg, user.id, existing?.name) : (existing?.last_message || getMessagePreview(msg, user.id, existing?.name)),
        last_message_at: isNewer ? msg.created_at : (existing ? existing.last_message_at : msg.created_at),
        unread_count: unread,
      };

      const others = prev.filter(c => c.user_id !== partnerId);
      const next = [updated, ...others];
      next.sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());
      return next;
    });

    ensureProfileLoaded(partnerId);
  };

  // Mark messages as read
  const markAsRead = async (senderId: string) => {
    if (!user) return;

    try {
      await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('recipient_id', user.id)
        .eq('sender_id', senderId)
        .is('read_at', null);
      
      // Also mark any message notifications as read
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user.id)
        .eq('type', 'message')
        .eq('read', false);
      
      setConversations(prev => 
        prev.map(conv => 
          conv.user_id === senderId 
            ? { ...conv, unread_count: 0 }
            : conv
        )
      );
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  };

  // Set up real-time subscription for conversations list
  useEffect(() => {
    if (!user) return;
    mountedRef.current = true;

    loadConversations();

    // Ensure Realtime has the latest auth token
    supabase.auth.getSession().then(({ data }) => {
      const access = data.session?.access_token;
      try {
        (supabase as any).realtime?.setAuth?.(access);
      } catch (e) {
        // no-op if setAuth not available
      }
    });

    const channel = supabase.channel('conversations-updates');

    channel
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient_id=eq.${user.id}` },
        (payload) => {
          const msg = payload.new as Message;
          console.log('[useMessages] INSERT incoming', msg);
          upsertConversationFromMessage(msg);
          scheduleSoftReload();
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `sender_id=eq.${user.id}` },
        (payload) => {
          const msg = payload.new as Message;
          console.log('[useMessages] INSERT outgoing', msg);
          upsertConversationFromMessage(msg);
          scheduleSoftReload();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `recipient_id=eq.${user.id}` },
        () => {
          // Soft reconcile in case of missed events (e.g., read receipts)
          scheduleSoftReload();
        }
      )
      .subscribe();

    return () => {
      mountedRef.current = false;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Calculate total unread count
  const totalUnreadCount = conversations.reduce((sum, conv) => sum + conv.unread_count, 0);

  return {
    conversations,
    loading,
    markAsRead,
    loadConversations,
    totalUnreadCount
  };
};
