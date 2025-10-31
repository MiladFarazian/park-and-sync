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

export const useMessages = () => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

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
            last_message: msg.message,
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
            conv.last_message = msg.message;
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
          // Create completely new object to force React re-render
          convs.push({
            id: partnerId,
            user_id: partnerId,
            name: profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unknown User' : 'Unknown User',
            avatar_url: profile?.avatar_url,
            last_message: conv.last_message,
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

    const channel = supabase
      .channel('conversations-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages'
        },
        (payload) => {
          const msg = payload.new as Message;
          const oldMsg = payload.old as any;
          
          console.log('[useMessages] Realtime event:', payload.eventType, msg);
          
          // Only reload if this message involves the current user
          if (payload.eventType === 'INSERT' && (msg.sender_id === user.id || msg.recipient_id === user.id)) {
            console.log('[useMessages] Reloading conversations after INSERT');
            loadConversations();
          } else if (payload.eventType === 'UPDATE' && oldMsg && 
                     (oldMsg.sender_id === user.id || oldMsg.recipient_id === user.id)) {
            console.log('[useMessages] Reloading conversations after UPDATE');
            loadConversations();
          }
        }
      )
      .subscribe();

    return () => {
      mountedRef.current = false;
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
