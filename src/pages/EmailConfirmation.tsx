import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Loader2, Car } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const sendWelcomeEmail = async (userId: string, email: string, firstName?: string) => {
  try {
    // Check if welcome email was already sent
    const { data: profile } = await supabase
      .from('profiles')
      .select('welcome_email_sent')
      .eq('user_id', userId)
      .single();

    if (profile?.welcome_email_sent) {
      console.log('Welcome email already sent');
      return;
    }

    // Send welcome email
    const { error } = await supabase.functions.invoke('send-welcome-email', {
      body: { userId, email, firstName },
    });

    if (error) {
      console.error('Failed to send welcome email:', error);
      return;
    }

    // Mark welcome email as sent
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
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Confirming your email...');

  useEffect(() => {
    const hasHashFragment = window.location.hash.length > 0;
    let timeoutId: NodeJS.Timeout;

    // Set up auth state listener to detect when confirmation completes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        setStatus('success');
        setMessage('Your email has been confirmed successfully!');
        
        // Send welcome email (fire and forget)
        const firstName = session.user.user_metadata?.first_name;
        sendWelcomeEmail(session.user.id, session.user.email || '', firstName);
        
        // Redirect to home after 2 seconds
        setTimeout(() => {
          navigate('/');
        }, 2000);
      }
    });

    // If we have hash fragments, Supabase is processing the auth callback
    // Give it time to complete before showing an error
    if (hasHashFragment) {
      // If auth doesn't complete within 5 seconds, show error
      timeoutId = setTimeout(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!session) {
            setStatus('error');
            setMessage('Failed to confirm email. Please try again.');
          }
        });
      }, 5000);
    } else {
      // No hash fragments means this isn't an auth callback
      // Check if there's already an active session
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          setStatus('success');
          setMessage('Your email has been confirmed successfully!');
          setTimeout(() => navigate('/'), 2000);
        } else {
          setStatus('error');
          setMessage('No confirmation link detected. Please check your email.');
        }
      });
    }

    return () => {
      subscription.unsubscribe();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <Car className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-primary">Parkzy</h1>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle>Email Confirmation</CardTitle>
            <CardDescription>
              {status === 'loading' && 'Verifying your email address...'}
              {status === 'success' && 'Welcome to Parkzy!'}
              {status === 'error' && 'Confirmation Failed'}
            </CardDescription>
          </CardHeader>
          
          <CardContent className="flex flex-col items-center space-y-6">
            {status === 'loading' && (
              <Loader2 className="h-16 w-16 text-primary animate-spin" />
            )}
            
            {status === 'success' && (
              <CheckCircle className="h-16 w-16 text-green-500" />
            )}
            
            {status === 'error' && (
              <XCircle className="h-16 w-16 text-destructive" />
            )}
            
            <p className="text-center text-muted-foreground">
              {message}
            </p>

            {status === 'success' && (
              <p className="text-sm text-center text-muted-foreground">
                Redirecting you to the home page...
              </p>
            )}

            {status === 'error' && (
              <div className="flex flex-col gap-2 w-full">
                <Button onClick={() => navigate('/auth')} className="w-full">
                  Go to Sign In
                </Button>
                <Button onClick={() => navigate('/')} variant="outline" className="w-full">
                  Go to Home
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default EmailConfirmation;
