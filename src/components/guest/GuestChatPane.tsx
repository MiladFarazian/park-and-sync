import React, { useState, useEffect, useRef } from 'react';
import { Send, Loader2, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface GuestMessage {
  id: string;
  booking_id: string;
  sender_type: 'guest' | 'host';
  message: string;
  created_at: string;
  read_at: string | null;
}

interface GuestChatPaneProps {
  bookingId: string;
  accessToken: string;
  hostName: string;
}

import { logger } from '@/lib/logger';

const GuestChatPane = ({ bookingId, accessToken, hostName }: GuestChatPaneProps) => {
  const [messages, setMessages] = useState<GuestMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<any>(null);
  const pendingMessageRef = useRef<string | null>(null);

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  };

  const fetchMessages = async () => {
    try {
      const { data, error: fetchError } = await supabase.functions.invoke('get-guest-messages', {
        body: { booking_id: bookingId, access_token: accessToken },
      });

      if (fetchError) throw fetchError;
      if (data?.error) throw new Error(data.error);

      setMessages(data.messages || []);
      setError(null);
    } catch (err: any) {
      logger.error('Failed to fetch messages:', err);
      // Don't show error for rate limiting - just skip this poll
      if (!err.message?.includes('Too many requests')) {
        setError('Failed to load messages');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();

    // Subscribe to real-time updates
    const channel = supabase.channel(`guest-messages:${bookingId}`)
      .on('broadcast', { event: 'new_message' }, (payload) => {
        const newMsg = payload.payload as GuestMessage;
        
        // Skip if this is our own pending message (we'll get it from the API response)
        if (pendingMessageRef.current && newMsg.message === pendingMessageRef.current) {
          return;
        }
        
        setMessages((prev) => {
          // Avoid duplicates by checking ID and also temp IDs
          if (prev.some(m => m.id === newMsg.id || (m.id.startsWith('temp-') && m.message === newMsg.message))) {
            // Replace temp message with real one
            return prev.map(m => 
              m.id.startsWith('temp-') && m.message === newMsg.message ? newMsg : m
            );
          }
          return [...prev, newMsg];
        });
      })
      .subscribe();

    channelRef.current = channel;

    // Polling fallback every 30 seconds
    const pollInterval = setInterval(fetchMessages, 30000);

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
      clearInterval(pollInterval);
    };
  }, [bookingId, accessToken]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!newMessage.trim() || sending) return;

    setSending(true);
    const messageText = newMessage.trim();
    setNewMessage('');
    
    // Track pending message to avoid duplicate from broadcast
    pendingMessageRef.current = messageText;

    // Optimistic update
    const tempId = `temp-${Date.now()}`;
    const tempMessage: GuestMessage = {
      id: tempId,
      booking_id: bookingId,
      sender_type: 'guest',
      message: messageText,
      created_at: new Date().toISOString(),
      read_at: null,
    };
    setMessages((prev) => [...prev, tempMessage]);

    try {
      const { data, error: sendError } = await supabase.functions.invoke('send-guest-message', {
        body: { booking_id: bookingId, access_token: accessToken, message: messageText },
      });

      if (sendError) throw sendError;
      if (data?.error) throw new Error(data.error);

      // Replace temp message with real one
      setMessages((prev) => 
        prev.map(m => m.id === tempId ? data.message : m)
      );
    } catch (err: any) {
      console.error('Failed to send message:', err);
      // Remove optimistic message on failure
      setMessages((prev) => prev.filter(m => m.id !== tempId));
      setNewMessage(messageText); // Restore the message
      setError('Failed to send message. Please try again.');
    } finally {
      setSending(false);
      pendingMessageRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <MessageCircle className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Message {hostName}</h3>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Messages Container */}
          <div ref={messagesContainerRef} className="max-h-64 overflow-y-auto space-y-3 mb-4 p-2 bg-muted/30 rounded-lg">
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No messages yet. Send a message to your host!
              </p>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender_type === 'guest' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 ${
                      msg.sender_type === 'guest'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background border'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>
                    <p className={`text-xs mt-1 ${
                      msg.sender_type === 'guest' ? 'text-primary-foreground/70' : 'text-muted-foreground'
                    }`}>
                      {format(new Date(msg.created_at), 'h:mm a')}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          {error && (
            <p className="text-sm text-destructive mb-2">{error}</p>
          )}

          {/* Input */}
          <div className="flex gap-2">
            <Textarea
              placeholder="Type a message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              className="min-h-[44px] max-h-24 resize-none"
              rows={1}
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!newMessage.trim() || sending}
              className="shrink-0"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
};

export default GuestChatPane;
