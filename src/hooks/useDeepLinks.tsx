import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App, URLOpenListenerEvent } from '@capacitor/app';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { logger } from '@/lib/logger';

const log = logger.scope('DeepLinks');

/**
 * Hook to handle deep links for the iOS app
 * Processes auth callbacks (email verification, password reset, etc.)
 * and navigates to the appropriate route
 */
export const useDeepLinks = () => {
  const navigate = useNavigate();
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    if (!isNative) {
      log.debug('Not a native platform, skipping deep link setup');
      return;
    }

    const handleUrlOpen = async (event: URLOpenListenerEvent) => {
      log.info('Deep link received:', event.url);

      try {
        const url = new URL(event.url);
        const path = url.pathname || url.host; // parkzy://email-confirmation -> host = email-confirmation

        // Extract query parameters
        const params = new URLSearchParams(url.search);

        // Also parse hash fragment (Supabase puts tokens there after redirect)
        // e.g., parkzy://email-confirmation#access_token=xxx&refresh_token=xxx
        const hashParams = new URLSearchParams(url.hash.replace('#', ''));

        // Check both query params and hash fragment for tokens
        const tokenHash = params.get('token_hash') || hashParams.get('token_hash');
        const type = params.get('type') || hashParams.get('type');
        const accessToken = params.get('access_token') || hashParams.get('access_token');
        const refreshToken = params.get('refresh_token') || hashParams.get('refresh_token');

        log.debug('Parsed deep link:', { path, tokenHash, type, accessToken: !!accessToken, refreshToken: !!refreshToken });

        // Handle Supabase auth callbacks
        // Check for session tokens FIRST (this is what Supabase sends after email verification redirect)
        if (accessToken && refreshToken) {
          log.info('Processing auth callback with session tokens');
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            log.error('Session setup failed:', error);
            navigate('/auth?error=verification_failed');
          } else {
            log.info('Session setup successful - user is now logged in');
            // Navigate to home or email confirmation success page
            navigate('/');
          }
        } else if (tokenHash && type) {
          // Handle token_hash flow (manual OTP verification)
          log.info('Processing auth callback with token_hash:', { type });

          if (type === 'email' || type === 'signup' || type === 'email_change') {
            // Email verification
            const { data, error } = await supabase.auth.verifyOtp({
              token_hash: tokenHash,
              type: type === 'email_change' ? 'email_change' : 'email',
            });

            if (error) {
              log.error('Email verification failed:', error);
              navigate('/auth?error=verification_failed');
            } else {
              log.info('Email verification successful');
              navigate('/');
            }
          } else if (type === 'recovery') {
            // Password reset
            const { error } = await supabase.auth.verifyOtp({
              token_hash: tokenHash,
              type: 'recovery',
            });

            if (error) {
              log.error('Password reset verification failed:', error);
              navigate('/auth?error=reset_failed');
            } else {
              log.info('Password reset verification successful');
              navigate('/reset-password');
            }
          } else if (type === 'magiclink') {
            // Magic link login
            const { error } = await supabase.auth.verifyOtp({
              token_hash: tokenHash,
              type: 'magiclink',
            });

            if (error) {
              log.error('Magic link verification failed:', error);
              navigate('/auth?error=login_failed');
            } else {
              log.info('Magic link login successful');
              navigate('/');
            }
          }
        } else {
          // Regular deep link navigation
          const pathName = path.startsWith('/') ? path : `/${path}`;
          log.debug('Navigating to:', pathName + url.search);
          navigate(pathName + url.search);
        }
      } catch (error) {
        log.error('Error handling deep link:', error);
        navigate('/');
      }
    };

    // Listen for app URL open events
    const listener = App.addListener('appUrlOpen', handleUrlOpen);

    // Cleanup listener on unmount
    return () => {
      listener.then(l => l.remove());
    };
  }, [isNative, navigate]);
};

export default useDeepLinks;
