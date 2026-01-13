import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Mail, User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface CompleteProfileStepProps {
  phone: string;
  onComplete: () => void;
}

const CompleteProfileStep: React.FC<CompleteProfileStepProps> = ({ phone, onComplete }) => {
  const { user, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    email: ''
  });
  const [errors, setErrors] = useState<{ fullName?: string; email?: string }>({});

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
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          user_id: user.id,
          phone: phone || null,
          email: formData.email,
          first_name: firstName,
          last_name: lastName,
          phone_verified: true,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (profileError) {
        console.error('[CompleteProfile] Profile save error:', profileError);
        toast({
          title: 'Failed to save profile',
          description: profileError.message,
          variant: 'destructive'
        });
        setLoading(false);
        return;
      }


      // Also update auth email if needed
      if (formData.email && user.email !== formData.email) {
        const { error: authError } = await supabase.auth.updateUser({
          email: formData.email
        });
        if (authError) {
          console.warn('[CompleteProfile] Auth email update error:', authError);
          // Non-blocking - the profile email is saved
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
      console.error('[CompleteProfile] Unexpected error:', error);
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
                onChange={(e) => {
                  setFormData({ ...formData, email: e.target.value });
                  if (errors.email) setErrors({ ...errors, email: undefined });
                }}
                className={`pl-10 h-12 rounded-xl border-2 ${errors.email ? 'border-destructive' : ''}`}
              />
            </div>
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email}</p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full h-14 text-base font-semibold rounded-xl mt-6"
            disabled={loading}
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
