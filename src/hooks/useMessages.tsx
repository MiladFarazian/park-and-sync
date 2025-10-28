import { useState, useEffect } from 'react';
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
}

export const useMessages = () => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingMessage, setSendingMessage] = useState(false);

  // Load conversations
  const loadConversations = async () => {
    if (!user) return;

    try {
      setLoading(true);
      
      // Get all messages where user is sender or recipient
      const { data: allMessages, error } = await supabase
        .from('messages')
        .select('*')
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Group by conversation partner
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
        }
        
        const conv = conversationMap.get(partnerId);
        conv.messages.push(msg);
        
        // Count unread messages (messages sent to current user that are unread)
        if (msg.recipient_id === user.id && !msg.read_at) {
          conv.unread_count++;
        }
      }

      // Get profiles for all conversation partners
      const partnerIds = Array.from(conversationMap.keys());
      if (partnerIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, first_name, last_name, avatar_url')
          .in('user_id', partnerIds);

        // Merge profile data
        const convs: Conversation[] = [];
        for (const [partnerId, conv] of conversationMap) {
          const profile = profiles?.find(p => p.user_id === partnerId);
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

        // Sort by most recent message
        convs.sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());
        setConversations(convs);
      }
    } catch (error) {
      console.error('Error loading conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load messages for a specific conversation
  const loadMessages = async (userId: string) => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${user.id},recipient_id.eq.${userId}),and(sender_id.eq.${userId},recipient_id.eq.${user.id})`)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);

      // Mark messages as read
      await markAsRead(userId);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  // Set up real-time subscription for active conversation
  const subscribeToConversation = (otherUserId: string) => {
    if (!user) return null;

    const channel = supabase
      .channel(`conversation-${user.id}-${otherUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `sender_id=eq.${otherUserId}`
        },
        (payload) => {
          console.log('New message received:', payload);
          if (payload.new.recipient_id === user.id) {
            setMessages(prev => [...prev, payload.new as Message]);
            markAsRead(otherUserId);
            loadConversations();
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `sender_id=eq.${user.id}`
        },
        (payload) => {
          console.log('Message sent confirmed:', payload);
          if (payload.new.recipient_id === otherUserId) {
            // Message already added optimistically, just update conversations
            loadConversations();
          }
        }
      )
      .subscribe();

    return channel;
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
      
      // Update conversation unread count
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

  // Send a message
  const sendMessage = async (recipientId: string, message: string) => {
    if (!user || !message.trim()) return;

    try {
      setSendingMessage(true);
      const { data, error } = await supabase
        .from('messages')
        .insert({
          sender_id: user.id,
          recipient_id: recipientId,
          message: message.trim()
        })
        .select()
        .single();

      if (error) throw error;

      // Add to messages list
      setMessages(prev => [...prev, data]);
      
      // Update conversations
      await loadConversations();
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    } finally {
      setSendingMessage(false);
    }
  };

  // Set up real-time subscription for conversations list
  useEffect(() => {
    if (!user) return;

    loadConversations();

    const channel = supabase
      .channel('messages-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `recipient_id=eq.${user.id}`
        },
        () => {
          loadConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return {
    conversations,
    messages,
    loading,
    sendingMessage,
    loadMessages,
    sendMessage,
    markAsRead,
    subscribeToConversation
  };
};
