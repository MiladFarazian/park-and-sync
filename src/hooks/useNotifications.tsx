import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { NOTIFICATION_ICON } from '@/lib/constants';
import { logger } from '@/lib/logger';

const log = logger.scope('Notifications');

interface NotificationPayload {
  title: string;
  body: string;
  tag?: string;
  icon?: string;
  url?: string;
  requireInteraction?: boolean;
}

interface ServiceWorkerNotificationData {
  url: string;
  notificationType: string | null;
  bookingId: string | null;
}

export const useNotifications = () => {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);
  const [isPushSubscribed, setIsPushSubscribed] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const channelsRef = useRef<any[]>([]);

  useEffect(() => {
    // Check if notifications are supported
    const supported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
    setIsSupported(supported);

    if (supported) {
      setPermission(Notification.permission);
      registerServiceWorker();
    }
  }, []);

  // Listen for service worker messages (notification clicks when app is open)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleServiceWorkerMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'NOTIFICATION_CLICKED') {
        const data = event.data.data as ServiceWorkerNotificationData;
        log.debug('Received notification click from SW:', data);

        // If we have a bookingId, verify the booking still exists
        if (data.bookingId && user) {
          const { data: booking, error } = await supabase
            .from('bookings')
            .select('id, status')
            .eq('id', data.bookingId)
            .single();

          if (error || !booking) {
            log.debug('Booking no longer exists, redirecting to activity');
            toast({
              title: "Booking no longer active",
              description: "This booking is no longer available",
            });
            navigate('/activity');
            return;
          }
        }

        // Navigate to the URL from the notification (service worker already navigates, but this ensures React Router state is correct)
        if (data.url) {
          navigate(data.url);
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
    };
  }, [user, navigate, toast]);

  // Check push subscription status when user changes
  useEffect(() => {
    if (user && permission === 'granted') {
      checkPushSubscription();
    }
  }, [user, permission]);

  const registerServiceWorker = async () => {
    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js');
      log.debug('Service Worker registered:', registration);
      return registration;
    } catch (error) {
      log.error('Service Worker registration failed:', error);
      return null;
    }
  };

  const checkPushSubscription = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsPushSubscribed(!!subscription);
    } catch (error) {
      log.error('Error checking push subscription:', error);
    }
  };

  const subscribeToPush = useCallback(async () => {
    if (!user) {
      log.debug('No user, skipping push subscription');
      return false;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      
      // Check for existing subscription
      let subscription = await registration.pushManager.getSubscription();
      
      if (!subscription) {
        // Get VAPID public key from edge function
        const { data: vapidData, error: vapidError } = await supabase.functions.invoke('get-vapid-public-key');
        
        if (vapidError || !vapidData?.publicKey) {
          log.error('Failed to get VAPID key:', vapidError);
          return false;
        }

        // Convert VAPID key to Uint8Array
        const vapidPublicKey = urlBase64ToUint8Array(vapidData.publicKey);

        // Create new subscription
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidPublicKey as BufferSource,
        });

        log.debug('Created new push subscription');
      }

      // Save subscription to database
      const subscriptionJson = subscription.toJSON();
      const { error: saveError } = await supabase
        .from('push_subscriptions')
        .upsert({
          user_id: user.id,
          endpoint: subscription.endpoint,
          p256dh: subscriptionJson.keys?.p256dh || '',
          auth: subscriptionJson.keys?.auth || '',
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,endpoint',
        });

      if (saveError) {
        log.error('Error saving subscription:', saveError);
        return false;
      }

      setIsPushSubscribed(true);
      log.debug('Push subscription saved successfully');
      return true;
    } catch (error) {
      log.error('Error subscribing to push:', error);
      return false;
    }
  }, [user]);

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
        // Subscribe to push notifications after permission granted
        const pushResult = await subscribeToPush();
        
        toast({
          title: "Notifications enabled",
          description: pushResult 
            ? "You'll receive alerts even when the app is closed" 
            : "You'll receive in-app notifications",
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
      log.error('Permission request failed:', error);
      return false;
    }
  }, [isSupported, toast, subscribeToPush]);

  const showNotification = useCallback(async (payload: NotificationPayload) => {
    if (!isSupported || permission !== 'granted') {
      return;
    }

    try {
      // Show browser notification
      const notification = new Notification(payload.title, {
        body: payload.body,
        icon: payload.icon || NOTIFICATION_ICON,
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
      log.error('Failed to show notification:', error);
    }
  }, [isSupported, permission]);

  const setupRealtimeListeners = useCallback(() => {
    if (!user) return;

    log.debug('Setting up realtime listeners for user:', user.id);

    // Clean up existing channels
    channelsRef.current.forEach(channel => {
      supabase.removeChannel(channel);
    });
    channelsRef.current = [];

    // Listen to notifications table for all notifications (primary source for in-app bell)
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
          log.debug('New app notification:', payload);
          
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
          log.debug('New message:', payload);
          
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

  }, [user, showNotification]);

  useEffect(() => {
    if (user && permission === 'granted') {
      setupRealtimeListeners();
      // Also try to subscribe to push if not already subscribed
      if (!isPushSubscribed) {
        subscribeToPush();
      }
    }

    return () => {
      // Clean up channels on unmount
      channelsRef.current.forEach(channel => {
        supabase.removeChannel(channel);
      });
      channelsRef.current = [];
    };
  }, [user, permission, setupRealtimeListeners, isPushSubscribed, subscribeToPush]);

  return {
    permission,
    isSupported,
    isPushSubscribed,
    requestPermission,
    showNotification,
    subscribeToPush,
  };
};

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
