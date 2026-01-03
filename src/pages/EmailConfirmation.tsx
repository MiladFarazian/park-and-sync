import { useEffect, useState, useCallback, useRef } from 'react';
import type { EmailOtpType } from '@supabase/supabase-js';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle, XCircle, Loader2, Mail, RefreshCw, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import parkzyLogo from '@/assets/parkzy-logo.png';

const sendWelcomeEmail = async (userId: string, email: string, firstName?: string) => {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('welcome_email_sent')
      .eq('user_id', userId)
      .single();

    if (profile?.welcome_email_sent) {
      console.log('Welcome email already sent');
      return;
    }

    const { error } = await supabase.functions.invoke('send-welcome-email', {
      body: { userId, email, firstName },
    });

    if (error) {
      console.error('Failed to send welcome email:', error);
      return;
    }

    await supabase
      .from('profiles')
      .update({ welcome_email_sent: true })
      .eq('user_id', userId);

    console.log('Welcome email sent successfully');
  } catch (err) {
    console.error('Error in sendWelcomeEmail:', err);
  }
};

const EmailConfirmation = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'resend'>('loading');
  const [message, setMessage] = useState('Verifying your email...');
  const [resendEmail, setResendEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const hasProcessed = useRef(false);
  
  const isResendMode = searchParams.get('resend') === 'true';
  const prefillEmail = searchParams.get('email') || '';

  const handleVerificationSuccess = useCallback(async (session: any) => {
    if (status === 'success') return; // Prevent duplicate processing
    
    setStatus('success');
    setMessage('Your email has been verified!');
    
    // Update email_verified in profile
    try {
      await supabase
        .from('profiles')
        .update({ email_verified: true })
        .eq('user_id', session.user.id);
    } catch (error) {
      console.error('Failed to update email_verified:', error);
    }
    
    // Send welcome email
    const firstName = session.user.user_metadata?.first_name;
    sendWelcomeEmail(session.user.id, session.user.email || '', firstName);
    
    // Clean up URL
    if (
      window.location.hash ||
      window.location.search.includes('code=') ||
      window.location.search.includes('token_hash=')
    ) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    
    // Redirect after showing success message
    setTimeout(() => navigate('/'), 2500);
  }, [navigate, status]);

  useEffect(() => {
    if (isResendMode) {
      setStatus('resend');
      setMessage('Request a new verification email');
      setResendEmail(prefillEmail);
      return;
    }

    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const processVerification = async () => {
      const hash = window.location.hash;
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const tokenHash = urlParams.get('token_hash');
      const otpType = (urlParams.get('type') as EmailOtpType | null) ?? null;
      
      console.log('[EmailConfirmation] Starting verification process');
      
      // FIRST: Check if user is already logged in and verified
      const { data: { session: existingSession } } = await supabase.auth.getSession();
      
      if (existingSession?.user?.email_confirmed_at) {
        console.log('[EmailConfirmation] User already verified via existing session');
        await handleVerificationSuccess(existingSession);
        return;
      }

      // If the email link landed on our app with token_hash/type, verify via verifyOtp
      if (tokenHash && otpType) {
        console.log('[EmailConfirmation] Verifying via token_hash');
        const { data, error } = await supabase.auth.verifyOtp({
          type: otpType,
          token_hash: tokenHash,
        });

        if (error) {
          console.error('[EmailConfirmation] verifyOtp failed:', error);
          setStatus('error');
          setMessage(error.message || 'This verification link has expired or was already used.');
          return;
        }

        if (data.session) {
          await handleVerificationSuccess(data.session);
          return;
        }
      }
      
      // Check for error in hash - but treat "token used" as potential success
      if (hash) {
        const hashParams = new URLSearchParams(hash.substring(1));
        const errorCode = hashParams.get('error_code');
        const errorDescription = hashParams.get('error_description');
        
        if (errorCode || errorDescription) {
          const errorMsg = errorDescription?.replace(/\+/g, ' ') || '';
          console.log('[EmailConfirmation] Hash error:', errorMsg);
          
          // Check if user is actually verified despite the error
          const { data: { session: recheckSession } } = await supabase.auth.getSession();
          if (recheckSession?.user?.email_confirmed_at) {
            console.log('[EmailConfirmation] User verified despite hash error');
            await handleVerificationSuccess(recheckSession);
            return;
          }
          
          // Show error with helpful message
          setStatus('error');
          setMessage(errorMsg || 'This verification link has expired or was already used.');
          return;
        }
        
        // Handle access_token in hash (implicit flow)
        if (hash.includes('access_token')) {
          console.log('[EmailConfirmation] Processing access token from hash');
          // Let the auth state listener handle this
          return;
        }
      }

      // Try PKCE flow if we have a code
      if (code) {
        console.log('[EmailConfirmation] Processing PKCE code exchange');
        try {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.error('[EmailConfirmation] Code exchange failed:', error);
            
            // Check again if user is verified (token might have been used already)
            const { data: { session: recheckSession } } = await supabase.auth.getSession();
            if (recheckSession?.user?.email_confirmed_at) {
              console.log('[EmailConfirmation] User verified despite code error');
              await handleVerificationSuccess(recheckSession);
              return;
            }
            
            setStatus('error');
            setMessage(error.message || 'This verification link has expired or was already used.');
            return;
          }
          
          if (data.session) {
            await handleVerificationSuccess(data.session);
            return;
          }
        } catch (err) {
          console.error('[EmailConfirmation] Code exchange error:', err);
        }
      }
      // Check for existing session one more time
      if (existingSession) {
        if (existingSession.user.email_confirmed_at) {
          await handleVerificationSuccess(existingSession);
          return;
        } else {
          // Logged in but not verified
          setStatus('resend');
          setMessage('Your email is not yet verified');
          setResendEmail(existingSession.user.email || '');
          return;
        }
      }

      // No verification data found
      if (!hash && !code && !tokenHash) {
        setStatus('error');
        setMessage('No verification link detected.');
      }
    };

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[EmailConfirmation] Auth event:', event);
      
      if (event === 'SIGNED_IN' && session?.user?.email_confirmed_at) {
        handleVerificationSuccess(session);
      }
    });

    // Process verification
    processVerification();

    // Timeout fallback - if still loading after 5 seconds, check session one more time
    const timeoutId = setTimeout(async () => {
      if (status === 'loading') {
        console.log('[EmailConfirmation] Timeout reached, checking session');
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user?.email_confirmed_at) {
          handleVerificationSuccess(session);
        } else {
          setStatus('error');
          setMessage('Verification timed out. Please try again or request a new link.');
        }
      }
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeoutId);
    };
  }, [navigate, isResendMode, prefillEmail, handleVerificationSuccess, status]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail || cooldown > 0) return;

    setSending(true);
    
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: resendEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/email-confirmation`
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
          <img src={parkzyLogo} alt="Parkzy" className="h-12" />
        </div>

        <Card className="border-border shadow-xl overflow-hidden">
          {/* Loading State */}
          {status === 'loading' && (
            <CardContent className="flex flex-col items-center py-12 px-6">
              <div className="relative">
                <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
                  <Loader2 className="h-10 w-10 text-primary animate-spin" />
                </div>
              </div>
              <h2 className="mt-6 text-xl font-semibold text-foreground">Verifying your email...</h2>
              <p className="mt-2 text-center text-muted-foreground">
                Please wait while we confirm your email address
              </p>
            </CardContent>
          )}
          
          {/* Success State */}
          {status === 'success' && (
            <CardContent className="flex flex-col items-center py-12 px-6">
              <div className="h-20 w-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center animate-in zoom-in duration-300">
                <CheckCircle className="h-12 w-12 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="mt-6 text-xl font-semibold text-foreground">Email verified!</h2>
              <p className="mt-2 text-center text-muted-foreground">
                Welcome to Parkzy! You're all set.
              </p>
              <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Redirecting you to the app...</span>
              </div>
            </CardContent>
          )}
          
          {/* Error State */}
          {status === 'error' && (
            <CardContent className="flex flex-col items-center py-12 px-6">
              <div className="h-20 w-20 rounded-full bg-destructive/10 flex items-center justify-center">
                <XCircle className="h-12 w-12 text-destructive" />
              </div>
              <h2 className="mt-6 text-xl font-semibold text-foreground">Link expired</h2>
              <p className="mt-2 text-center text-muted-foreground max-w-xs">
                {message}
              </p>
              <p className="mt-1 text-center text-sm text-muted-foreground">
                Verification links can only be used once.
              </p>
              <div className="mt-8 flex flex-col gap-3 w-full">
                <Button 
                  onClick={() => {
                    setStatus('resend');
                    setMessage('Enter your email to receive a new verification link');
                  }} 
                  className="w-full h-12"
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Request New Link
                </Button>
                <Button 
                  onClick={() => navigate('/auth')} 
                  variant="outline" 
                  className="w-full h-12"
                >
                  Sign In
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          )}

          {/* Resend State */}
          {status === 'resend' && (
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
