import { useState, useEffect, useRef, memo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Search, Send, Loader2, ArrowLeft, Paperclip, X, Check, CheckCheck, Shield } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import { compressImage } from '@/lib/compressImage';
import { Virtuoso } from 'react-virtuoso';
import RequireAuth from '@/components/auth/RequireAuth';
import { SUPPORT_USER_ID } from '@/hooks/useSupportRole';
import { Badge } from '@/components/ui/badge';
import { logger } from '@/lib/logger';

const log = logger.scope('SupportMessages');

interface Message {
  id: string;
  sender_id: string;
  recipient_id: string;
  message: string;
  media_url?: string | null;
  media_type?: string | null;
  created_at: string;
  read_at?: string | null;
  delivered_at?: string | null;
  client_id?: string;
}

interface ConversationUser {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  email: string | null;
  last_message: string;
  last_message_time: string;
  unread_count: number;
}

// Helper to format display name (First Name + Last Initial)
const formatDisplayName = (firstName?: string | null, lastName?: string | null): string => {
  const first = firstName?.trim() || '';
  const lastInitial = lastName?.trim()?.[0] || '';
  if (!first && !lastInitial) return 'User';
  return lastInitial ? `${first} ${lastInitial}.` : first;
};

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
                  e.currentTarget.style.display = 'none';
                }}
              />
            )}
            {isVideo && (
              <video 
                src={message.media_url} 
                controls
                className="rounded-md max-w-full h-auto max-h-64"
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
                <CheckCheck className="h-3 w-3 text-green-500" />
              ) : message.delivered_at ? (
                <CheckCheck className="h-3 w-3 text-white/60" />
              ) : (
                <Check className="h-3 w-3 text-white/60" />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
});

MessageItem.displayName = 'MessageItem';

function SupportChatPane({
  userId,
  onBack,
  userProfile,
}: {
  userId: string;
  onBack: () => void;
  userProfile: ConversationUser;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const virtuosoRef = useRef<any>(null);

  const sortedMessages = [...messages].sort((a, b) => {
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    return ta === tb ? String(a.id).localeCompare(String(b.id)) : ta - tb;
  });

  // Load messages for this user
  useEffect(() => {
    let alive = true;
    setLoadingMessages(true);

    const fetchMessages = async () => {
      // Get all messages between this user and the support user
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${userId},recipient_id.eq.${SUPPORT_USER_ID}),and(sender_id.eq.${SUPPORT_USER_ID},recipient_id.eq.${userId})`)
        .order('created_at', { ascending: true });

      if (!alive) return;
      if (error) {
        log.error('Error fetching messages:', error);
        setLoadingMessages(false);
        return;
      }

      setMessages((data || []) as Message[]);
      setLoadingMessages(false);

      // Mark messages from user as read
      await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('sender_id', userId)
        .eq('recipient_id', SUPPORT_USER_ID)
        .is('read_at', null);

      // Scroll to bottom
      setTimeout(() => {
        if (virtuosoRef.current && (data?.length || 0) > 0) {
          virtuosoRef.current.scrollToIndex({
            index: 'LAST',
            align: 'end',
            behavior: 'auto',
          });
        }
      }, 50);
    };

    fetchMessages();

    // Set up realtime subscription
    const channel = supabase
      .channel(`support-chat-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `or(and(sender_id=eq.${userId},recipient_id=eq.${SUPPORT_USER_ID}),and(sender_id=eq.${SUPPORT_USER_ID},recipient_id=eq.${userId}))`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => {
            // Avoid duplicates
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [userId]);

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

  const handleSendMessage = async () => {
    if ((!messageInput.trim() && !selectedMedia)) return;
    const messageText = messageInput.trim();
    const mediaToUpload = selectedMedia;

    setMessageInput('');
    handleRemoveMedia();

    const clientId = crypto.randomUUID();
    
    // Optimistic update
    const tempMessage: Message = {
      id: `temp-${clientId}`,
      sender_id: SUPPORT_USER_ID,
      recipient_id: userId,
      message: messageText,
      created_at: new Date().toISOString(),
      client_id: clientId,
    };
    setMessages(prev => [...prev, tempMessage]);

    try {
      let mediaUrl: string | null = null;
      let mediaType: string | null = null;

      if (mediaToUpload) {
        setUploadingMedia(true);
        const compressedFile = await compressImage(mediaToUpload);
        const fileExt = compressedFile.name.split('.').pop();
        const fileName = `support/${crypto.randomUUID()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('message-media')
          .upload(fileName, compressedFile, { cacheControl: '3600', upsert: false, contentType: compressedFile.type });
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('message-media').getPublicUrl(fileName);
        mediaUrl = publicUrl;
        mediaType = compressedFile.type;
        setUploadingMedia(false);
      }

      // Insert message as support user
      const { data, error } = await supabase
        .from('messages')
        .insert({
          sender_id: SUPPORT_USER_ID,
          recipient_id: userId,
          message: messageText || '',
          media_url: mediaUrl,
          media_type: mediaType,
          client_id: clientId,
        })
        .select()
        .single();

      if (error) throw error;

      // Replace temp message with real one
      setMessages(prev => prev.map(m => m.client_id === clientId ? (data as Message) : m));
    } catch (error) {
      log.error('Error sending message:', error);
      toast.error('Failed to send message');
      // Mark as error
      setMessages(prev => prev.map(m => m.client_id === clientId ? { ...m, id: `error-${clientId}` } : m));
      setUploadingMedia(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b flex-shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Avatar>
            <AvatarImage src={userProfile.avatar_url || undefined} />
            <AvatarFallback>
              {formatDisplayName(userProfile.first_name, userProfile.last_name).split(' ').map(n => n[0]).join('')}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold">
              {formatDisplayName(userProfile.first_name, userProfile.last_name)}
            </p>
            <p className="text-xs text-muted-foreground">{userProfile.email}</p>
          </div>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto relative">
        {loadingMessages ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : sortedMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-center text-muted-foreground">
            <p className="text-sm">No messages yet.</p>
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
                <MessageItem 
                  key={message.id} 
                  message={message} 
                  isMe={message.sender_id === SUPPORT_USER_ID} 
                />
              </div>
            )}
          />
        )}
      </div>
      
      <div className="p-4 border-t flex-shrink-0">
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
            placeholder="Reply as Parkzy Support..."
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            disabled={uploadingMedia}
            className="flex-1"
          />
          <Button onClick={handleSendMessage} disabled={(!messageInput.trim() && !selectedMedia) || uploadingMedia}>
            {uploadingMedia ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SupportMessagesContent() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState<ConversationUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const isMobile = useIsMobile();

  // Load conversations from URL
  useEffect(() => {
    const userIdFromUrl = searchParams.get('userId');
    if (userIdFromUrl !== selectedUserId) {
      setSelectedUserId(userIdFromUrl);
    }
  }, [searchParams, selectedUserId]);

  // Fetch all users who have messaged support
  useEffect(() => {
    fetchSupportConversations();
  }, []);

  const fetchSupportConversations = async () => {
    setLoading(true);
    try {
      // Get all messages to/from support
      const { data: messages, error } = await supabase
        .from('messages')
        .select('*')
        .or(`sender_id.eq.${SUPPORT_USER_ID},recipient_id.eq.${SUPPORT_USER_ID}`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Group by other user
      const userMap = new Map<string, { messages: Message[]; lastMessage: Message }>();
      (messages || []).forEach((msg: Message) => {
        const otherUserId = msg.sender_id === SUPPORT_USER_ID ? msg.recipient_id : msg.sender_id;
        if (!userMap.has(otherUserId)) {
          userMap.set(otherUserId, { messages: [], lastMessage: msg });
        }
        userMap.get(otherUserId)!.messages.push(msg);
      });

      // Fetch profiles for all users
      const userIds = Array.from(userMap.keys());
      if (userIds.length === 0) {
        setConversations([]);
        setLoading(false);
        return;
      }

      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name, avatar_url, email')
        .in('user_id', userIds);

      const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));

      // Build conversation list
      const convs: ConversationUser[] = userIds.map(userId => {
        const userData = userMap.get(userId)!;
        const profile = profileMap.get(userId);
        const unreadCount = userData.messages.filter(
          m => m.sender_id === userId && m.recipient_id === SUPPORT_USER_ID && !m.read_at
        ).length;

        return {
          user_id: userId,
          first_name: profile?.first_name || null,
          last_name: profile?.last_name || null,
          avatar_url: profile?.avatar_url || null,
          email: profile?.email || null,
          last_message: userData.lastMessage.message || '(Media)',
          last_message_time: userData.lastMessage.created_at,
          unread_count: unreadCount,
        };
      });

      // Sort by last message time, unread first
      convs.sort((a, b) => {
        if (a.unread_count > 0 && b.unread_count === 0) return -1;
        if (b.unread_count > 0 && a.unread_count === 0) return 1;
        return new Date(b.last_message_time).getTime() - new Date(a.last_message_time).getTime();
      });

      setConversations(convs);
    } catch (err) {
      log.error('Error fetching support conversations:', err);
      toast.error('Failed to load conversations');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectConversation = (userId: string) => {
    setSearchParams({ userId }, { replace: true });
  };

  const handleBack = () => {
    setSearchParams({}, { replace: true });
  };

  const filteredConversations = conversations.filter(conv => {
    const name = formatDisplayName(conv.first_name, conv.last_name).toLowerCase();
    const email = (conv.email || '').toLowerCase();
    const query = searchQuery.toLowerCase();
    return name.includes(query) || email.includes(query);
  });

  const selectedUser = conversations.find(c => c.user_id === selectedUserId);

  // Mobile view
  if (isMobile) {
    if (selectedUserId && selectedUser) {
      return (
        <div className="h-full flex flex-col">
          <SupportChatPane
            userId={selectedUserId}
            onBack={handleBack}
            userProfile={selectedUser}
          />
        </div>
      );
    }

    return (
      <div className="h-full flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Support Inbox</h1>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Shield className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>No support conversations yet</p>
            </div>
          ) : (
            filteredConversations.map((conv) => (
              <div
                key={conv.user_id}
                onClick={() => handleSelectConversation(conv.user_id)}
                className="flex items-center gap-3 p-4 hover:bg-muted/50 cursor-pointer border-b"
              >
                <Avatar>
                  <AvatarImage src={conv.avatar_url || undefined} />
                  <AvatarFallback>
                    {formatDisplayName(conv.first_name, conv.last_name).split(' ').map(n => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-medium truncate">
                      {formatDisplayName(conv.first_name, conv.last_name)}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(conv.last_message_time), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{conv.last_message}</p>
                  {conv.email && (
                    <p className="text-xs text-muted-foreground truncate">{conv.email}</p>
                  )}
                </div>
                {conv.unread_count > 0 && (
                  <Badge variant="destructive" className="h-5 min-w-5 p-0 flex items-center justify-center text-xs">
                    {conv.unread_count}
                  </Badge>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // Desktop view
  return (
    <div className="h-full flex">
      {/* Conversation List */}
      <div className="w-80 border-r flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Support Inbox</h1>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Shield className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No support conversations</p>
            </div>
          ) : (
            filteredConversations.map((conv) => (
              <div
                key={conv.user_id}
                onClick={() => handleSelectConversation(conv.user_id)}
                className={`flex items-center gap-3 p-4 hover:bg-muted/50 cursor-pointer border-b ${
                  selectedUserId === conv.user_id ? 'bg-muted' : ''
                }`}
              >
                <Avatar>
                  <AvatarImage src={conv.avatar_url || undefined} />
                  <AvatarFallback>
                    {formatDisplayName(conv.first_name, conv.last_name).split(' ').map(n => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-medium truncate">
                      {formatDisplayName(conv.first_name, conv.last_name)}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(conv.last_message_time), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{conv.last_message}</p>
                </div>
                {conv.unread_count > 0 && (
                  <Badge variant="destructive" className="h-5 min-w-5 p-0 flex items-center justify-center text-xs">
                    {conv.unread_count}
                  </Badge>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat Pane */}
      <div className="flex-1 flex flex-col">
        {selectedUserId && selectedUser ? (
          <SupportChatPane
            userId={selectedUserId}
            onBack={handleBack}
            userProfile={selectedUser}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Shield className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>Select a conversation to respond</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SupportMessages() {
  return (
    <RequireAuth>
      <SupportMessagesContent />
    </RequireAuth>
  );
}
