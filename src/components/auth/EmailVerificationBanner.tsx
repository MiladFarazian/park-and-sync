import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Mail, RefreshCw, X, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

interface EmailVerificationBannerProps {
  className?: string;
  onDismiss?: () => void;
  showDismiss?: boolean;
}

const EmailVerificationBanner = ({ 
  className = '', 
  onDismiss,
  showDismiss = false
}: EmailVerificationBannerProps) => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Don't show if no user, or if email is verified, or if user signed up with phone only
  if (!user || profile?.email_verified) return null;
  
  // Don't show for phone-only users who haven't added an email yet
  if (!user.email && !profile?.email) return null;

  const handleResend = async () => {
    if (cooldown > 0 || sending) return;
    
    const email = user.email || profile?.email;
    if (!email) return;

    setSending(true);
    
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
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
        setSent(true);
        setCooldown(60);
        startCooldown();
        toast({
          title: "Verification email sent",
          description: `Check ${email} for the verification link`
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

  const email = user.email || profile?.email;

  return (
    <Alert className={`border-warning bg-warning/10 ${className}`}>
      <Mail className="h-4 w-4 text-warning" />
      <AlertDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex-1">
          <span className="font-medium text-foreground">Verify your email</span>
          <p className="text-sm text-muted-foreground mt-0.5">
            {sent ? (
              <span className="flex items-center gap-1 text-green-600">
                <CheckCircle className="h-3.5 w-3.5" />
                Verification email sent to {email}
              </span>
            ) : (
              <>Please verify {email} to access all features</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleResend}
            disabled={sending || cooldown > 0}
            className="shrink-0"
          >
            {sending ? (
              <>
                <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" />
                Sending...
              </>
            ) : cooldown > 0 ? (
              `Resend in ${cooldown}s`
            ) : sent ? (
              'Resend again'
            ) : (
              'Resend email'
            )}
          </Button>
          {showDismiss && onDismiss && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onDismiss}
              className="h-8 w-8 shrink-0"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
};

export default EmailVerificationBanner;
