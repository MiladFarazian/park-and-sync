import { useState, useEffect, useRef, memo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, Send, Loader2, ArrowLeft, Paperclip, X, Check, CheckCheck, PenSquare, User, MapPin, Calendar } from 'lucide-react';
import { useMessages, Message, BookingContext } from '@/contexts/MessagesContext';
import { useAuth } from '@/contexts/AuthContext';
import { useMode } from '@/contexts/ModeContext';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow, format } from 'date-fns';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import { useRealtimeMessages } from '@/hooks/useRealtimeMessages';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { sendMessage as sendMessageLib } from '@/lib/sendMessage';
import { compressImage } from '@/lib/compressImage';
import { getStreetAddress } from '@/lib/addressUtils';
import { Virtuoso } from 'react-virtuoso';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import RequireAuth from '@/components/auth/RequireAuth';
import RequireVerifiedAuth from '@/components/auth/RequireVerifiedAuth';
import GuestChatPaneHost from '@/components/guest/GuestChatPaneHost';
import BookingContextHeader from '@/components/messages/BookingContextHeader';

// Helper to format display name (First Name + Last Initial)
const formatDisplayName = (firstName?: string | null, lastName?: string | null): string => {
  const first = firstName?.trim() || '';
  const lastInitial = lastName?.trim()?.[0] || '';
  if (!first && !lastInitial) return 'User';
  return lastInitial ? `${first} ${lastInitial}.` : first;
};

// Memoized message item component for performance
const MessageItem = memo(({
  message,
  isMe
}: {
  message: Message;
  isMe: boolean;
}) => {
  const isVideo = message.media_type?.startsWith('video/');
  const isImage = message.media_type?.startsWith('image/');
  return <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[70%] rounded-lg p-3 ${isMe ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
        {message.media_url && <div className="mb-2">
            {isImage && <img src={message.media_url} alt="Shared media" className="rounded-md max-w-full h-auto max-h-64 object-cover" onError={e => {
          console.error('Failed to load image:', message.media_url);
          e.currentTarget.style.display = 'none';
        }} />}
            {isVideo && <video src={message.media_url} controls className="rounded-md max-w-full h-auto max-h-64" onError={e => {
          console.error('Failed to load video:', message.media_url);
        }} />}
          </div>}
        
        {message.message && <p className="text-sm">{message.message}</p>}
        
        <div className={`flex items-center gap-1 mt-1 ${isMe ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
          <span className="text-xs">
            {new Date(message.created_at).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit'
          })}
          </span>
          {isMe && <>
              {message.read_at ? <CheckCheck className="h-3 w-3 text-green-500" /> : message.delivered_at ? <CheckCheck className="h-3 w-3 text-white/60" /> : <Check className="h-3 w-3 text-white/60" />}
            </>}
        </div>
      </div>
    </div>;
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
  bookingContext,
  partnerRole
}: {
  conversationId: string;
  userId: string;
  onBack: () => void;
  displayName: string;
  displayAvatar?: string;
  messagesCacheRef: React.MutableRefObject<Map<string, Message[]>>;
  markAsRead: (otherUserId: string) => Promise<void> | void;
  bookingContext?: BookingContext;
  partnerRole?: 'host' | 'driver';
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [showNewMessageButton, setShowNewMessageButton] = useState(false);

  // Typing indicator
  const {
    isPartnerTyping,
    broadcastTyping,
    broadcastStoppedTyping
  } = useTypingIndicator(conversationId, userId);

  // Keyboard handling for iOS
  const { isKeyboardOpen } = useKeyboardHeight();

  const typingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const virtuosoRef = useRef<any>(null);
  const atBottomRef = useRef(true);
  const initialLoadRef = useRef(true);
  const loadingOlderRef = useRef(false);

  // Scroll to bottom when keyboard opens
  useEffect(() => {
    if (isKeyboardOpen && virtuosoRef.current) {
      requestAnimationFrame(() => {
        virtuosoRef.current?.scrollToIndex({
          index: 'LAST',
          align: 'end',
          behavior: 'auto'
        });
      });
    }
  }, [isKeyboardOpen]);

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
      // Immediate scroll to bottom for cached messages using requestAnimationFrame
      requestAnimationFrame(() => {
        if (virtuosoRef.current && alive) {
          virtuosoRef.current.scrollToIndex({
            index: 'LAST',
            align: 'end',
            behavior: 'auto'
          });
        }
      });
    } else {
      setLoadingMessages(true);
    }
    (async () => {
      const {
        data,
        error
      } = await supabase.from('messages').select('*').or(`and(sender_id.eq.${userId},recipient_id.eq.${convId}),and(sender_id.eq.${convId},recipient_id.eq.${userId})`).order('created_at', {
        ascending: true
      });
      if (!alive) return;
      if (error) {
        setLoadingMessages(false);
        return;
      }
      // Drop late results
      if (convId !== conversationId) return;
      setMessages((data || []) as Message[]);
      messagesCacheRef.current.set(convId, (data || []) as Message[]);
      setLoadingMessages(false);

      // Delay markAsRead to let unread indicators show briefly on conversation list
      setTimeout(() => {
        if (alive) markAsRead(convId);
      }, 1000);

      // Enhanced scroll to bottom - use requestAnimationFrame for better timing
      const scrollToEnd = () => {
        if (!alive || !virtuosoRef.current) return;
        virtuosoRef.current.scrollToIndex({
          index: 'LAST',
          align: 'end',
          behavior: 'auto'
        });
      };

      // Use requestAnimationFrame for better timing with React render cycle
      requestAnimationFrame(() => {
        scrollToEnd();
        // Second attempt after a frame
        requestAnimationFrame(() => {
          scrollToEnd();
          // Final attempt after render settles
          setTimeout(() => {
            scrollToEnd();
            initialLoadRef.current = false;
          }, 150);
        });
      });
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
      const {
        data,
        error
      } = await supabase.from('messages').select('*').or(`and(sender_id.eq.${userId},recipient_id.eq.${conversationId}),and(sender_id.eq.${conversationId},recipient_id.eq.${userId})`).lt('created_at', oldest.created_at).order('created_at', {
        ascending: false
      }).limit(20);
      if (!error && data && data.length > 0) {
        setMessages(prev => [...data.reverse(), ...prev]);
      }
    } finally {
      loadingOlderRef.current = false;
    }
  };
  const scrollToBottom = () => {
    if (virtuosoRef.current) {
      virtuosoRef.current.scrollToIndex({
        index: 'LAST',
        align: 'end',
        behavior: 'smooth'
      });
    }
    setShowNewMessageButton(false);
  };
  const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'];
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
    if (!messageInput.trim() && !selectedMedia || !conversationId || !userId) return;
    const messageText = messageInput.trim();
    const mediaToUpload = selectedMedia;
    setMessageInput('');
    handleRemoveMedia();
    const clientId = sendMessageLib({
      recipientId: conversationId,
      senderId: userId,
      messageText: messageText || '',
      setMessages,
      onError: error => {
        toast.error('Failed to send message');
        console.error('Error sending message:', error);
      }
    });
    if (mediaToUpload) {
      setUploadingMedia(true);
      (async () => {
        try {
          const compressedFile = await compressImage(mediaToUpload);
          const fileExt = compressedFile.name.split('.').pop();
          const fileName = `${userId}/${crypto.randomUUID()}.${fileExt}`;
          const {
            error: uploadError
          } = await supabase.storage.from('message-media').upload(fileName, compressedFile, {
            cacheControl: '3600',
            upsert: false,
            contentType: compressedFile.type
          });
          if (uploadError) throw uploadError;
          const {
            data: {
              publicUrl
            }
          } = supabase.storage.from('message-media').getPublicUrl(fileName);
          // resolve DB row by client_id and update media
          let row: {
            id: string;
          } | null = null;
          for (let i = 0; i < 3; i++) {
            const {
              data
            } = await supabase.from('messages').select('id').eq('client_id', clientId).maybeSingle();
            if (data) {
              row = data;
              break;
            }
            await new Promise(r => setTimeout(r, 100 * Math.pow(2, i)));
          }
          if (row?.id) {
            await supabase.from('messages').update({
              media_url: publicUrl,
              media_type: compressedFile.type
            }).eq('id', row.id);
          } else {
            throw new Error('Message not found after upload');
          }
        } catch (error) {
          toast.error('Failed to upload media');
          setMessages(prev => prev.map(m => m.client_id === clientId ? {
            ...m,
            id: `error-${clientId}`
          } : m));
        } finally {
          setUploadingMedia(false);
        }
      })();
    }
  };
  return <div className="flex flex-col h-full bg-card" style={{
    minHeight: 0,
    transform: 'translateZ(0)',
    backfaceVisibility: 'hidden',
    WebkitBackfaceVisibility: 'hidden',
    WebkitOverflowScrolling: 'touch'
  } as React.CSSProperties}>
      <div className="p-4 border-b flex-shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Avatar>
            <AvatarImage src={displayAvatar} />
            <AvatarFallback>{displayName.split(' ').map(n => n[0]).join('')}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold flex items-center gap-2">
              {displayName}
              {conversationId === '00000000-0000-0000-0000-000000000001' && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Support
                </span>}
              {partnerRole && conversationId !== '00000000-0000-0000-0000-000000000001' && <Badge variant="outline" className="text-xs">
                  {partnerRole === 'host' ? 'Host' : 'Driver'}
                </Badge>}
            </p>
            <p className="text-sm text-muted-foreground">
              {isPartnerTyping ? <span className="flex items-center gap-1 text-primary">
                  <span className="flex gap-0.5">
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{
                  animationDelay: '0ms'
                }}></span>
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{
                  animationDelay: '150ms'
                }}></span>
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{
                  animationDelay: '300ms'
                }}></span>
                  </span>
                  typing...
                </span> : conversationId === '00000000-0000-0000-0000-000000000001' ? "We'll respond within 24 hours" : "Active"}
            </p>
          </div>
        </div>
      </div>
      
      {/* Booking Context Header */}
      {bookingContext && <BookingContextHeader booking={bookingContext} partnerName={displayName} partnerRole={partnerRole} />}
      
      <div className="flex-1 overflow-y-auto min-h-0 relative" style={{
      transform: 'translateZ(0)',
      backfaceVisibility: 'hidden',
      WebkitBackfaceVisibility: 'hidden',
      WebkitOverflowScrolling: 'touch',
      paddingBottom: '8px'
    } as React.CSSProperties}>
        {loadingMessages && !messagesCacheRef.current.get(conversationId)?.length ? <div className="flex items-center justify-center h-full text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div> : sortedMessages.length === 0 ? <div className="flex items-center justify-center h-full text-center text-muted-foreground">
              <p className="text-sm">No messages yet. Start the conversation!</p>
            </div> : <>
              <Virtuoso 
                style={{ height: '100%' }} 
                key={conversationId} 
                ref={virtuosoRef} 
                data={sortedMessages} 
                computeItemKey={(index, item) => item.id} 
                initialTopMostItemIndex={sortedMessages.length > 0 ? sortedMessages.length - 1 : 0} 
                increaseViewportBy={{ top: 200, bottom: 50 }}
                followOutput={() => atBottomRef.current ? 'auto' : false} 
                atBottomStateChange={isAtBottom => {
                  atBottomRef.current = isAtBottom;
                  if (isAtBottom) {
                    setShowNewMessageButton(false);
                  } else {
                    if (!initialLoadRef.current && sortedMessages.length > 0) {
                      const latestMsg = sortedMessages[sortedMessages.length - 1];
                      if (latestMsg.sender_id === conversationId) {
                        setShowNewMessageButton(true);
                      }
                    }
                  }
                }} 
                atBottomThreshold={50} 
                startReached={loadOlderMessages} 
                itemContent={(index, message) => <div className="px-4 py-1.5">
                    <MessageItem key={message.id} message={message} isMe={message.sender_id === userId} />
                  </div>} 
              />
              {showNewMessageButton && <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10">
                  <Button size="sm" onClick={scrollToBottom} className="shadow-lg">
                    New messages ↓
                  </Button>
                </div>}
            </>}
      </div>
      
      {/* Input Area */}
      <div className="px-3 py-2 pb-3 border-t flex-shrink-0 bg-card">
        {mediaPreview && <div className="mb-2 relative inline-block">
            <div className="relative">
              {selectedMedia?.type.startsWith('image/') ? <img src={mediaPreview} alt="Preview" className="h-16 w-16 object-cover rounded-md" /> : <video src={mediaPreview} className="h-16 w-16 object-cover rounded-md" />}
              <Button variant="destructive" size="icon" className="absolute -top-2 -right-2 h-5 w-5" onClick={handleRemoveMedia}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>}
        <div className="flex gap-2 items-end">
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm" onChange={handleMediaSelect} className="hidden" />
          <Button variant="outline" size="icon" className="h-10 w-10 flex-shrink-0" onClick={() => fileInputRef.current?.click()} disabled={uploadingMedia}>
            <Paperclip className="h-4 w-4" />
          </Button>
          <Input placeholder="Type a message..." className="flex-1 h-10 text-base md:text-sm" value={messageInput} onChange={e => {
          setMessageInput(e.target.value);
          // Broadcast typing indicator
          if (e.target.value.trim()) {
            broadcastTyping();
            // Clear previous timeout and set new one to broadcast stopped typing
            if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
            typingDebounceRef.current = setTimeout(() => {
              broadcastStoppedTyping();
            }, 2000);
          } else {
            broadcastStoppedTyping();
          }
        }} onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            broadcastStoppedTyping();
            handleSendMessage();
          }
        }} />
          <Button onClick={handleSendMessage} size="icon" className="h-10 w-10 flex-shrink-0" disabled={uploadingMedia || !messageInput.trim() && !selectedMedia}>
            {uploadingMedia ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>;
}
interface BookingContact {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  spot_title: string;
  booking_date: string;
}
const MessagesContent = () => {
  const {
    user
  } = useAuth();
  const {
    mode
  } = useMode();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    conversations,
    loading,
    markAsRead
  } = useMessages();
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [newUserProfile, setNewUserProfile] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const isMobile = useIsMobile();
  const messagesCacheRef = useRef<Map<string, Message[]>>(new Map());
  const [tick, setTick] = useState(0);
  const [composeOpen, setComposeOpen] = useState(false);
  const [bookingContacts, setBookingContacts] = useState<BookingContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);

  // Force re-render every 60 seconds to update relative timestamps
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

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
      // Special handling for support user
      if (userId === '00000000-0000-0000-0000-000000000001') {
        setNewUserProfile({
          user_id: userId,
          first_name: 'Parkzy',
          last_name: 'Support',
          avatar_url: '/parkzy-support-avatar.png'
        });
        return;
      }
      const {
        data,
        error
      } = await supabase.from('profiles').select('user_id, first_name, last_name, avatar_url').eq('user_id', userId).single();
      if (error) throw error;
      setNewUserProfile(data);
    } catch (error) {
      console.error('Error fetching user profile:', error);
      toast.error('Failed to load user profile');
    }
  };
  const fetchBookingContacts = async () => {
    if (!user?.id) return;
    setLoadingContacts(true);
    try {
      const contactUserIds = new Set<string>();
      const contactsMap = new Map<string, {
        spot_title: string;
        booking_date: string;
      }>();
      if (mode === 'driver') {
        // Driver mode: get hosts of spots user has booked
        const {
          data: renterBookings
        } = await supabase.from('bookings').select(`
            spot_id,
            start_at,
            spots!inner(title, host_id)
          `).eq('renter_id', user.id).in('status', ['paid', 'active', 'completed']);
        renterBookings?.forEach((b: any) => {
          const hostId = b.spots?.host_id;
          if (hostId && hostId !== user.id) {
            contactUserIds.add(hostId);
            if (!contactsMap.has(hostId)) {
              contactsMap.set(hostId, {
                spot_title: b.spots?.title || 'Parking Spot',
                booking_date: b.start_at
              });
            }
          }
        });
      } else {
        // Host mode: get renters who have booked user's spots
        const {
          data: hostBookings
        } = await supabase.from('bookings').select(`
            renter_id,
            start_at,
            spots!inner(title, host_id)
          `).eq('spots.host_id', user.id).in('status', ['paid', 'active', 'completed']);
        hostBookings?.forEach((b: any) => {
          const renterId = b.renter_id;
          if (renterId && renterId !== user.id) {
            contactUserIds.add(renterId);
            if (!contactsMap.has(renterId)) {
              contactsMap.set(renterId, {
                spot_title: b.spots?.title || 'Parking Spot',
                booking_date: b.start_at
              });
            }
          }
        });
      }
      if (contactUserIds.size === 0) {
        setBookingContacts([]);
        return;
      }

      // Fetch profiles for all contacts
      const {
        data: profiles
      } = await supabase.from('profiles').select('user_id, first_name, last_name, avatar_url').in('user_id', Array.from(contactUserIds));
      const contacts: BookingContact[] = (profiles || []).map(p => ({
        user_id: p.user_id,
        first_name: p.first_name,
        last_name: p.last_name,
        avatar_url: p.avatar_url,
        spot_title: contactsMap.get(p.user_id)?.spot_title || 'Parking Spot',
        booking_date: contactsMap.get(p.user_id)?.booking_date || ''
      }));

      // Filter out existing conversations
      const existingUserIds = new Set(conversations.map(c => c.user_id));
      const newContacts = contacts.filter(c => !existingUserIds.has(c.user_id));
      setBookingContacts(newContacts);
    } catch (error) {
      console.error('Error fetching booking contacts:', error);
    } finally {
      setLoadingContacts(false);
    }
  };
  const handleOpenCompose = () => {
    setComposeOpen(true);
    fetchBookingContacts();
  };
  const handleSelectContact = (userId: string) => {
    setComposeOpen(false);
    setSearchParams({
      userId
    }, {
      replace: true
    });
  };
  const filteredConversations = conversations.filter(conv => conv.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const selectedConvData = conversations.find(c => c.user_id === selectedConversation);

  // Use new user profile if starting a new conversation
  const displayName = selectedConvData?.name || (newUserProfile ? formatDisplayName(newUserProfile.first_name, newUserProfile.last_name) : 'User');
  const displayAvatar = selectedConvData?.avatar_url || newUserProfile?.avatar_url;
  const ComposeContent = () => <div className="space-y-2 max-h-[60vh] overflow-y-auto">
      {loadingContacts ? <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div> : bookingContacts.length === 0 ? <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">No new contacts from bookings</p>
          <p className="text-xs mt-1">Complete a booking to message hosts or renters</p>
        </div> : bookingContacts.map(contact => <button type="button" key={contact.user_id} onClick={() => handleSelectContact(contact.user_id)} onMouseDown={e => e.preventDefault()} className="w-full p-3 rounded-lg text-left transition-colors active:bg-accent flex items-center gap-3 touch-scroll-safe">
            <Avatar>
              <AvatarImage src={contact.avatar_url || undefined} />
              <AvatarFallback>
                {`${contact.first_name?.[0] || ''}${contact.last_name?.[0] || ''}`.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">
                {formatDisplayName(contact.first_name, contact.last_name)}
              </p>
              <p className="text-xs text-muted-foreground truncate">{contact.spot_title}</p>
            </div>
          </button>)}
    </div>;
  return <div className="flex min-h-0 bg-background h-full" style={{
    transform: 'translateZ(0)',
    paddingBottom: isMobile ? 'var(--bottom-nav-height)' : undefined
  }}>
      {/* Conversations List */}
      <div className={`${selectedConversation && isMobile ? 'hidden' : 'flex'} w-full md:w-80 flex-col overflow-hidden border-r bg-card`}>
        <div className="p-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold">Messages</h1>
            <Button variant="ghost" size="icon" onClick={handleOpenCompose}>
              <PenSquare className="h-5 w-5" />
            </Button>
          </div>
          
          {/* Contact Support Button */}
          <Button onClick={() => setSearchParams({
          userId: '00000000-0000-0000-0000-000000000001'
        }, {
          replace: true
        })} variant="outline" className="w-full mb-4 justify-start gap-2 border-primary/20 hover:bg-primary/5">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            Contact Support
          </Button>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search conversations..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="p-2">
            {loading ? <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div> : filteredConversations.length === 0 ? <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">No conversations yet</p>
              </div> : filteredConversations.map(conversation => <button type="button" key={`${conversation.user_id}-${conversation.last_message_at}-${tick}`} onClick={() => {
            setSearchParams({
              userId: conversation.user_id
            }, {
              replace: true
            });
          }} onMouseDown={e => e.preventDefault()} className={`w-full p-3 rounded-lg text-left transition-colors active:bg-accent touch-scroll-safe ${selectedConversation === conversation.user_id ? 'bg-accent' : ''}`}>
                  <div className="flex items-start gap-3">
                    <div className="relative">
                      <Avatar>
                        {conversation.is_guest_conversation ? <AvatarFallback><User className="h-4 w-4" /></AvatarFallback> : <>
                            <AvatarImage src={conversation.avatar_url} />
                            <AvatarFallback>{conversation.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                          </>}
                      </Avatar>
                      {/* Unread indicator dot - static */}
                      {conversation.unread_count > 0 && <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-primary border-2 border-background"></span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <div className="flex items-center gap-2">
                          <p className={`font-semibold text-sm truncate ${conversation.unread_count > 0 ? 'text-foreground' : ''}`}>
                            {conversation.name}
                          </p>
                          {conversation.is_guest_conversation && <Badge variant="outline" className="text-xs shrink-0">Guest</Badge>}
                          {conversation.partner_role && !conversation.is_guest_conversation && <Badge variant="secondary" className="text-xs shrink-0">
                              {conversation.partner_role === 'host' ? 'Host' : 'Driver'}
                            </Badge>}
                        </div>
                        <span className={`text-xs shrink-0 ${conversation.unread_count > 0 ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                          {formatDistanceToNow(new Date(conversation.last_message_at), {
                      addSuffix: true
                    })}
                        </span>
                      </div>
                      {/* Booking context subtitle */}
                      {conversation.booking_context && <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{getStreetAddress(conversation.booking_context.spot_address)}</span>
                          <span className="shrink-0">•</span>
                          <Calendar className="h-3 w-3 shrink-0" />
                          <span className="shrink-0">{format(new Date(conversation.booking_context.start_at), 'MMM d')}</span>
                        </div>}
                      <p className={`text-sm truncate ${conversation.unread_count > 0 ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                        {conversation.last_message}
                      </p>
                    </div>
                    {conversation.unread_count > 0 && <div className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-medium">
                        {conversation.unread_count}
                      </div>}
                  </div>
                </button>)}
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className={`${selectedConversation && isMobile ? 'flex' : 'hidden'} md:flex flex-1 flex-col overflow-hidden bg-card`} style={{
      minHeight: 0,
      transform: 'translateZ(0)'
    }}>
        {selectedConversation ?
      // Check if this is a guest conversation
      selectedConversation.startsWith('guest:') ? <GuestChatPaneHost bookingId={selectedConversation.replace('guest:', '')} guestName={selectedConvData?.guest_name || selectedConvData?.name?.replace(' (Guest)', '') || 'Guest'} onBack={() => setSearchParams({}, {
        replace: true
      })} markAsRead={markAsRead} /> : <ChatPane key={selectedConversation} conversationId={selectedConversation} userId={user?.id as string ?? ''} onBack={() => setSearchParams({}, {
        replace: true
      })} displayName={displayName} displayAvatar={displayAvatar} messagesCacheRef={messagesCacheRef} markAsRead={markAsRead} bookingContext={selectedConvData?.booking_context} partnerRole={selectedConvData?.partner_role} /> : <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <p className="text-lg font-medium">Select a conversation</p>
              <p className="text-sm">Choose a conversation from the list to start messaging</p>
            </div>
          </div>}
      </div>

      {/* Compose Message Modal */}
      {isMobile ? <Drawer open={composeOpen} onOpenChange={setComposeOpen}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>New Message</DrawerTitle>
            </DrawerHeader>
            <div className="px-4 pb-6">
              <ComposeContent />
            </div>
          </DrawerContent>
        </Drawer> : <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>New Message</DialogTitle>
            </DialogHeader>
            <ComposeContent />
          </DialogContent>
        </Dialog>}
    </div>;
};
const Messages = () => {
  return <RequireVerifiedAuth feature="messages">
      <MessagesContent />
    </RequireVerifiedAuth>;
};
export default Messages;