import { useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { logger } from '@/lib/logger';

const log = logger.scope('NativePush');

interface PushNotificationData {
  type?: string;
  bookingId?: string;
  url?: string;
  [key: string]: string | undefined;
}

export const useNativePush = () => {
  const [permission, setPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [isRegistered, setIsRegistered] = useState(false);
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();
  const isNative = Capacitor.isNativePlatform();
  const registrationInProgress = useRef(false);

  // Check if we're on a native platform
  useEffect(() => {
    if (!isNative) {
      log.debug('Not a native platform, skipping native push setup');
      return;
    }

    // Check current permission status
    checkPermissions();
  }, [isNative]);

  // Setup push notification listeners
  useEffect(() => {
    if (!isNative) return;

    // Registration success - save token
    const registrationListener = PushNotifications.addListener('registration', async (token: Token) => {
      log.info('Push registration success, token:', token.value);
      setDeviceToken(token.value);
      setIsRegistered(true);

      // Save token to database
      if (user) {
        await saveDeviceToken(token.value);
      }
    });

    // Registration error
    const registrationErrorListener = PushNotifications.addListener('registrationError', (error) => {
      log.error('Push registration error:', error);
      setIsRegistered(false);
    });

    // Notification received while app is in foreground
    const pushReceivedListener = PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
      log.debug('Push notification received:', notification);
      // The OS will handle displaying the notification via AppDelegate
      // We can optionally show an in-app toast here
    });

    // Notification tapped
    const pushActionListener = PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
      log.debug('Push notification action performed:', action);

      const data = action.notification.data as PushNotificationData;

      // Navigate based on notification data
      if (data?.bookingId) {
        navigate(`/booking/${data.bookingId}`);
      } else if (data?.url) {
        navigate(data.url);
      } else if (data?.type === 'booking_request') {
        navigate('/activity');
      }
    });

    // Cleanup listeners on unmount
    return () => {
      registrationListener.then(l => l.remove());
      registrationErrorListener.then(l => l.remove());
      pushReceivedListener.then(l => l.remove());
      pushActionListener.then(l => l.remove());
    };
  }, [isNative, user, navigate]);

  // When user logs in, request permission and register
  useEffect(() => {
    if (!isNative || !user) return;

    const initializePush = async () => {
      if (deviceToken) {
        // If we already have a token, just save it for the new user
        saveDeviceToken(deviceToken);
      } else if (permission === 'granted' && !isRegistered) {
        // If permission was previously granted but not registered, try to register
        registerForPushNotifications();
      } else if (permission === 'prompt') {
        // Auto-request permission when user is logged in and we haven't asked yet
        log.info('Auto-requesting push notification permission for logged-in user');
        const result = await PushNotifications.requestPermissions();
        log.debug('Permission request result:', result.receive);

        if (result.receive === 'granted') {
          setPermission('granted');
          await registerForPushNotifications();
        } else if (result.receive === 'denied') {
          setPermission('denied');
        }
      }
    };

    initializePush();
  }, [user, isNative, deviceToken, permission, isRegistered]);

  const checkPermissions = async () => {
    try {
      const permissionStatus = await PushNotifications.checkPermissions();
      log.debug('Push permission status:', permissionStatus.receive);

      if (permissionStatus.receive === 'granted') {
        setPermission('granted');
      } else if (permissionStatus.receive === 'denied') {
        setPermission('denied');
      } else {
        setPermission('prompt');
      }

      return permissionStatus.receive;
    } catch (error) {
      log.error('Error checking push permissions:', error);
      return 'prompt';
    }
  };

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isNative) {
      log.debug('Not native platform, cannot request native push permission');
      return false;
    }

    try {
      const permissionStatus = await PushNotifications.requestPermissions();
      log.debug('Push permission request result:', permissionStatus.receive);

      if (permissionStatus.receive === 'granted') {
        setPermission('granted');
        // Register for push notifications after permission granted
        await registerForPushNotifications();
        return true;
      } else {
        setPermission('denied');
        return false;
      }
    } catch (error) {
      log.error('Error requesting push permissions:', error);
      return false;
    }
  }, [isNative]);

  const registerForPushNotifications = async () => {
    if (!isNative || registrationInProgress.current) return;

    registrationInProgress.current = true;

    try {
      log.debug('Registering for push notifications...');
      await PushNotifications.register();
    } catch (error) {
      log.error('Error registering for push notifications:', error);
    } finally {
      registrationInProgress.current = false;
    }
  };

  const saveDeviceToken = async (token: string) => {
    if (!user || !token) {
      log.debug('No user or token, skipping save');
      return false;
    }

    try {
      const platform = Capacitor.getPlatform(); // 'ios' or 'android'

      log.debug('Saving device token for platform:', platform);

      const { error } = await supabase
        .from('device_tokens')
        .upsert({
          user_id: user.id,
          token: token,
          platform: platform,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,token',
        });

      if (error) {
        log.error('Error saving device token:', error);
        return false;
      }

      log.info('Device token saved successfully');
      return true;
    } catch (error) {
      log.error('Error saving device token:', error);
      return false;
    }
  };

  const removeDeviceToken = async () => {
    if (!user || !deviceToken) return;

    try {
      const { error } = await supabase
        .from('device_tokens')
        .delete()
        .eq('user_id', user.id)
        .eq('token', deviceToken);

      if (error) {
        log.error('Error removing device token:', error);
      } else {
        log.info('Device token removed');
        setDeviceToken(null);
        setIsRegistered(false);
      }
    } catch (error) {
      log.error('Error removing device token:', error);
    }
  };

  return {
    isNative,
    permission,
    isRegistered,
    deviceToken,
    requestPermission,
    removeDeviceToken,
  };
};

export default useNativePush;
