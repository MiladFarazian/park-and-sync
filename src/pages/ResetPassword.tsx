import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Loader2, CheckCircle, Lock, Check, X, Eye, EyeOff } from 'lucide-react';
import { logos } from '@/assets';
import { Card } from '@/components/ui/card';

const PasswordRequirement = ({ met, label }: { met: boolean; label: string }) => (
  <div className="flex items-center gap-2 text-sm">
    {met ? (
      <Check className="h-4 w-4 text-green-500" />
    ) : (
      <X className="h-4 w-4 text-muted-foreground" />
    )}
    <span className={met ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}>
      {label}
    </span>
  </div>
);

const ResetPassword = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const requirements = useMemo(() => ({
    minLength: password.length >= 6,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSpecial: /[!@#$%^&*(),.?":{}|<>]/.test(password),
  }), [password]);

  const strengthScore = useMemo(() => {
    return Object.values(requirements).filter(Boolean).length;
  }, [requirements]);

  const strengthLabel = useMemo(() => {
    if (strengthScore <= 1) return { text: 'Weak', color: 'bg-red-500' };
    if (strengthScore <= 2) return { text: 'Fair', color: 'bg-orange-500' };
    if (strengthScore <= 3) return { text: 'Good', color: 'bg-yellow-500' };
    if (strengthScore <= 4) return { text: 'Strong', color: 'bg-green-400' };
    return { text: 'Very Strong', color: 'bg-green-500' };
  }, [strengthScore]);

  // Check if we have a valid session from the reset link
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: "Invalid or expired link",
          description: "Please request a new password reset link.",
          variant: "destructive"
        });
        navigate('/auth');
      }
    };
    checkSession();
  }, [navigate, toast]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({
      password: password
    });

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } else {
      setSuccess(true);
      toast({
        title: "Password updated",
        description: "Your password has been successfully reset."
      });
      // Redirect to home after a short delay
      setTimeout(() => {
        navigate('/');
      }, 2000);
    }

    setLoading(false);
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md p-8 text-center space-y-6">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Password Reset Complete</h1>
            <p className="text-muted-foreground">
              Your password has been successfully updated. Redirecting you to the app...
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate('/auth')}
            className="text-foreground hover:bg-muted"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <img src={logos.primary} alt="Parkzy" className="h-8" />
          <div className="w-10" />
        </div>

        <Card className="p-8 space-y-6">
          <div className="text-center">
            <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Set New Password</h1>
            <p className="text-muted-foreground">
              Enter your new password below
            </p>
          </div>

          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 rounded-xl border-2 pr-12"
                  placeholder="Enter new password"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>

              {password && (
                <div className="space-y-3 p-3 bg-muted/50 rounded-lg mt-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Password strength:</span>
                    <span className={`font-medium ${strengthScore <= 2 ? 'text-orange-500' : 'text-green-500'}`}>
                      {strengthLabel.text}
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-300 ${strengthLabel.color}`}
                      style={{ width: `${(strengthScore / 5) * 100}%` }}
                    />
                  </div>
                  <div className="grid gap-1.5 pt-1">
                    <PasswordRequirement met={requirements.minLength} label="At least 6 characters" />
                    <PasswordRequirement met={requirements.hasUppercase} label="One uppercase letter" />
                    <PasswordRequirement met={requirements.hasLowercase} label="One lowercase letter" />
                    <PasswordRequirement met={requirements.hasNumber} label="One number" />
                    <PasswordRequirement met={requirements.hasSpecial} label="One special character" />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="h-12 rounded-xl border-2 pr-12"
                  placeholder="Confirm new password"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button 
              type="submit" 
              className="w-full h-14 text-base font-semibold rounded-xl" 
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Updating Password...
                </>
              ) : (
                'Reset Password'
              )}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default ResetPassword;
