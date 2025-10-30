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

const Messages = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const { conversations, loading, markAsRead } = useMessages();
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [newUserProfile, setNewUserProfile] = useState<any>(null);
  const [messageInput, setMessageInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const virtuosoRef = useRef<any>(null);
  const isMobile = useIsMobile();

  // Auto-select conversation from URL parameter
  useEffect(() => {
    const userIdFromUrl = searchParams.get('userId');
    if (userIdFromUrl) {
      const existingConv = conversations.find(c => c.user_id === userIdFromUrl);
      if (existingConv) {
        setSelectedConversation(userIdFromUrl);
        setNewUserProfile(null);
      } else {
        // Start new conversation - fetch user profile
        fetchNewUserProfile(userIdFromUrl);
        setSelectedConversation(userIdFromUrl);
      }
    }
  }, [searchParams, conversations]);

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

  // Load initial messages when conversation is selected
  useEffect(() => {
    if (!selectedConversation || !user) return;

    const loadInitialMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${user.id},recipient_id.eq.${selectedConversation}),and(sender_id.eq.${selectedConversation},recipient_id.eq.${user.id})`)
        .order('created_at', { ascending: true });

      if (!error && data) {
        setMessages(data as Message[]);
        await markAsRead(selectedConversation);
      }
    };

    loadInitialMessages();
  }, [selectedConversation, user, markAsRead]);

  // Set up real-time subscription with the dedicated hook
  useRealtimeMessages(selectedConversation, user?.id, setMessages);

  // Virtuoso handles auto-scroll via followOutput
  useEffect(() => {
    if (!selectedConversation || !user || messages.length === 0) return;

    const latestMsg = messages[messages.length - 1];
    if (latestMsg.sender_id === selectedConversation && !latestMsg.read_at) {
      markAsRead(selectedConversation);
    }
  }, [messages, selectedConversation, user, markAsRead]);

  const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'];
    if (!validTypes.includes(file.type)) {
      toast.error('Invalid file type. Please select an image or video.');
      return;
    }

    // Validate file size (50MB)
    if (file.size > 52428800) {
      toast.error('File size too large. Maximum size is 50MB.');
      return;
    }

    setSelectedMedia(file);
    setMediaPreview(URL.createObjectURL(file));
  };

  const handleRemoveMedia = () => {
    if (mediaPreview) {
      URL.revokeObjectURL(mediaPreview);
    }
    setSelectedMedia(null);
    setMediaPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSendMessage = async () => {
    if ((!messageInput.trim() && !selectedMedia) || !selectedConversation || !user) return;

    const messageText = messageInput.trim();
    const mediaToUpload = selectedMedia;

    // CRITICAL: Clear input immediately (send without media first)
    setMessageInput('');
    handleRemoveMedia();

    // Fire-and-forget: render optimistic bubble + broadcast + insert (non-blocking)
    const clientId = await sendMessageLib({
      recipientId: selectedConversation,
      senderId: user.id,
      messageText: messageText || '',
      setMessages,
      onError: (error) => {
        toast.error('Failed to send message');
        console.error('Error sending message:', error);
      }
    });

    // Background upload (if media selected) - doesn't block send
    if (mediaToUpload) {
      setUploadingMedia(true);
      
      try {
        const fileExt = mediaToUpload.name.split('.').pop();
        const fileName = `${user.id}/${crypto.randomUUID()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('message-media')
          .upload(fileName, mediaToUpload, {
            cacheControl: '3600',
            upsert: false,
            contentType: mediaToUpload.type
          });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('message-media')
          .getPublicUrl(fileName);

        // Get the real DB id by client_id
        const { data: row } = await supabase
          .from('messages')
          .select('id')
          .eq('client_id', clientId)
          .single();

        if (row?.id) {
          // Update the message with media (Realtime UPDATE will show it)
          await supabase.from('messages')
            .update({ media_url: publicUrl, media_type: mediaToUpload.type })
            .eq('id', row.id);
        }
      } catch (error) {
        toast.error('Failed to upload media');
        console.error('Error uploading media:', error);
      } finally {
        setUploadingMedia(false);
      }
    }
  };

  const filteredConversations = conversations.filter(conv =>
    conv.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedConvData = conversations.find(c => c.user_id === selectedConversation);
  
  // Use new user profile if starting a new conversation
  const displayName = selectedConvData?.name || 
    (newUserProfile ? `${newUserProfile.first_name || ''} ${newUserProfile.last_name || ''}`.trim() || 'User' : 'User');
  const displayAvatar = selectedConvData?.avatar_url || newUserProfile?.avatar_url;

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
                  onClick={() => setSelectedConversation(conversation.user_id)}
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
          <>
            <div className="p-4 border-b">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSelectedConversation(null)}>
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <Avatar>
                  <AvatarImage src={displayAvatar} />
                  <AvatarFallback>
                    {displayName.split(' ').map(n => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold">{displayName}</p>
                  <p className="text-sm text-muted-foreground">Active</p>
                </div>
              </div>
            </div>
            <div className="flex-1 relative">
              {messages.length === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center text-center text-muted-foreground">
                  <p className="text-sm">No messages yet. Start the conversation!</p>
                </div>
              ) : (
                <Virtuoso
                  ref={virtuosoRef}
                  data={messages}
                  followOutput="smooth"
                  itemContent={(index, message) => (
                    <div className="px-4 py-2">
                      <MessageItem 
                        key={message.id} 
                        message={message} 
                        isMe={message.sender_id === user?.id} 
                      />
                    </div>
                  )}
                />
              )}
            </div>
            <div className="p-4 border-t">
              {/* Media preview */}
              {mediaPreview && (
                <div className="mb-2 relative inline-block">
                  <div className="relative">
                    {selectedMedia?.type.startsWith('image/') ? (
                      <img 
                        src={mediaPreview} 
                        alt="Preview"
                        className="h-20 w-20 object-cover rounded-md"
                      />
                    ) : (
                      <video 
                        src={mediaPreview}
                        className="h-20 w-20 object-cover rounded-md"
                      />
                    )}
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute -top-2 -right-2 h-6 w-6"
                      onClick={handleRemoveMedia}
                    >
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
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingMedia}
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Input
                  placeholder="Type a message..."
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                />
                <Button 
                  onClick={handleSendMessage} 
                  size="icon"
                  disabled={uploadingMedia || (!messageInput.trim() && !selectedMedia)}
                >
                  {uploadingMedia ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </>
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
