import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Loader2, Car } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const EmailConfirmation = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Confirming your email...');

  useEffect(() => {
    const confirmEmail = async () => {
      try {
        // Check if there's a session (email confirmation creates a session)
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          setStatus('error');
          setMessage('Failed to confirm email. Please try again.');
          return;
        }

        if (session) {
          setStatus('success');
          setMessage('Your email has been confirmed successfully!');
          
          // Redirect to home after 2 seconds
          setTimeout(() => {
            navigate('/');
          }, 2000);
        } else {
          setStatus('error');
          setMessage('No confirmation session found. Please check your email link.');
        }
      } catch (err) {
        setStatus('error');
        setMessage('An unexpected error occurred. Please try again.');
      }
    };

    confirmEmail();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <Car className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-primary">Parkway</h1>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle>Email Confirmation</CardTitle>
            <CardDescription>
              {status === 'loading' && 'Verifying your email address...'}
              {status === 'success' && 'Welcome to Parkway!'}
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
