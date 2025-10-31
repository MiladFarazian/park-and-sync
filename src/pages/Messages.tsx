import { useState, useEffect, useRef, memo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Search, Send, Loader2, ArrowLeft, Paperclip, X, Check, CheckCheck } from 'lucide-react';
import { useMessages, Message } from '@/hooks/useMessages';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import { useRealtimeMessages } from '@/hooks/useRealtimeMessages';
import { sendMessage as sendMessageLib } from '@/lib/sendMessage';
import { compressImage } from '@/lib/compressImage';
import { Virtuoso } from 'react-virtuoso';

// Memoized message item component for performance
const MessageItem = memo(({ message, isMe }: { message: Message; isMe: boolean }) => {
  const isVideo = message.media_type?.startsWith('video/');
  const isImage = message.media_type?.startsWith('image/');
  
  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[70%] rounded-lg p-3 ${
          isMe
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted'
        }`}
      >
        {message.media_url && (
          <div className="mb-2">
            {isImage && (
              <img 
                src={message.media_url} 
                alt="Shared media"
                className="rounded-md max-w-full h-auto max-h-64 object-cover"
                onError={(e) => {
                  console.error('Failed to load image:', message.media_url);
                  e.currentTarget.style.display = 'none';
                }}
              />
            )}
            {isVideo && (
              <video 
                src={message.media_url} 
                controls
                className="rounded-md max-w-full h-auto max-h-64"
                onError={(e) => {
                  console.error('Failed to load video:', message.media_url);
                }}
              />
            )}
          </div>
        )}
        
        {message.message && (
          <p className="text-sm">{message.message}</p>
        )}
        
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
            <>
              {message.read_at ? (
                <CheckCheck className="h-3 w-3" />
              ) : message.delivered_at ? (
                <CheckCheck className="h-3 w-3 opacity-50" />
              ) : (
                <Check className="h-3 w-3 opacity-50" />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
});

MessageItem.displayName = 'MessageItem';

// Chat pane remounts per conversation to isolate effects and prevent leaks
function ChatPane({
  conversationId,
  userId,
  onBack,
  displayName,
  displayAvatar,
  messagesCacheRef,
  markAsRead,
}: {
  conversationId: string;
  userId: string;
  onBack: () => void;
  displayName: string;
  displayAvatar?: string;
  messagesCacheRef: React.MutableRefObject<Map<string, Message[]>>;
  markAsRead: (otherUserId: string) => Promise<void> | void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [showNewMessageButton, setShowNewMessageButton] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const virtuosoRef = useRef<any>(null);
  const atBottomRef = useRef(true);
  const initialLoadRef = useRef(true);
  const loadingOlderRef = useRef(false);

  // Sorted view (stable)
  const sortedMessages = [...messages].sort((a, b) => {
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    return ta === tb ? String(a.id).localeCompare(String(b.id)) : ta - tb;
  });

  // Initial load with cancellation & guard
  useEffect(() => {
    const convId = conversationId;
    let alive = true;

    // Reset state flags but keep cache if present
    setShowNewMessageButton(false);
    initialLoadRef.current = true;
    loadingOlderRef.current = false;
    atBottomRef.current = true;

    const cached = messagesCacheRef.current.get(convId);
    if (cached && cached.length > 0) {
      setMessages(cached);
      setLoadingMessages(false);
    } else {
      setLoadingMessages(true);
    }

    (async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${userId},recipient_id.eq.${convId}),and(sender_id.eq.${convId},recipient_id.eq.${userId})`)
        .order('created_at', { ascending: true });

      if (!alive) return;
      if (error) {
        setLoadingMessages(false);
        return;
      }
      // Drop late results
      if (convId !== conversationId) return;

      setMessages((data || []) as Message[]);
      messagesCacheRef.current.set(convId, (data || []) as Message[]);
      await markAsRead(convId);
      setLoadingMessages(false);

      // Scroll to bottom on initial load only
      setTimeout(() => {
        if (!alive) return;
        if (virtuosoRef.current && (data?.length || 0) > 0) {
          virtuosoRef.current.scrollToIndex({
            index: 'LAST',
            align: 'end',
            behavior: 'auto',
          });
        }
        initialLoadRef.current = false;
      }, 50);
    })();

    return () => {
      alive = false;
    };
  }, [conversationId, userId, messagesCacheRef, markAsRead]);

  // Realtime for this chat only
  useRealtimeMessages(conversationId, userId, setMessages);

  // Keep cache in sync
  useEffect(() => {
    if (!conversationId) return;
    messagesCacheRef.current.set(conversationId, messages);
  }, [messages, conversationId, messagesCacheRef]);

  // Pagination: load older
  const loadOlderMessages = async () => {
    if (!conversationId || loadingOlderRef.current || sortedMessages.length === 0) return;
    loadingOlderRef.current = true;
    const oldest = sortedMessages[0];
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${userId},recipient_id.eq.${conversationId}),and(sender_id.eq.${conversationId},recipient_id.eq.${userId})`)
        .lt('created_at', oldest.created_at)
        .order('created_at', { ascending: false })
        .limit(20);
      if (!error && data && data.length > 0) {
        setMessages(prev => [...data.reverse(), ...prev]);
      }
    } finally {
      loadingOlderRef.current = false;
    }
  };

  const scrollToBottom = () => {
    if (virtuosoRef.current) {
      virtuosoRef.current.scrollToIndex({ index: 'LAST', align: 'end', behavior: 'smooth' });
    }
    setShowNewMessageButton(false);
  };

  const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validTypes = ['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/quicktime','video/webm'];
    if (!validTypes.includes(file.type)) {
      toast.error('Invalid file type. Please select an image or video.');
      return;
    }
    if (file.size > 52428800) {
      toast.error('File size too large. Maximum size is 50MB.');
      return;
    }
    setSelectedMedia(file);
    setMediaPreview(URL.createObjectURL(file));
  };

  const handleRemoveMedia = () => {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setSelectedMedia(null);
    setMediaPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSendMessage = () => {
    if ((!messageInput.trim() && !selectedMedia) || !conversationId || !userId) return;
    const messageText = messageInput.trim();
    const mediaToUpload = selectedMedia;

    setMessageInput('');
    handleRemoveMedia();

    const clientId = sendMessageLib({
      recipientId: conversationId,
      senderId: userId,
      messageText: messageText || '',
      setMessages,
      onError: (error) => {
        toast.error('Failed to send message');
        console.error('Error sending message:', error);
      },
    });

    if (mediaToUpload) {
      setUploadingMedia(true);
      (async () => {
        try {
          const compressedFile = await compressImage(mediaToUpload);
          const fileExt = compressedFile.name.split('.').pop();
          const fileName = `${userId}/${crypto.randomUUID()}.${fileExt}`;
          const { error: uploadError } = await supabase.storage
            .from('message-media')
            .upload(fileName, compressedFile, { cacheControl: '3600', upsert: false, contentType: compressedFile.type });
          if (uploadError) throw uploadError;
          const { data: { publicUrl } } = supabase.storage.from('message-media').getPublicUrl(fileName);
          // resolve DB row by client_id and update media
          let row: { id: string } | null = null;
          for (let i = 0; i < 3; i++) {
            const { data } = await supabase.from('messages').select('id').eq('client_id', clientId).maybeSingle();
            if (data) { row = data; break; }
            await new Promise(r => setTimeout(r, 100 * Math.pow(2, i)));
          }
          if (row?.id) {
            await supabase.from('messages').update({ media_url: publicUrl, media_type: compressedFile.type }).eq('id', row.id);
          } else {
            throw new Error('Message not found after upload');
          }
        } catch (error) {
          toast.error('Failed to upload media');
          setMessages(prev => prev.map(m => m.client_id === clientId ? { ...m, id: `error-${clientId}` } : m));
        } finally {
          setUploadingMedia(false);
        }
      })();
    }
  };

  return (
    <>
      <div className="p-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Avatar>
            <AvatarImage src={displayAvatar} />
            <AvatarFallback>{displayName.split(' ').map(n => n[0]).join('')}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold">{displayName}</p>
            <p className="text-sm text-muted-foreground">Active</p>
          </div>
        </div>
      </div>
      <div className="flex-1 relative">
        {(loadingMessages && !(messagesCacheRef.current.get(conversationId)?.length)) ? (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          sortedMessages.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-center text-muted-foreground">
              <p className="text-sm">No messages yet. Start the conversation!</p>
            </div>
          ) : (
            <>
              <Virtuoso
                key={conversationId}
                ref={virtuosoRef}
                data={sortedMessages}
                computeItemKey={(index, item) => item.id}
                increaseViewportBy={{ top: 400, bottom: 600 }}
                followOutput={() => atBottomRef.current ? 'auto' : false}
                atBottomStateChange={(isAtBottom) => {
                  atBottomRef.current = isAtBottom;
                  if (isAtBottom) {
                    setShowNewMessageButton(false);
                    if (sortedMessages.length > 0) {
                      const latestMsg = sortedMessages[sortedMessages.length - 1];
                      if (latestMsg.sender_id === conversationId && !latestMsg.read_at) {
                        markAsRead(conversationId);
                      }
                    }
                  } else {
                    if (!initialLoadRef.current && sortedMessages.length > 0) {
                      const latestMsg = sortedMessages[sortedMessages.length - 1];
                      if (latestMsg.sender_id === conversationId) {
                        setShowNewMessageButton(true);
                      }
                    }
                  }
                }}
                atBottomThreshold={100}
                startReached={loadOlderMessages}
                itemContent={(index, message) => (
                  <div className="px-4 py-2">
                    <MessageItem key={message.id} message={message} isMe={message.sender_id === userId} />
                  </div>
                )}
              />
              {showNewMessageButton && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
                  <Button size="sm" onClick={scrollToBottom} className="shadow-lg">
                    New messages ↓
                  </Button>
                </div>
              )}
            </>
          )
        )}
      </div>
      <div className="p-4 border-t">
        {mediaPreview && (
          <div className="mb-2 relative inline-block">
            <div className="relative">
              {selectedMedia?.type.startsWith('image/') ? (
                <img src={mediaPreview} alt="Preview" className="h-20 w-20 object-cover rounded-md" />
              ) : (
                <video src={mediaPreview} className="h-20 w-20 object-cover rounded-md" />
              )}
              <Button variant="destructive" size="icon" className="absolute -top-2 -right-2 h-6 w-6" onClick={handleRemoveMedia}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm"
            onChange={handleMediaSelect}
            className="hidden"
          />
          <Button variant="outline" size="icon" onClick={() => fileInputRef.current?.click()} disabled={uploadingMedia}>
            <Paperclip className="h-4 w-4" />
          </Button>
          <Input
            placeholder="Type a message..."
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
          />
          <Button onClick={handleSendMessage} size="icon" disabled={uploadingMedia || (!messageInput.trim() && !selectedMedia)}>
            {uploadingMedia ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </>
  );
}

const Messages = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { conversations, loading, markAsRead } = useMessages();
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [newUserProfile, setNewUserProfile] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const isMobile = useIsMobile();
  const messagesCacheRef = useRef<Map<string, Message[]>>(new Map());

  // Parent holds no message state; chat-specific logic lives in ChatPane
  useEffect(() => {
    const userIdFromUrl = searchParams.get('userId');
    
    // If no userId in URL, clear selection
    if (!userIdFromUrl) {
      if (selectedConversation !== null) {
        setSelectedConversation(null);
        setNewUserProfile(null);
      }
      return;
    }

    // URL is the single source of truth for selection
    if (selectedConversation !== userIdFromUrl) {
      setSelectedConversation(userIdFromUrl);
    }
  }, [searchParams, selectedConversation]);

  // Fetch profile only when selected user isn't in conversations (new chat)
  useEffect(() => {
    if (!selectedConversation) return;
    const exists = conversations.some(c => c.user_id === selectedConversation);
    if (!exists) {
      fetchNewUserProfile(selectedConversation);
    } else if (newUserProfile) {
      setNewUserProfile(null);
    }
  }, [selectedConversation, conversations]);

  const fetchNewUserProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name, avatar_url')
        .eq('user_id', userId)
        .single();

      if (error) throw error;
      setNewUserProfile(data);
    } catch (error) {
      console.error('Error fetching user profile:', error);
      toast.error('Failed to load user profile');
    }
  };

  // Moved chat data loading into ChatPane for clean remount per conversation

  // Realtime subscription handled inside ChatPane

  // Cache synchronization handled inside ChatPane
  
  // Pagination handled inside ChatPane
  
  // Scroll handling moved to ChatPane

  // Media selection handled inside ChatPane

  // Media removal handled inside ChatPane

  // Sending handled inside ChatPane

  const filteredConversations = conversations.filter(conv =>
    conv.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedConvData = conversations.find(c => c.user_id === selectedConversation);
  
  // Use new user profile if starting a new conversation
  const displayName = selectedConvData?.name || 
    (newUserProfile ? `${newUserProfile.first_name || ''} ${newUserProfile.last_name || ''}`.trim() || 'User' : 'User');
  const displayAvatar = selectedConvData?.avatar_url || newUserProfile?.avatar_url;
  const hasCache = selectedConversation ? messagesCacheRef.current.has(selectedConversation) : false;

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Conversations List */}
      <Card className={`${selectedConversation && isMobile ? 'hidden' : 'flex'} w-full md:w-80 flex-col`}>
        <div className="p-4 border-b">
          <h1 className="text-2xl font-bold mb-4">Messages</h1>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">No conversations yet</p>
              </div>
            ) : (
              filteredConversations.map((conversation) => (
                <button
                  key={conversation.user_id}
                  onClick={() => {
                    setSearchParams({ userId: conversation.user_id }, { replace: true });
                  }}
                  className={`w-full p-3 rounded-lg text-left transition-colors hover:bg-accent ${
                    selectedConversation === conversation.user_id ? 'bg-accent' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Avatar>
                      <AvatarImage src={conversation.avatar_url} />
                      <AvatarFallback>{conversation.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-semibold text-sm truncate">{conversation.name}</p>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: true })}
                        </span>
                      </div>
                      <p className={`text-sm truncate ${conversation.unread_count > 0 ? 'font-medium' : 'text-muted-foreground'}`}>
                        {conversation.last_message}
                      </p>
                    </div>
                    {conversation.unread_count > 0 && (
                      <div className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-medium">
                        {conversation.unread_count}
                      </div>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </Card>

      {/* Messages Area */}
      <Card className={`${selectedConversation && isMobile ? 'flex' : 'hidden'} md:flex flex-1 flex-col`}>
        {selectedConversation ? (
          <ChatPane
            key={selectedConversation}
            conversationId={selectedConversation}
            userId={(user?.id as string) ?? ''}
            onBack={() => setSearchParams({}, { replace: true })}
            displayName={displayName}
            displayAvatar={displayAvatar}
            messagesCacheRef={messagesCacheRef}
            markAsRead={markAsRead}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <p className="text-lg font-medium">Select a conversation</p>
              <p className="text-sm">Choose a conversation from the list to start messaging</p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default Messages;
