import React, { useState, useEffect, useRef, memo } from 'react';
import { Send, Loader2, ArrowLeft, Check, CheckCheck, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Virtuoso } from 'react-virtuoso';

interface GuestMessage {
  id: string;
  booking_id: string;
  sender_type: 'guest' | 'host';
  message: string;
  created_at: string;
  read_at: string | null;
}

interface GuestChatPaneHostProps {
  bookingId: string;
  guestName: string;
  onBack: () => void;
  markAsRead: (conversationId: string) => Promise<void> | void;
}

const MessageItem = memo(({ message, isMe }: { message: GuestMessage; isMe: boolean }) => (
  <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
    <div
      className={`max-w-[70%] rounded-lg p-3 ${
        isMe ? 'bg-primary text-primary-foreground' : 'bg-muted'
      }`}
    >
      <p className="text-sm whitespace-pre-wrap break-words">{message.message}</p>
      <div className={`flex items-center gap-1 mt-1 ${
        isMe ? 'text-primary-foreground/70' : 'text-muted-foreground'
      }`}>
        <span className="text-xs">
          {new Date(message.created_at).toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit' 
          })}
        </span>
        {isMe && (
          message.read_at ? (
            <CheckCheck className="h-3 w-3 text-green-500" />
          ) : (
            <Check className="h-3 w-3 text-white/60" />
          )
        )}
      </div>
    </div>
  </div>
));

MessageItem.displayName = 'MessageItem';

const GuestChatPaneHost = ({ bookingId, guestName, onBack, markAsRead }: GuestChatPaneHostProps) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<GuestMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);
  const virtuosoRef = useRef<any>(null);
  const channelRef = useRef<any>(null);
  const pendingMessageRef = useRef<string | null>(null);

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('guest_messages')
        .select('*')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages((data || []) as GuestMessage[]);
      
      // Mark as read after a short delay
      setTimeout(() => {
        markAsRead(`guest:${bookingId}`);
      }, 1000);
    } catch (err) {
      console.error('Failed to fetch guest messages:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();

    // Subscribe to DB inserts for instant guest->host delivery
    const channel = supabase
      .channel(`guest-messages-db:${bookingId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'guest_messages',
          filter: `booking_id=eq.${bookingId}`,
        },
        (payload) => {
          const newMsg = payload.new as GuestMessage;

          setMessages((prev) => {
            // If this is our own message, replace the optimistic temp message
            const tempIndex = prev.findIndex(
              (m) =>
                m.id.startsWith('temp-') &&
                m.sender_type === 'host' &&
                m.message === newMsg.message
            );
            if (tempIndex !== -1) {
              const next = [...prev];
              next[tempIndex] = newMsg;
              return next;
            }

            // Avoid duplicates
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });

          // Mark as read
          setTimeout(() => markAsRead(`guest:${bookingId}`), 500);
        }
      )
      .subscribe((status) => {
        // When subscription is ready, refetch to catch any missed messages
        if (status === 'SUBSCRIBED') {
          fetchMessages();
        }
      });

    channelRef.current = channel;

    // Refetch on window focus for reliability
    const handleFocus = () => fetchMessages();
    window.addEventListener('focus', handleFocus);

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
      window.removeEventListener('focus', handleFocus);
    };
  }, [bookingId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (virtuosoRef.current && messages.length > 0) {
      setTimeout(() => {
        virtuosoRef.current?.scrollToIndex({ index: 'LAST', align: 'end', behavior: 'smooth' });
      }, 100);
    }
  }, [messages.length]);

  const handleSend = async () => {
    if (!messageInput.trim() || sending || !user) return;

    setSending(true);
    const messageText = messageInput.trim();
    setMessageInput('');
    
    // Track pending message
    pendingMessageRef.current = messageText;

    // Optimistic update
    const tempId = `temp-${Date.now()}`;
    const tempMessage: GuestMessage = {
      id: tempId,
      booking_id: bookingId,
      sender_type: 'host',
      message: messageText,
      created_at: new Date().toISOString(),
      read_at: null,
    };
    setMessages((prev) => [...prev, tempMessage]);

    try {
      const { data, error } = await supabase
        .from('guest_messages')
        .insert({
          booking_id: bookingId,
          sender_type: 'host',
          message: messageText,
        })
        .select()
        .single();

      if (error) throw error;

      // Replace temp message with real one
      setMessages((prev) => 
        prev.map(m => m.id === tempId ? (data as GuestMessage) : m)
      );

      // Broadcast to channel
      const channel = supabase.channel(`guest-messages:${bookingId}`);
      await channel.send({
        type: 'broadcast',
        event: 'new_message',
        payload: data
      });
      await supabase.removeChannel(channel);
    } catch (err) {
      console.error('Failed to send message:', err);
      // Remove optimistic message on failure
      setMessages((prev) => prev.filter(m => m.id !== tempId));
      setMessageInput(messageText);
    } finally {
      setSending(false);
      pendingMessageRef.current = null;
    }
  };

  const sortedMessages = [...messages].sort((a, b) => 
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b flex-shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Avatar>
            <AvatarFallback>
              <User className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold flex items-center gap-2">
              {guestName}
              <Badge variant="outline" className="text-xs">Guest</Badge>
            </p>
            <p className="text-sm text-muted-foreground">Guest booking</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : sortedMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-center text-muted-foreground">
            <p className="text-sm">No messages yet. Start the conversation!</p>
          </div>
        ) : (
          <Virtuoso
            style={{ height: '100%' }}
            ref={virtuosoRef}
            data={sortedMessages}
            computeItemKey={(index, item) => item.id}
            initialTopMostItemIndex={sortedMessages.length > 0 ? sortedMessages.length - 1 : 0}
            followOutput="auto"
            itemContent={(index, message) => (
              <div className="px-4 py-2">
                <MessageItem message={message} isMe={message.sender_type === 'host'} />
              </div>
            )}
          />
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t flex-shrink-0">
        <div className="flex gap-2">
          <Input
            placeholder="Type a message..."
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSend();
            }}
          />
          <Button onClick={handleSend} size="icon" disabled={sending || !messageInput.trim()}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default GuestChatPaneHost;
