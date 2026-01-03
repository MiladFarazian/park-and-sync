import { ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mail, Loader2, ShieldCheck } from 'lucide-react';
import RequireAuth from './RequireAuth';

interface RequireVerifiedAuthProps {
  children: ReactNode;
  feature?: 'booking' | 'messages' | 'payments' | 'vehicles';
}

const RequireVerifiedAuth = ({ children, feature }: RequireVerifiedAuthProps) => {
  const { user, isEmailVerified, loading, resendVerificationEmail } = useAuth();

  // If not logged in, show the RequireAuth component
  if (!user) {
    return <RequireAuth feature={feature}>{children}</RequireAuth>;
  }

  // Show loading state
  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Phone-only users without email are considered verified for email purposes
  // (they verify via OTP)
  const hasEmail = user.email || false;
  
  // If user has no email (phone-only auth), allow access
  if (!hasEmail) {
    return <>{children}</>;
  }

  // If email is verified, allow access
  if (isEmailVerified) {
    return <>{children}</>;
  }

  const featureLabels: Record<string, string> = {
    booking: 'booking parking spots',
    messages: 'your messages',
    payments: 'payment methods',
    vehicles: 'managing vehicles',
  };
  const featureLabel = feature ? featureLabels[feature] : 'this feature';

  // Email not verified - show verification required message
  return (
    <div className="flex justify-center items-center min-h-[60vh] p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-4">
            <Mail className="h-8 w-8 text-amber-600 dark:text-amber-400" />
          </div>
          <CardTitle className="text-xl">Email Verification Required</CardTitle>
          <CardDescription className="text-base">
            Please verify your email address to access {featureLabel}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center text-sm text-muted-foreground">
            <p>We sent a verification email to:</p>
            <p className="font-medium text-foreground mt-1">{user.email}</p>
          </div>
          
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              <p className="text-sm text-muted-foreground">
                Check your inbox and spam folder for the verification link
              </p>
            </div>
          </div>

          <Button 
            onClick={resendVerificationEmail} 
            variant="outline" 
            className="w-full"
          >
            <Mail className="h-4 w-4 mr-2" />
            Resend Verification Email
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default RequireVerifiedAuth;
