import { useEffect, useState, useCallback, useRef } from 'react';
import type { EmailOtpType } from '@supabase/supabase-js';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle, XCircle, Loader2, Mail, RefreshCw, ArrowRight, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { logos } from '@/assets';
import { logger } from '@/lib/logger';

const log = logger.scope('EmailConfirmation');

const sendWelcomeEmail = async (userId: string, email: string, firstName?: string) => {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('welcome_email_sent')
      .eq('user_id', userId)
      .single();

    if (profile?.welcome_email_sent) {
      log.debug('Welcome email already sent');
      return;
    }

    const { error } = await supabase.functions.invoke('send-welcome-email', {
      body: { userId, email, firstName },
    });

    if (error) {
      log.error('Failed to send welcome email:', error);
      return;
    }

    await supabase
      .from('profiles')
      .update({ welcome_email_sent: true })
      .eq('user_id', userId);

    log.debug('Welcome email sent successfully');
  } catch (err) {
    log.error('Error in sendWelcomeEmail:', err);
  }
};

type VerificationStage = 'checking' | 'ready' | 'verifying' | 'success' | 'error' | 'resend';

// Detect if user is on iOS (for showing "Open in App" button)
const isIOSDevice = () => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

const EmailConfirmation = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [stage, setStage] = useState<VerificationStage>('checking');
  const [errorMessage, setErrorMessage] = useState('');
  const [resendEmail, setResendEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const hasChecked = useRef(false);

  // Store token params for manual verification
  const [tokenParams, setTokenParams] = useState<{ tokenHash: string; otpType: EmailOtpType } | null>(null);

  // Store session tokens for opening the app
  const [sessionTokens, setSessionTokens] = useState<{ accessToken: string; refreshToken: string } | null>(null);

  const isResendMode = searchParams.get('resend') === 'true';
  const prefillEmail = searchParams.get('email') || '';

  const handleVerificationSuccess = useCallback(async (session: any) => {
    if (stage === 'success') return;

    setStage('success');

    // Store session tokens for opening the app (on iOS devices)
    if (session.access_token && session.refresh_token) {
      setSessionTokens({
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
      });
    }

    // Extract names from user metadata (support both naming conventions)
    const meta = session.user.user_metadata || {};
    const firstName = meta.first_name || meta.firstName || null;
    const lastName = meta.last_name || meta.lastName || null;

    try {
      // Upsert profile to ensure it exists and has correct data
      await supabase
        .from('profiles')
        .upsert({
          user_id: session.user.id,
          email: session.user.email,
          email_verified: true,
          first_name: firstName,
          last_name: lastName,
        }, {
          onConflict: 'user_id',
          ignoreDuplicates: false
        });
      log.debug('Profile upserted successfully');
    } catch (error) {
      log.error('Failed to upsert profile:', error);
    }

    sendWelcomeEmail(session.user.id, session.user.email || '', firstName);

    // Clean up URL
    if (
      window.location.hash ||
      window.location.search.includes('code=') ||
      window.location.search.includes('token_hash=')
    ) {
      window.history.replaceState({}, '', window.location.pathname);
    }

    // Only auto-redirect if NOT on iOS (iOS users need to tap "Open in App")
    if (!isIOSDevice()) {
      setTimeout(() => navigate('/'), 2500);
    }
  }, [navigate, stage]);

  // Handle the "Confirm Email" button click
  const handleConfirmClick = async () => {
    if (!tokenParams) return;
    
    setStage('verifying');
    log.debug('User clicked confirm, calling verifyOtp...');
    
    // Try verification up to 2 times
    for (let attempt = 1; attempt <= 2; attempt++) {
      const { data, error } = await supabase.auth.verifyOtp({
        type: tokenParams.otpType,
        token_hash: tokenParams.tokenHash,
      });

      if (!error && data.session) {
        log.debug('verifyOtp succeeded on attempt', attempt);
        await handleVerificationSuccess(data.session);
        return;
      }

      log.debug('verifyOtp attempt', attempt, 'failed:', error?.message);
      
      // After each failure, check if user is actually verified (scanner consumed token)
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.email_confirmed_at) {
        log.debug('User verified despite error (scanner consumed token)');
        await handleVerificationSuccess(session);
        return;
      }

      // Also try refreshing the session
      const { data: refreshData } = await supabase.auth.refreshSession();
      if (refreshData.session?.user?.email_confirmed_at) {
        log.debug('User verified after session refresh');
        await handleVerificationSuccess(refreshData.session);
        return;
      }

      if (attempt < 2) {
        // Wait a moment before retry
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    // All attempts failed - show error with retry option
    setStage('error');
    setErrorMessage('The link may have expired. Please request a new one.');
  };

  // Retry button handler for error state
  const handleRetry = async () => {
    setStage('verifying');
    
    // Check if already verified
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.email_confirmed_at) {
      await handleVerificationSuccess(session);
      return;
    }
    
    // Try refresh
    const { data: refreshData } = await supabase.auth.refreshSession();
    if (refreshData.session?.user?.email_confirmed_at) {
      await handleVerificationSuccess(refreshData.session);
      return;
    }
    
    // Still not verified
    setStage('error');
    setErrorMessage('Email not yet verified. Please request a new link.');
  };

  useEffect(() => {
    if (isResendMode) {
      setStage('resend');
      setResendEmail(prefillEmail);
      return;
    }

    if (hasChecked.current) return;
    hasChecked.current = true;

    const checkInitialState = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const tokenHash = urlParams.get('token_hash');
      const otpType = urlParams.get('type') as EmailOtpType | null;
      const code = urlParams.get('code');
      const hash = window.location.hash;
      
      log.debug('Params check - tokenHash:', !!tokenHash, 'otpType:', !!otpType, 'code:', !!code);
      
      // Check if user is already verified
      const { data: { session: existingSession } } = await supabase.auth.getSession();
      
      if (existingSession?.user?.email_confirmed_at) {
        log.debug('User already verified');
        await handleVerificationSuccess(existingSession);
        return;
      }

      // If we have token_hash and type, show "Click to Verify" button (don't auto-verify)
      if (tokenHash && otpType) {
        log.debug('Token params found, showing confirm button');
        setTokenParams({ tokenHash, otpType });
        setStage('ready');
        return;
      }

      // Handle PKCE code flow (auto-process as it's a one-time redirect)
      if (code) {
        log.debug('Processing PKCE code');
        setStage('verifying');
        
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          const { data: { session: recheckSession } } = await supabase.auth.getSession();
          if (recheckSession?.user?.email_confirmed_at) {
            await handleVerificationSuccess(recheckSession);
            return;
          }
          setStage('error');
          setErrorMessage(error.message || 'Verification failed');
          return;
        }
        
        if (data.session) {
          await handleVerificationSuccess(data.session);
          return;
        }
      }

      // Handle hash-based errors or tokens
      if (hash) {
        const hashParams = new URLSearchParams(hash.substring(1));
        const errorCode = hashParams.get('error_code');
        const errorDescription = hashParams.get('error_description');
        
        if (errorCode || errorDescription) {
          const { data: { session: recheckSession } } = await supabase.auth.getSession();
          if (recheckSession?.user?.email_confirmed_at) {
            await handleVerificationSuccess(recheckSession);
            return;
          }
          setStage('error');
          setErrorMessage(errorDescription?.replace(/\+/g, ' ') || 'Verification failed');
          return;
        }
        
        if (hash.includes('access_token')) {
          setStage('verifying');
          return;
        }
      }

      // Logged in but not verified
      if (existingSession) {
        setStage('resend');
        setResendEmail(existingSession.user.email || '');
        return;
      }

      // No verification data
      setStage('error');
      setErrorMessage('No verification link detected.');
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      log.debug('Auth event:', event);
      if (event === 'SIGNED_IN' && session?.user?.email_confirmed_at) {
        handleVerificationSuccess(session);
      }
    });

    checkInitialState();

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate, isResendMode, prefillEmail, handleVerificationSuccess, stage]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail || cooldown > 0) return;

    setSending(true);
    
    try {
      // Always use the production web URL for email redirects
      // This ensures the link works regardless of where this page is accessed from
      const redirectUrl = isIOSDevice()
        ? 'https://useparkzy.com/email-confirmation'
        : `${window.location.origin}/email-confirmation`;

      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: resendEmail,
        options: {
          emailRedirectTo: redirectUrl
        }
      });

      if (error) {
        if (error.message.toLowerCase().includes('rate') || error.message.toLowerCase().includes('too many')) {
          setCooldown(60);
          startCooldown();
          toast({
            title: "Too many requests",
            description: "Please wait before requesting another verification email",
            variant: "destructive"
          });
        } else {
          toast({
            title: "Error",
            description: error.message,
            variant: "destructive"
          });
        }
      } else {
        setCooldown(60);
        startCooldown();
        toast({
          title: "Verification email sent!",
          description: `Check ${resendEmail} for the verification link`
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to send verification email",
        variant: "destructive"
      });
    }
    
    setSending(false);
  };

  const startCooldown = () => {
    const interval = setInterval(() => {
      setCooldown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <img src={logos.primary} alt="Parkzy" className="h-12" />
        </div>

        <Card className="border-border shadow-xl overflow-hidden">
          {/* Checking State */}
          {stage === 'checking' && (
            <CardContent className="flex flex-col items-center py-12 px-6">
              <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
                <Loader2 className="h-10 w-10 text-primary animate-spin" />
              </div>
              <h2 className="mt-6 text-xl font-semibold text-foreground">Loading...</h2>
              <p className="mt-2 text-center text-muted-foreground">
                Please wait a moment
              </p>
            </CardContent>
          )}

          {/* Ready State - Click to Verify */}
          {stage === 'ready' && (
            <CardContent className="flex flex-col items-center py-12 px-6">
              <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
                <ShieldCheck className="h-10 w-10 text-primary" />
              </div>
              <h2 className="mt-6 text-xl font-semibold text-foreground">Confirm your email</h2>
              <p className="mt-2 text-center text-muted-foreground">
                Tap the button below to complete verification
              </p>
              <Button 
                onClick={handleConfirmClick}
                className="w-full h-12 mt-8"
                size="lg"
              >
                <CheckCircle className="h-5 w-5 mr-2" />
                Confirm My Email
              </Button>
              <p className="mt-4 text-xs text-center text-muted-foreground">
                This extra step prevents email scanners from using your link
              </p>
            </CardContent>
          )}

          {/* Verifying State */}
          {stage === 'verifying' && (
            <CardContent className="flex flex-col items-center py-12 px-6">
              <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
                <Loader2 className="h-10 w-10 text-primary animate-spin" />
              </div>
              <h2 className="mt-6 text-xl font-semibold text-foreground">Verifying your email...</h2>
              <p className="mt-2 text-center text-muted-foreground">
                Please wait while we confirm your email address
              </p>
            </CardContent>
          )}
          
          {/* Success State */}
          {stage === 'success' && (
            <CardContent className="flex flex-col items-center py-12 px-6">
              <div className="h-20 w-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center animate-in zoom-in duration-300">
                <CheckCircle className="h-12 w-12 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="mt-6 text-xl font-semibold text-foreground">Email verified!</h2>
              <p className="mt-2 text-center text-muted-foreground">
                Welcome to Parkzy! You're all set.
              </p>

              {/* iOS: Show "Open in App" button */}
              {isIOSDevice() && sessionTokens ? (
                <div className="mt-6 w-full space-y-3">
                  <a
                    href={`parkzy://email-confirmation#access_token=${sessionTokens.accessToken}&refresh_token=${sessionTokens.refreshToken}`}
                    className="flex items-center justify-center w-full h-12 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors"
                  >
                    <ArrowRight className="h-5 w-5 mr-2" />
                    Open in Parkzy App
                  </a>
                  <Button
                    variant="ghost"
                    onClick={() => navigate('/')}
                    className="w-full h-10 text-muted-foreground"
                  >
                    Continue in browser
                  </Button>
                </div>
              ) : (
                <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Redirecting you to the app...</span>
                </div>
              )}
            </CardContent>
          )}
          
          {/* Error State */}
          {stage === 'error' && (
            <CardContent className="flex flex-col items-center py-12 px-6">
              <div className="h-20 w-20 rounded-full bg-destructive/10 flex items-center justify-center">
                <XCircle className="h-12 w-12 text-destructive" />
              </div>
              <h2 className="mt-6 text-xl font-semibold text-foreground">Link may have been used</h2>
              <p className="mt-2 text-center text-muted-foreground max-w-xs">
                Some email apps automatically open links for security scanning, which can use up verification links.
              </p>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                {errorMessage}
              </p>
              <div className="mt-8 flex flex-col gap-3 w-full">
                <Button 
                  onClick={handleRetry}
                  variant="outline"
                  className="w-full h-12"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Check Again
                </Button>
                <Button 
                  onClick={() => {
                    setStage('resend');
                  }} 
                  className="w-full h-12"
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Request New Link
                </Button>
                <Button 
                  onClick={() => navigate('/auth')} 
                  variant="ghost" 
                  className="w-full h-12 text-muted-foreground"
                >
                  Back to Sign In
                </Button>
              </div>
            </CardContent>
          )}

          {/* Resend State */}
          {stage === 'resend' && (
            <CardContent className="py-8 px-6">
              <div className="text-center mb-6">
                <div className="h-16 w-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Mail className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-xl font-semibold text-foreground">Verify your email</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Enter your email to receive a new verification link
                </p>
              </div>
              
              <form onSubmit={handleResend} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="h-12"
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full h-12"
                  disabled={sending || cooldown > 0 || !resendEmail}
                >
                  {sending ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : cooldown > 0 ? (
                    `Resend in ${cooldown}s`
                  ) : (
                    <>
                      <Mail className="h-4 w-4 mr-2" />
                      Send Verification Email
                    </>
                  )}
                </Button>
                <div className="text-center pt-2">
                  <Button 
                    variant="ghost" 
                    onClick={() => navigate('/auth')}
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Back to Sign In
                  </Button>
                </div>
              </form>
            </CardContent>
          )}
        </Card>
        
        <p className="text-center text-xs text-muted-foreground">
          Having trouble? Contact{' '}
          <a href="mailto:support@parkzy.app" className="text-primary hover:underline">
            support@parkzy.app
          </a>
        </p>
      </div>
    </div>
  );
};

export default EmailConfirmation;
