import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle, XCircle, Loader2, Mail, RefreshCw } from 'lucide-react';
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
  const [message, setMessage] = useState('Confirming your email...');
  const [resendEmail, setResendEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  
  const isResendMode = searchParams.get('resend') === 'true';
  const prefillEmail = searchParams.get('email') || '';

  const handleVerificationSuccess = useCallback(async (session: any) => {
    setStatus('success');
    setMessage('Your email has been verified successfully!');
    
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
    if (window.location.hash || window.location.search.includes('code=')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    
    // Redirect after showing success message
    setTimeout(() => navigate('/'), 2500);
  }, [navigate]);

  useEffect(() => {
    if (isResendMode) {
      setStatus('resend');
      setMessage('Request a new verification email');
      setResendEmail(prefillEmail);
      return;
    }

    const processVerification = async () => {
      const hash = window.location.hash;
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      
      // Check for error in hash
      if (hash) {
        const hashParams = new URLSearchParams(hash.substring(1));
        const errorCode = hashParams.get('error_code');
        const errorDescription = hashParams.get('error_description');
        
        if (errorCode || errorDescription) {
          setStatus('error');
          setMessage(errorDescription?.replace(/\+/g, ' ') || 'Email confirmation failed');
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
            setStatus('error');
            setMessage(error.message || 'Failed to verify email. The link may have expired.');
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

      // Check for existing session - user might already be verified
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        if (session.user.email_confirmed_at) {
          await handleVerificationSuccess(session);
          return;
        } else {
          // Logged in but not verified
          setStatus('resend');
          setMessage('Your email is not yet verified');
          setResendEmail(session.user.email || '');
          return;
        }
      }

      // If we have a hash but no session yet, wait for auth state change
      if (hash && hash.includes('access_token')) {
        console.log('[EmailConfirmation] Waiting for auth state change from hash');
        // The auth state listener will handle this
        return;
      }

      // No verification data found
      if (!hash && !code) {
        setStatus('error');
        setMessage('No verification link detected. Please check your email or request a new link.');
      }
    };

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[EmailConfirmation] Auth event:', event);
      
      if (event === 'SIGNED_IN' && session) {
        handleVerificationSuccess(session);
      }
    });

    // Process verification
    processVerification();

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate, isResendMode, prefillEmail, handleVerificationSuccess]);

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
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-center gap-2 mb-8">
          <img src={parkzyLogo} alt="Parkzy" className="h-10" />
        </div>

        <Card className="border-border shadow-lg">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">
              {status === 'loading' && 'Verifying Email'}
              {status === 'success' && 'Email Verified!'}
              {status === 'error' && 'Verification Failed'}
              {status === 'resend' && 'Resend Verification'}
            </CardTitle>
            <CardDescription>
              {status === 'loading' && 'Please wait while we verify your email...'}
              {status === 'success' && 'Welcome to Parkzy!'}
              {status === 'error' && 'Something went wrong'}
              {status === 'resend' && 'Enter your email to receive a new verification link'}
            </CardDescription>
          </CardHeader>
          
          <CardContent className="flex flex-col items-center space-y-6">
            {status === 'loading' && (
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-16 w-16 text-primary animate-spin" />
                <p className="text-center text-muted-foreground">{message}</p>
              </div>
            )}
            
            {status === 'success' && (
              <div className="flex flex-col items-center gap-4">
                <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle className="h-10 w-10 text-green-600" />
                </div>
                <p className="text-center text-foreground font-medium">{message}</p>
                <p className="text-sm text-center text-muted-foreground">
                  Redirecting you to the app...
                </p>
              </div>
            )}
            
            {status === 'error' && (
              <div className="flex flex-col items-center gap-4 w-full">
                <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
                  <XCircle className="h-10 w-10 text-destructive" />
                </div>
                <p className="text-center text-foreground">{message}</p>
                <div className="flex flex-col gap-2 w-full mt-2">
                  <Button 
                    onClick={() => {
                      setStatus('resend');
                      setMessage('Enter your email to receive a new verification link');
                    }} 
                    className="w-full"
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Request New Link
                  </Button>
                  <Button onClick={() => navigate('/auth')} variant="outline" className="w-full">
                    Go to Sign In
                  </Button>
                </div>
              </div>
            )}

            {status === 'resend' && (
              <form onSubmit={handleResend} className="w-full space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    placeholder="Enter your email"
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
                <div className="text-center">
                  <Button 
                    variant="link" 
                    onClick={() => navigate('/auth')}
                    type="button"
                  >
                    Back to Sign In
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
        
        <p className="text-center text-xs text-muted-foreground">
          Having trouble? Contact support@parkzy.app
        </p>
      </div>
    </div>
  );
};

export default EmailConfirmation;
