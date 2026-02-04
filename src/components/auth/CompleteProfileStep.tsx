import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Mail, User, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

const log = logger.scope('CompleteProfileStep');

interface CompleteProfileStepProps {
  phone?: string;
  onComplete: () => void;
}

const CompleteProfileStep: React.FC<CompleteProfileStepProps> = ({ phone = '', onComplete }) => {
  const { user, refreshProfile, profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // Pre-fill from OAuth data or existing profile
  const getInitialFormData = () => {
    // Try to get name from user metadata (OAuth providers like Apple/Google)
    const firstName = user?.user_metadata?.first_name ||
                     user?.user_metadata?.given_name ||
                     user?.user_metadata?.name?.split(' ')[0] ||
                     profile?.first_name || '';
    const lastName = user?.user_metadata?.last_name ||
                    user?.user_metadata?.family_name ||
                    (user?.user_metadata?.name?.split(' ').slice(1).join(' ')) ||
                    profile?.last_name || '';
    const fullName = firstName && lastName ? `${firstName} ${lastName}` : firstName || '';

    // Get email from user or profile
    const email = user?.email || profile?.email || '';

    return { fullName, email };
  };

  const [formData, setFormData] = useState(getInitialFormData);
  const [errors, setErrors] = useState<{ fullName?: string; email?: string }>({});
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [emailIsValid, setEmailIsValid] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced email uniqueness check
  const checkEmailExists = useCallback(async (email: string) => {
    if (!email || !validateEmail(email)) {
      setEmailIsValid(false);
      return;
    }
    
    setIsCheckingEmail(true);
    setEmailIsValid(false);
    
    try {
      // Check profiles table for existing email (excluding current user)
      const { data } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('email', email.toLowerCase().trim())
        .neq('user_id', user?.id || '')
        .maybeSingle();
      
      if (data) {
        setErrors(prev => ({ 
          ...prev, 
          email: 'This email is already associated with a Parkzy account' 
        }));
        setEmailIsValid(false);
      } else {
        // Clear email error if it was the uniqueness error
        setErrors(prev => {
          if (prev.email === 'This email is already associated with a Parkzy account') {
            return { ...prev, email: undefined };
          }
          return prev;
        });
        setEmailIsValid(true);
      }
    } catch (error) {
      log.error('Email check error:', error);
    } finally {
      setIsCheckingEmail(false);
    }
  }, [user?.id]);

  // Handle email change with debounce
  const handleEmailChange = (email: string) => {
    setFormData(prev => ({ ...prev, email }));
    setEmailIsValid(false);
    
    // Clear previous timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    // Clear uniqueness error while typing
    if (errors.email === 'This email is already associated with a Parkzy account') {
      setErrors(prev => ({ ...prev, email: undefined }));
    }
    
    // Validate format first
    if (email && !validateEmail(email)) {
      setErrors(prev => ({ ...prev, email: 'Please enter a valid email address' }));
      return;
    } else if (email) {
      setErrors(prev => ({ ...prev, email: undefined }));
    }
    
    // Debounce the uniqueness check
    debounceTimerRef.current = setTimeout(() => {
      checkEmailExists(email);
    }, 500);
  };

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const parseFullName = (fullName: string): { firstName: string; lastName: string | null } => {
    const trimmed = fullName.trim();
    const parts = trimmed.split(/\s+/);
    if (parts.length === 1) {
      return { firstName: parts[0], lastName: null };
    }
    const firstName = parts[0];
    const lastName = parts.slice(1).join(' ');
    return { firstName, lastName };
  };

  const validateForm = (): boolean => {
    const newErrors: { fullName?: string; email?: string } = {};
    
    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Full name is required';
    }
    
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!validateEmail(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    if (!user) {
      toast({
        title: 'Error',
        description: 'User session not found. Please try again.',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);

    try {
      const { firstName, lastName } = parseFullName(formData.fullName);
      
      // Update profile with upsert
      // Only set phone_verified if a phone was provided (phone OTP flow)
      const profileUpdate = {
        user_id: user.id,
        email: formData.email,
        first_name: firstName,
        last_name: lastName,
        updated_at: new Date().toISOString(),
        ...(phone ? { phone, phone_verified: true } : {})
      };


      const { error: profileError } = await supabase
        .from('profiles')
        .upsert([profileUpdate], {
          onConflict: 'user_id'
        });

      if (profileError) {
        log.error('Profile save error:', profileError);
        toast({
          title: 'Failed to save profile',
          description: profileError.message,
          variant: 'destructive'
        });
        setLoading(false);
        return;
      }


      // Also update auth email - this triggers verification email
      if (formData.email && user.email !== formData.email) {
        const { error: authError } = await supabase.auth.updateUser({
          email: formData.email
        });
        if (authError) {
          log.warn('Auth email update error:', authError);
          // Check if it's a duplicate email error from Supabase Auth
          if (authError.message.toLowerCase().includes('already registered') || 
              authError.message.toLowerCase().includes('already in use') ||
              authError.message.toLowerCase().includes('already exists')) {
            setErrors({ email: 'This email is already associated with a Parkzy account' });
            setLoading(false);
            return;
          }
          // Other errors are non-blocking - the profile email is saved
        } else {
          // Email update triggered - verification email will be sent automatically
          toast({
            title: 'Verification email sent',
            description: `Please check ${formData.email} to verify your email address.`
          });
        }
      }

      // Re-fetch profile to confirm saved
      await refreshProfile();

      toast({
        title: 'Profile saved',
        description: 'Your details have been saved successfully.'
      });

      onComplete();
    } catch (error) {
      log.error('Unexpected error:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center pb-4">
        <CardTitle className="text-xl font-bold">One more step</CardTitle>
        <CardDescription>
          We'll email your receipt and booking details.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName" className="text-sm font-medium">
              Full name <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="fullName"
                type="text"
                placeholder="John Smith"
                value={formData.fullName}
                onChange={(e) => {
                  setFormData({ ...formData, fullName: e.target.value });
                  if (errors.fullName) setErrors({ ...errors, fullName: undefined });
                }}
                className={`pl-10 h-12 rounded-xl border-2 ${errors.fullName ? 'border-destructive' : ''}`}
              />
            </div>
            {errors.fullName && (
              <p className="text-sm text-destructive">{errors.fullName}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium">
              Email address <span className="text-destructive">*</span>
              <span className="text-muted-foreground font-normal"> (for receipt)</span>
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="john@example.com"
                value={formData.email}
                onChange={(e) => handleEmailChange(e.target.value)}
                onBlur={() => {
                  // Trigger check on blur if not already checked
                  if (formData.email && validateEmail(formData.email) && !emailIsValid && !isCheckingEmail) {
                    checkEmailExists(formData.email);
                  }
                }}
                className={`pl-10 pr-10 h-12 rounded-xl border-2 ${errors.email ? 'border-destructive' : emailIsValid ? 'border-green-500' : ''}`}
              />
              {isCheckingEmail && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
              )}
              {emailIsValid && !isCheckingEmail && (
                <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
              )}
            </div>
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email}</p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full h-14 text-base font-semibold rounded-xl mt-6"
            disabled={loading || isCheckingEmail || !!errors.email}
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Continue'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default CompleteProfileStep;
