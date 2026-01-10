import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useMode } from '@/contexts/ModeContext';

// Booking context for conversations
export interface BookingContext {
  id: string;
  spot_title: string;
  spot_address: string;
  start_at: string;
  end_at: string;
  status: string;
}

// All bookings between two users
export type BookingsByPartner = Map<string, BookingContext[]>;

export interface Conversation {
  id: string;
  user_id: string;
  name: string;
  avatar_url?: string;
  last_message: string;
  last_message_at: string;
  unread_count: number;
  // Guest conversation metadata
  is_guest_conversation?: boolean;
  booking_id?: string;
  guest_name?: string;
  // All bookings with this partner (sorted by start_at desc)
  bookings?: BookingContext[];
  // User role in this conversation
  partner_role?: 'host' | 'driver';
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
  booking_id?: string | null;
}

export interface MessagesContextType {
  conversations: Conversation[];
  loading: boolean;
  markAsRead: (senderId: string) => Promise<void>;
  loadConversations: () => Promise<void>;
  totalUnreadCount: number;
  upsertConversationFromMessage: (msg: Message) => void;
}

export const MessagesContext = createContext<MessagesContextType | null>(null);

// Helper to format display name (First Name + Last Initial)
const formatDisplayName = (firstName?: string | null, lastName?: string | null): string => {
  const first = firstName?.trim() || '';
  const lastInitial = lastName?.trim()?.[0] || '';
  if (!first && !lastInitial) return 'Unknown User';
  return lastInitial ? `${first} ${lastInitial}.` : first;
};

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

export const MessagesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { mode } = useMode();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  const profileCacheRef = useRef<Map<string, { name: string; avatar_url?: string }>>(new Map());
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDataHashRef = useRef<string>('');
  const lastModeRef = useRef<string>(mode);

  // Track mode-relevant user IDs and booking context (hosts when driver, renters when host)
  const relevantUserIdsRef = useRef<{ ids: Set<string>; bookingsByPartner: BookingsByPartner }>({ ids: new Set(), bookingsByPartner: new Map() });

  // Fetch relevant user IDs and ALL their bookings based on mode
  const fetchRelevantUserIds = useCallback(async (): Promise<{
    ids: Set<string>;
    bookingsByPartner: BookingsByPartner;
  }> => {
    if (!user) return { ids: new Set(), bookingsByPartner: new Map() };

    try {
      const relevantIds = new Set<string>();
      const bookingsByPartner: BookingsByPartner = new Map();

      if (mode === 'driver') {
        // Driver mode: get hosts of spots user has booked
        const { data: bookings } = await supabase
          .from('bookings')
          .select(`
            id,
            start_at,
            end_at,
            status,
            spots!inner(host_id, title, address)
          `)
          .eq('renter_id', user.id)
          .in('status', ['paid', 'active', 'completed', 'pending'])
          .order('start_at', { ascending: false });

        bookings?.forEach((b: any) => {
          const hostId = b.spots?.host_id;
          if (hostId) {
            relevantIds.add(hostId);
            // Collect ALL bookings for each host
            if (!bookingsByPartner.has(hostId)) {
              bookingsByPartner.set(hostId, []);
            }
            bookingsByPartner.get(hostId)!.push({
              id: b.id,
              spot_title: b.spots.title,
              spot_address: b.spots.address,
              start_at: b.start_at,
              end_at: b.end_at,
              status: b.status,
            });
          }
        });
        // Host mode: get renters who have booked user's spots
        const { data: hostSpots } = await supabase
          .from('spots')
          .select('id, title, address')
          .eq('host_id', user.id);

        if (hostSpots && hostSpots.length > 0) {
          const spotIds = hostSpots.map(s => s.id);
          const spotMap = new Map(hostSpots.map(s => [s.id, s]));
          
          const { data: bookings } = await supabase
            .from('bookings')
            .select('id, renter_id, spot_id, start_at, end_at, status')
            .in('spot_id', spotIds)
            .in('status', ['paid', 'active', 'completed', 'pending'])
            .order('start_at', { ascending: false });

          bookings?.forEach(b => {
            if (b.renter_id) {
              relevantIds.add(b.renter_id);
              // Collect ALL bookings for each renter
              if (!bookingsByPartner.has(b.renter_id)) {
                bookingsByPartner.set(b.renter_id, []);
              }
              const spot = spotMap.get(b.spot_id);
              if (spot) {
                bookingsByPartner.get(b.renter_id)!.push({
                  id: b.id,
                  spot_title: spot.title,
                  spot_address: spot.address,
                  start_at: b.start_at,
                  end_at: b.end_at,
                  status: b.status,
                });
              }
            }
          });
        }
      }

      // Always include support user
      relevantIds.add('00000000-0000-0000-0000-000000000001');

      return { ids: relevantIds, bookingsByPartner };
    } catch (error) {
      console.error('Error fetching relevant user IDs:', error);
      return { ids: new Set(), bookingsByPartner: new Map() };
    }
  }, [user, mode]);

  // Fetch guest conversations for hosts
  const fetchGuestConversations = useCallback(async (): Promise<Conversation[]> => {
    if (!user) return [];

    try {
      // Get all bookings where user is host with guest messages
      const { data: hostSpots } = await supabase
        .from('spots')
        .select('id')
        .eq('host_id', user.id);

      if (!hostSpots || hostSpots.length === 0) return [];

      const spotIds = hostSpots.map(s => s.id);

      // Get guest bookings with messages for host's spots
      const { data: guestBookings } = await supabase
        .from('bookings')
        .select(`
          id,
          guest_full_name,
          guest_email,
          spots!inner(id, title, host_id)
        `)
        .in('spot_id', spotIds)
        .eq('is_guest', true);

      if (!guestBookings || guestBookings.length === 0) return [];

      const bookingIds = guestBookings.map(b => b.id);

      // Fetch guest messages for these bookings
      const { data: guestMessages } = await supabase
        .from('guest_messages')
        .select('*')
        .in('booking_id', bookingIds)
        .order('created_at', { ascending: false });

      if (!guestMessages || guestMessages.length === 0) return [];

      // Group messages by booking
      const messagesByBooking = new Map<string, any[]>();
      for (const msg of guestMessages) {
        if (!messagesByBooking.has(msg.booking_id)) {
          messagesByBooking.set(msg.booking_id, []);
        }
        messagesByBooking.get(msg.booking_id)!.push(msg);
      }

      // Build guest conversations
      const guestConvs: Conversation[] = [];
      for (const booking of guestBookings) {
        const messages = messagesByBooking.get(booking.id);
        if (!messages || messages.length === 0) continue;

        const latestMsg = messages[0]; // Already sorted desc
        const unreadCount = messages.filter(m => m.sender_type === 'guest' && !m.read_at).length;

        guestConvs.push({
          id: `guest:${booking.id}`,
          user_id: `guest:${booking.id}`,
          name: booking.guest_full_name || 'Guest',
          avatar_url: undefined,
          last_message: latestMsg.message,
          last_message_at: latestMsg.created_at,
          unread_count: unreadCount,
          is_guest_conversation: true,
          booking_id: booking.id,
          guest_name: booking.guest_full_name || 'Guest',
        });
      }

      return guestConvs;
    } catch (error) {
      console.error('Error fetching guest conversations:', error);
      return [];
    }
  }, [user]);

  // Build conversations from messages (shared logic)
  const buildConversations = useCallback(async (
    allMessages: any[], 
    profiles: any[], 
    guestConvs: Conversation[] = [], 
    relevantData: { ids: Set<string>; bookingsByPartner: BookingsByPartner }
  ): Promise<Conversation[]> => {
    if (!user) return [];
    
    const conversationMap = new Map<string, any>();
    const { ids: relevantIds, bookingsByPartner } = relevantData;
    
    for (const msg of allMessages || []) {
      const partnerId = msg.sender_id === user.id ? msg.recipient_id : msg.sender_id;
      
      // Filter by relevant IDs (booking-related contacts for current mode)
      if (relevantIds.size > 0 && !relevantIds.has(partnerId)) {
        continue;
      }
      
      if (!conversationMap.has(partnerId)) {
        conversationMap.set(partnerId, {
          user_id: partnerId,
          last_message: getMessagePreview(msg, user.id),
          last_message_at: msg.created_at,
          unread_count: 0,
          messages: []
        });
      } else {
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

    const convs: Conversation[] = [];
    for (const [partnerId, conv] of conversationMap) {
      const isSupportUser = partnerId === '00000000-0000-0000-0000-000000000001';
      const profile = profiles?.find(p => p.user_id === partnerId);
      const profileName = isSupportUser 
        ? 'Parkzy Support' 
        : (profile ? formatDisplayName(profile.first_name, profile.last_name) : 'Unknown User');
      const profileAvatar = isSupportUser
        ? '/parkzy-support-avatar.png'
        : profile?.avatar_url;
      
      const lastMsg = conv.messages.sort((a: Message, b: Message) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];
      
      // Get all bookings for this partner
      const partnerBookings = bookingsByPartner.get(partnerId) || [];
      
      convs.push({
        id: partnerId,
        user_id: partnerId,
        name: profileName,
        avatar_url: profileAvatar,
        last_message: getMessagePreview(lastMsg, user.id, profileName),
        last_message_at: conv.last_message_at,
        unread_count: conv.unread_count,
        bookings: partnerBookings,
        partner_role: mode === 'driver' ? 'host' : 'driver',
      });
    }

    // Add guest conversations only in host mode
    const allConvs = mode === 'host' ? [...convs, ...guestConvs] : convs;
    allConvs.sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());
    return allConvs;
  }, [user, mode]);

  // Create a hash of conversations for comparison
  const hashConversations = (convs: Conversation[]): string => {
    return convs.map(c => `${c.user_id}:${c.last_message_at}:${c.unread_count}:${c.last_message}`).join('|');
  };

  // Silent refresh - only updates state if data changed (no loading indicator)
  const silentRefresh = useCallback(async () => {
    if (!user || !mountedRef.current) return;

    try {
      const [messagesResult, guestConvs, relevantData] = await Promise.all([
        supabase
          .from('messages')
          .select('*')
          .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
          .order('created_at', { ascending: false }),
        mode === 'host' ? fetchGuestConversations() : Promise.resolve([]),
        fetchRelevantUserIds()
      ]);

      const { data: allMessages, error } = messagesResult;
      if (error || !mountedRef.current) return;

      // Store relevantData for use in upsertConversationFromMessage
      relevantUserIdsRef.current = relevantData;

      const partnerIds = [...new Set((allMessages || []).map(m => 
        m.sender_id === user.id ? m.recipient_id : m.sender_id
      ))];

      let profiles: any[] = [];
      if (partnerIds.length > 0) {
        const { data } = await supabase
          .from('profiles')
          .select('user_id, first_name, last_name, avatar_url')
          .in('user_id', partnerIds);
        profiles = data || [];
      }

      const newConvs = await buildConversations(allMessages || [], profiles, guestConvs, relevantData);
      
      setConversations(prev => {
        const newHash = hashConversations(newConvs);
        if (newHash !== lastDataHashRef.current) {
          lastDataHashRef.current = newHash;
          return newConvs;
        }
        return prev;
      });
    } catch (error) {
      // Silent fail for background refresh
    }
  }, [user, mode, buildConversations, fetchGuestConversations, fetchRelevantUserIds]);

  // Initial load with loading indicator
  const loadConversations = useCallback(async () => {
    if (!user) return;

    try {
      if (conversations.length === 0 || lastModeRef.current !== mode) {
        setLoading(true);
      }
      lastModeRef.current = mode;
      
      const [messagesResult, guestConvs, relevantData] = await Promise.all([
        supabase
          .from('messages')
          .select('*')
          .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
          .order('created_at', { ascending: false }),
        mode === 'host' ? fetchGuestConversations() : Promise.resolve([]),
        fetchRelevantUserIds()
      ]);

      const { data: allMessages, error } = messagesResult;
      if (error) throw error;
      if (!mountedRef.current) return;

      // Store relevantData for use in upsertConversationFromMessage
      relevantUserIdsRef.current = relevantData;

      const partnerIds = [...new Set((allMessages || []).map(m => 
        m.sender_id === user.id ? m.recipient_id : m.sender_id
      ))];

      let profiles: any[] = [];
      if (partnerIds.length > 0) {
        const { data } = await supabase
          .from('profiles')
          .select('user_id, first_name, last_name, avatar_url')
          .in('user_id', partnerIds);
        profiles = data || [];
      }

      const convs = await buildConversations(allMessages || [], profiles, guestConvs, relevantData);
      lastDataHashRef.current = hashConversations(convs);
      
      if (mountedRef.current) {
        setConversations(convs);
      }
    } catch (error) {
      console.error('Error loading conversations:', error);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [user, mode, buildConversations, conversations.length, fetchGuestConversations, fetchRelevantUserIds]);

  // Helpers for realtime incremental updates
  const ensureProfileLoaded = useCallback(async (partnerId: string) => {
    // Skip guest conversation IDs
    if (partnerId.startsWith('guest:')) return;
    
    if (profileCacheRef.current.has(partnerId)) return;
    
    if (partnerId === '00000000-0000-0000-0000-000000000001') {
      profileCacheRef.current.set(partnerId, { name: 'Parkzy Support', avatar_url: '/parkzy-support-avatar.png' });
      if (mountedRef.current) {
        setConversations(prev => prev.map(c => c.user_id === partnerId ? { ...c, name: 'Parkzy Support', avatar_url: '/parkzy-support-avatar.png' } : c));
      }
      return;
    }
    
    try {
      profileCacheRef.current.set(partnerId, { name: 'Unknown User' });
      const { data } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name, avatar_url')
        .eq('user_id', partnerId)
        .maybeSingle();
      if (data) {
        const name = formatDisplayName(data.first_name, data.last_name);
        profileCacheRef.current.set(partnerId, { name, avatar_url: data.avatar_url || undefined });
        if (mountedRef.current) {
          setConversations(prev => prev.map(c => c.user_id === partnerId ? { ...c, name, avatar_url: data.avatar_url || undefined } : c));
        }
      }
    } catch (e) {
      console.error('[MessagesContext] ensureProfileLoaded error:', e);
    }
  }, []);

  const upsertConversationFromMessage = useCallback((msg: Message) => {
    if (!user) return;
    const partnerId = msg.sender_id === user.id ? msg.recipient_id : msg.sender_id;

    // Filter by relevant IDs - don't add conversations that don't match current mode
    const { ids: relevantIds } = relevantUserIdsRef.current;
    if (relevantIds.size > 0 && !relevantIds.has(partnerId)) {
      return;
    }

    const { bookingsByPartner } = relevantUserIdsRef.current;
    const partnerBookings = bookingsByPartner.get(partnerId) || [];

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
        bookings: existing?.bookings || partnerBookings,
        partner_role: existing?.partner_role,
      };

      const others = prev.filter(c => c.user_id !== partnerId);
      const next = [updated, ...others];
      next.sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());
      return next;
    });

    ensureProfileLoaded(partnerId);
  }, [user, ensureProfileLoaded]);

  // Mark messages as read - updates local state IMMEDIATELY
  const markAsRead = useCallback(async (senderId: string) => {
    if (!user) return;

    // Update local state FIRST for instant UI feedback
    setConversations(prev => 
      prev.map(conv => 
        conv.user_id === senderId 
          ? { ...conv, unread_count: 0 }
          : conv
      )
    );

    // Handle guest conversations
    if (senderId.startsWith('guest:')) {
      const bookingId = senderId.replace('guest:', '');
      try {
        await supabase
          .from('guest_messages')
          .update({ read_at: new Date().toISOString() })
          .eq('booking_id', bookingId)
          .eq('sender_type', 'guest')
          .is('read_at', null);
      } catch (error) {
        console.error('Error marking guest messages as read:', error);
      }
      return;
    }

    try {
      await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('recipient_id', user.id)
        .eq('sender_id', senderId)
        .is('read_at', null);
      
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user.id)
        .eq('type', 'message')
        .eq('read', false);
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  }, [user]);

  // Reload conversations when mode changes
  useEffect(() => {
    if (!user) return;
    loadConversations();
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Set up real-time subscription
  useEffect(() => {
    if (!user) return;
    mountedRef.current = true;

    loadConversations();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && mountedRef.current) {
        silentRefresh();
      }
    };

    const handleFocus = () => {
      if (mountedRef.current) {
        silentRefresh();
      }
    };

    const handleOnline = () => {
      if (mountedRef.current) {
        silentRefresh();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);

    const channelName = `messages-broadcast-${user.id}`;
    const channel = supabase.channel(channelName);

    channel
      .on('broadcast', { event: 'new_message' }, (payload) => {
        console.log('[MessagesContext] Broadcast new_message received', payload);
        if (payload.payload?.sender_id && payload.payload?.recipient_id) {
          const msg: Message = {
            id: payload.payload.id || `temp-${Date.now()}`,
            sender_id: payload.payload.sender_id,
            recipient_id: payload.payload.recipient_id,
            message: payload.payload.message || '',
            created_at: payload.payload.created_at || new Date().toISOString(),
            read_at: null,
            delivered_at: null,
            media_url: null,
            media_type: null,
          };
          upsertConversationFromMessage(msg);
        }
        setTimeout(() => silentRefresh(), 300);
      })
      .subscribe((status, err) => {
        console.log('[MessagesContext] Broadcast channel status:', status, err || '');
      });

    const pollInterval = setInterval(() => {
      if (mountedRef.current) {
        silentRefresh();
      }
    }, 5000);

    return () => {
      mountedRef.current = false;
      clearInterval(pollInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [user, loadConversations, silentRefresh, upsertConversationFromMessage]);

  const totalUnreadCount = conversations.reduce((sum, conv) => sum + conv.unread_count, 0);

  return (
    <MessagesContext.Provider value={{
      conversations,
      loading,
      markAsRead,
      loadConversations,
      totalUnreadCount,
      upsertConversationFromMessage,
    }}>
      {children}
    </MessagesContext.Provider>
  );
};

export const useMessages = () => {
  const context = useContext(MessagesContext);
  if (!context) {
    throw new Error('useMessages must be used within a MessagesProvider');
  }
  return context;
};
