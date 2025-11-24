import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface NotificationPayload {
  title: string;
  body: string;
  tag?: string;
  icon?: string;
  url?: string;
  requireInteraction?: boolean;
}

export const useNotifications = () => {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const channelsRef = useRef<any[]>([]);

  useEffect(() => {
    // Check if notifications are supported
    const supported = 'Notification' in window && 'serviceWorker' in navigator;
    setIsSupported(supported);

    if (supported) {
      setPermission(Notification.permission);

      // Register service worker
      registerServiceWorker();
    }
  }, []);

  const registerServiceWorker = async () => {
    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js');
      console.log('[Notifications] Service Worker registered:', registration);
    } catch (error) {
      console.error('[Notifications] Service Worker registration failed:', error);
    }
  };

  const requestPermission = useCallback(async () => {
    if (!isSupported) {
      toast({
        title: "Not supported",
        description: "Notifications are not supported in this browser",
        variant: "destructive",
      });
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      
      if (result === 'granted') {
        toast({
          title: "Notifications enabled",
          description: "You'll receive alerts for bookings, messages, and updates",
        });
        return true;
      } else {
        toast({
          title: "Notifications blocked",
          description: "Enable notifications in your browser settings to receive alerts",
          variant: "destructive",
        });
        return false;
      }
    } catch (error) {
      console.error('[Notifications] Permission request failed:', error);
      return false;
    }
  }, [isSupported, toast]);

  const showNotification = useCallback(async (payload: NotificationPayload) => {
    if (!isSupported || permission !== 'granted') {
      return;
    }

    try {
      // Show browser notification
      const notification = new Notification(payload.title, {
        body: payload.body,
        icon: payload.icon || '/parkzy-logo.png',
        badge: '/favicon.png',
        tag: payload.tag || 'default',
        requireInteraction: payload.requireInteraction || false,
        data: { url: payload.url },
      });

      notification.onclick = () => {
        window.focus();
        if (payload.url) {
          window.location.href = payload.url;
        }
        notification.close();
      };
    } catch (error) {
      console.error('[Notifications] Failed to show notification:', error);
    }
  }, [isSupported, permission]);

  const setupRealtimeListeners = useCallback(() => {
    if (!user) return;

    console.log('[Notifications] Setting up realtime listeners for user:', user.id);

    // Clean up existing channels
    channelsRef.current.forEach(channel => {
      supabase.removeChannel(channel);
    });
    channelsRef.current = [];

    // Listen to bookings updates (new bookings, cancellations, etc.)
    const bookingsChannel = supabase
      .channel('bookings-notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `renter_id=eq.${user.id},host_id=eq.${user.id}`,
        },
        async (payload) => {
          console.log('[Notifications] Booking change:', payload);
          
          if (payload.eventType === 'INSERT') {
            // Fetch booking details including host_id
            const { data: booking } = await supabase
              .from('bookings')
              .select('*, spots(title, address, host_id)')
              .eq('id', payload.new.id)
              .single();

            if (booking) {
              const isHost = (booking.spots as any)?.host_id === user.id;
              showNotification({
                title: isHost ? '🎉 New Booking!' : '✅ Booking Confirmed',
                body: isHost 
                  ? `Someone booked your spot at ${(booking.spots as any)?.address}`
                  : `Your parking at ${(booking.spots as any)?.title} is confirmed`,
                tag: `booking-${booking.id}`,
                url: isHost ? `/host-booking-confirmation/${booking.id}` : `/booking-confirmation/${booking.id}`,
                requireInteraction: true,
              });
            }
          } else if (payload.eventType === 'UPDATE') {
            const oldStatus = payload.old.status;
            const newStatus = payload.new.status;
            
            if (oldStatus !== newStatus) {
              if (newStatus === 'canceled') {
                showNotification({
                  title: '❌ Booking Canceled',
                  body: 'A booking has been canceled',
                  tag: `booking-canceled-${payload.new.id}`,
                  url: `/booking/${payload.new.id}`,
                });
              } else if (newStatus === 'active') {
                showNotification({
                  title: '✅ Booking Active',
                  body: 'Your booking is now active',
                  tag: `booking-active-${payload.new.id}`,
                  url: `/booking/${payload.new.id}`,
                });
              } else if (newStatus === 'completed') {
                showNotification({
                  title: '✔️ Booking Completed',
                  body: 'Your booking has been completed',
                  tag: `booking-completed-${payload.new.id}`,
                  url: `/booking/${payload.new.id}`,
                });
              }
            }

            // Check for overstay detection
            if (!payload.old.overstay_detected_at && payload.new.overstay_detected_at) {
              const isHost = payload.new.host_id === user.id;
              showNotification({
                title: isHost ? '⚠️ Overstay Detected' : '⏰ Grace Period Started',
                body: isHost 
                  ? 'A driver has entered the grace period on your spot'
                  : 'You have 15 minutes to leave before overstay charges apply',
                tag: `overstay-${payload.new.id}`,
                url: `/booking/${payload.new.id}`,
                requireInteraction: true,
              });
            }

            // Check for overstay action
            if (!payload.old.overstay_action && payload.new.overstay_action) {
              const isHost = payload.new.host_id === user.id;
              if (payload.new.overstay_action === 'towing') {
                showNotification({
                  title: isHost ? '🚗 Tow Requested' : '🚨 TOW REQUEST',
                  body: isHost 
                    ? 'Tow request has been initiated'
                    : 'HOST HAS REQUESTED A TOW - Please vacate immediately!',
                  tag: `tow-${payload.new.id}`,
                  url: `/booking/${payload.new.id}`,
                  requireInteraction: true,
                });
              } else if (payload.new.overstay_action === 'charging') {
                showNotification({
                  title: '💳 Overtime Charges',
                  body: 'You are being charged for overtime parking',
                  tag: `charging-${payload.new.id}`,
                  url: `/booking/${payload.new.id}`,
                });
              }
            }
          }
        }
      )
      .subscribe();

    channelsRef.current.push(bookingsChannel);

    // Listen to new messages
    const messagesChannel = supabase
      .channel('messages-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `recipient_id=eq.${user.id}`,
        },
        async (payload) => {
          console.log('[Notifications] New message:', payload);
          
          // Fetch sender details
          const { data: sender } = await supabase
            .from('profiles')
            .select('first_name, last_name')
            .eq('user_id', payload.new.sender_id)
            .single();

          const senderName = sender 
            ? `${sender.first_name || ''} ${sender.last_name || ''}`.trim() || 'Someone'
            : 'Someone';

          showNotification({
            title: `💬 New message from ${senderName}`,
            body: payload.new.message.substring(0, 100),
            tag: `message-${payload.new.id}`,
            url: `/messages?userId=${payload.new.sender_id}`,
          });
        }
      )
      .subscribe();

    channelsRef.current.push(messagesChannel);

    // Listen to notifications table for general notifications
    const notificationsChannel = supabase
      .channel('app-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('[Notifications] New app notification:', payload);
          
          showNotification({
            title: payload.new.title,
            body: payload.new.message,
            tag: `notification-${payload.new.id}`,
            url: payload.new.related_id ? `/booking/${payload.new.related_id}` : '/activity',
          });
        }
      )
      .subscribe();

    channelsRef.current.push(notificationsChannel);

  }, [user, showNotification]);

  useEffect(() => {
    if (user && permission === 'granted') {
      setupRealtimeListeners();
    }

    return () => {
      // Clean up channels on unmount
      channelsRef.current.forEach(channel => {
        supabase.removeChannel(channel);
      });
      channelsRef.current = [];
    };
  }, [user, permission, setupRealtimeListeners]);

  return {
    permission,
    isSupported,
    requestPermission,
    showNotification,
  };
};
