import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft, Phone, Mail, Loader2, Car, MapPin, Shield } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import parkzyLogo from '@/assets/parkzy-logo-white.png';
import parkzyLogoDark from '@/assets/parkzy-logo.png';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const REMEMBER_ME_KEY = 'parkzy_remember_me';

type AuthMethod = 'phone' | 'email';

const COUNTRY_CODES = [
  { code: '+1', country: 'US', flag: '🇺🇸' },
  { code: '+1', country: 'CA', flag: '🇨🇦' },
  { code: '+44', country: 'UK', flag: '🇬🇧' },
  { code: '+61', country: 'AU', flag: '🇦🇺' },
  { code: '+49', country: 'DE', flag: '🇩🇪' },
  { code: '+33', country: 'FR', flag: '🇫🇷' },
  { code: '+81', country: 'JP', flag: '🇯🇵' },
  { code: '+52', country: 'MX', flag: '🇲🇽' },
  { code: '+91', country: 'IN', flag: '🇮🇳' },
];

// Format phone number as user types: (555) 123-4567
const formatPhoneNumber = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 0) return '';
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
};

// Validate phone number has 10 digits
const isValidPhoneNumber = (phone: string): boolean => {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10;
};

const Auth = () => {
  const navigate = useNavigate();
  const { signIn, signUp } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [authMethod, setAuthMethod] = useState<AuthMethod>('phone');
  const [otpSent, setOtpSent] = useState(false);
  const [countryCode, setCountryCode] = useState('+1');
  const [rememberMe, setRememberMe] = useState(true);
  const [termsOpen, setTermsOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [forgotPasswordSent, setForgotPasswordSent] = useState(false);
  const [resetAttempts, setResetAttempts] = useState(0);
  const [resetCooldown, setResetCooldown] = useState(0);
  
  const [phoneData, setPhoneData] = useState({
    phone: '',
    otp: ''
  });
  
  const [signInData, setSignInData] = useState({
    email: '',
    password: ''
  });
  
  const [signUpData, setSignUpData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: ''
  });

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setPhoneData({ ...phoneData, phone: formatted });
  };

  const getFullPhoneNumber = (): string => {
    const digits = phoneData.phone.replace(/\D/g, '');
    return `${countryCode}${digits}`;
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneData.phone) return;
    
    if (!isValidPhoneNumber(phoneData.phone)) {
      toast({
        title: "Invalid Phone Number",
        description: "Please enter a valid 10-digit phone number",
        variant: "destructive"
      });
      return;
    }
    
    setLoading(true);
    const formattedPhone = getFullPhoneNumber();
    
    const { error } = await supabase.auth.signInWithOtp({
      phone: formattedPhone
    });
    
    if (error) {
      // Provide user-friendly error messages
      let errorMessage = error.message;
      if (error.message.includes('Invalid From')) {
        errorMessage = 'Phone authentication is temporarily unavailable. Please try email sign-in or contact support.';
      } else if (error.message.includes('rate limit')) {
        errorMessage = 'Too many attempts. Please wait a few minutes and try again.';
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    } else {
      setOtpSent(true);
      toast({
        title: "Code Sent",
        description: `Check your phone (${formattedPhone}) for the verification code`
      });
    }
    setLoading(false);
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    const formattedPhone = getFullPhoneNumber();
    
    const { error } = await supabase.auth.verifyOtp({
      phone: formattedPhone,
      token: phoneData.otp,
      type: 'sms'
    });
    
    if (error) {
      let errorMessage = error.message;
      if (error.message.includes('invalid') || error.message.includes('expired')) {
        errorMessage = 'Invalid or expired code. Please request a new one.';
      }
      
      toast({
        title: "Verification Failed",
        description: errorMessage,
        variant: "destructive"
      });
    } else {
      navigate('/');
    }
    setLoading(false);
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`
      }
    });
    
    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
    setLoading(false);
  };

  const handleAppleSignIn = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: `${window.location.origin}/`
      }
    });
    
    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
    setLoading(false);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    // Store remember me preference
    if (rememberMe) {
      localStorage.setItem(REMEMBER_ME_KEY, 'true');
    } else {
      localStorage.removeItem(REMEMBER_ME_KEY);
      // Set up session cleanup on browser close
      sessionStorage.setItem('parkzy_session_only', 'true');
    }
    
    const { error } = await signIn(signInData.email, signInData.password);
    if (!error) {
      navigate('/');
    }
    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signUp(signUpData.email, signUpData.password, signUpData.firstName, signUpData.lastName);
    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotPasswordEmail) return;
    
    // Check if user is in cooldown
    if (resetCooldown > 0) {
      toast({
        title: "Please wait",
        description: `You can request another reset link in ${resetCooldown} seconds`,
        variant: "destructive"
      });
      return;
    }
    
    setLoading(true);
    
    const { error } = await supabase.auth.resetPasswordForEmail(forgotPasswordEmail, {
      redirectTo: `${window.location.origin}/reset-password`
    });
    
    if (error) {
      // Check for rate limit error from Supabase
      if (error.message.toLowerCase().includes('rate') || error.message.toLowerCase().includes('too many')) {
        setResetCooldown(60);
        const interval = setInterval(() => {
          setResetCooldown(prev => {
            if (prev <= 1) {
              clearInterval(interval);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
        
        toast({
          title: "Too many requests",
          description: "Please wait 60 seconds before requesting another reset link",
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
      setForgotPasswordSent(true);
      setResetAttempts(prev => prev + 1);
      
      // Start cooldown after successful request (30 seconds between requests)
      setResetCooldown(30);
      const interval = setInterval(() => {
        setResetCooldown(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      toast({
        title: "Reset link sent",
        description: "Check your email for the password reset link"
      });
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Branding (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary via-primary/90 to-primary/80 relative overflow-hidden">
        {/* Animated gradient overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.05)_50%,transparent_75%)] bg-[length:400%_400%] animate-[gradient-shift_8s_ease-in-out_infinite]" />
        
        {/* Floating orbs */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-[10%] left-[15%] w-64 h-64 bg-white/10 rounded-full blur-3xl animate-[float_12s_ease-in-out_infinite]" />
          <div className="absolute top-[60%] left-[60%] w-80 h-80 bg-white/8 rounded-full blur-3xl animate-[float_15s_ease-in-out_infinite_reverse]" />
          <div className="absolute top-[30%] right-[10%] w-48 h-48 bg-white/12 rounded-full blur-2xl animate-[float_10s_ease-in-out_infinite_2s]" />
          <div className="absolute bottom-[20%] left-[5%] w-56 h-56 bg-white/6 rounded-full blur-3xl animate-[float_14s_ease-in-out_infinite_1s]" />
        </div>
        
        {/* Grid pattern overlay */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }} />
        
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Logo */}
          <div>
            <img src={parkzyLogo} alt="Parkzy" className="h-12" />
          </div>
          
          {/* Main content */}
          <div className="space-y-8">
            <div>
              <h1 className="text-4xl font-bold text-white mb-4">
                Find parking in seconds,<br />not hours
              </h1>
              <p className="text-white/80 text-lg max-w-md">
                Join thousands of drivers who save time and money by booking parking spots from local hosts.
              </p>
            </div>
            
            {/* Features */}
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                  <MapPin className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="text-white font-medium">Find spots nearby</p>
                  <p className="text-white/70 text-sm">Search thousands of available spots</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                  <Car className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="text-white font-medium">Book instantly</p>
                  <p className="text-white/70 text-sm">Reserve your spot in just a few taps</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                  <Shield className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="text-white font-medium">Park with confidence</p>
                  <p className="text-white/70 text-sm">Secure payments & verified hosts</p>
                </div>
              </div>
            </div>
          </div>
          
          {/* Footer */}
          <p className="text-white/60 text-sm">
            © 2025 Parkzy. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right Panel - Auth Form */}
      <div className="w-full lg:w-1/2 flex flex-col min-h-screen bg-background">
        {/* Mobile Header */}
        <div className="flex items-center justify-between p-4 lg:p-8">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate('/')}
            className="text-foreground hover:bg-muted"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <img src={parkzyLogoDark} alt="Parkzy" className="h-8 lg:hidden" />
          <div className="w-10" />
        </div>

        {/* Form Container */}
        <div className="flex-1 flex items-center justify-center px-6 py-8 lg:px-16">
          <div className="w-full max-w-md space-y-8">
            {/* Header */}
            <div className="text-center lg:text-left">
              <h1 className="text-2xl lg:text-3xl font-bold text-foreground mb-2">Welcome to Parkzy</h1>
              <p className="text-muted-foreground">
                Find and share parking spots instantly
              </p>
            </div>
            
            <div className="space-y-5">
              {/* Phone Auth - Primary */}
              {authMethod === 'phone' && (
                <div className="space-y-4">
                  {!otpSent ? (
                    <form onSubmit={handleSendOtp} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="phone" className="text-sm font-medium">Phone Number</Label>
                        <div className="flex gap-2">
                          <Select value={countryCode} onValueChange={setCountryCode}>
                            <SelectTrigger className="w-[100px] h-14 rounded-xl border-2">
                              <SelectValue>
                                {COUNTRY_CODES.find(c => c.code === countryCode)?.flag} {countryCode}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {COUNTRY_CODES.map((country) => (
                                <SelectItem key={`${country.country}-${country.code}`} value={country.code}>
                                  {country.flag} {country.country} ({country.code})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className="relative flex-1">
                            <Input 
                              id="phone" 
                              type="tel" 
                              placeholder="(555) 123-4567"
                              value={phoneData.phone}
                              onChange={handlePhoneChange}
                              className="h-14 text-base rounded-xl border-2 focus:border-primary"
                              maxLength={14}
                              required 
                            />
                          </div>
                        </div>
                        {phoneData.phone && !isValidPhoneNumber(phoneData.phone) && (
                          <p className="text-sm text-destructive">Please enter a valid 10-digit phone number</p>
                        )}
                      </div>
                      <Button 
                        type="submit" 
                        className="w-full h-14 text-base font-semibold rounded-xl bg-primary hover:bg-primary/90" 
                        disabled={loading || (phoneData.phone !== '' && !isValidPhoneNumber(phoneData.phone))}
                      >
                        {loading ? (
                          <>
                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                            Sending Code...
                          </>
                        ) : (
                          'Continue with Phone'
                        )}
                      </Button>
                    </form>
                  ) : (
                    <form onSubmit={handleVerifyOtp} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="otp" className="text-sm font-medium">Verification Code</Label>
                        <Input 
                          id="otp" 
                          type="text" 
                          placeholder="Enter 6-digit code"
                          value={phoneData.otp}
                          onChange={e => setPhoneData({ ...phoneData, otp: e.target.value })}
                          className="h-14 text-center text-2xl tracking-[0.5em] font-mono rounded-xl border-2 focus:border-primary"
                          maxLength={6}
                          required 
                        />
                        <p className="text-sm text-muted-foreground text-center">
                          Code sent to {countryCode} {phoneData.phone}
                        </p>
                      </div>
                      <Button 
                        type="submit" 
                        className="w-full h-14 text-base font-semibold rounded-xl" 
                        disabled={loading}
                      >
                        {loading ? (
                          <>
                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                            Verifying...
                          </>
                        ) : (
                          'Verify & Continue'
                        )}
                      </Button>
                      <Button 
                        type="button" 
                        variant="ghost" 
                        className="w-full text-muted-foreground"
                        onClick={() => setOtpSent(false)}
                      >
                        Use different number
                      </Button>
                    </form>
                  )}
                </div>
              )}

              {/* Email Auth */}
              {authMethod === 'email' && !showForgotPassword && (
                <Tabs defaultValue="signin" className="space-y-4">
                  <TabsList className="grid w-full grid-cols-2 h-12 rounded-xl p-1">
                    <TabsTrigger value="signin" className="rounded-lg text-sm font-medium">Sign In</TabsTrigger>
                    <TabsTrigger value="signup" className="rounded-lg text-sm font-medium">Sign Up</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="signin">
                    <form onSubmit={handleSignIn} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input 
                          id="email" 
                          type="email" 
                          value={signInData.email}
                          onChange={e => setSignInData({ ...signInData, email: e.target.value })}
                          className="h-12 rounded-xl border-2"
                          required 
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="password">Password</Label>
                          <button
                            type="button"
                            onClick={() => {
                              setShowForgotPassword(true);
                              setForgotPasswordEmail(signInData.email);
                            }}
                            className="text-sm text-primary hover:underline"
                          >
                            Forgot password?
                          </button>
                        </div>
                        <Input 
                          id="password" 
                          type="password" 
                          value={signInData.password}
                          onChange={e => setSignInData({ ...signInData, password: e.target.value })}
                          className="h-12 rounded-xl border-2"
                          required 
                        />
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="rememberMe" 
                          checked={rememberMe}
                          onCheckedChange={(checked) => setRememberMe(checked === true)}
                        />
                        <Label 
                          htmlFor="rememberMe" 
                          className="text-sm font-normal text-muted-foreground cursor-pointer"
                        >
                          Remember me
                        </Label>
                      </div>
                      
                      <Button type="submit" className="w-full h-14 text-base font-semibold rounded-xl" disabled={loading}>
                        {loading ? (
                          <>
                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                            Signing In...
                          </>
                        ) : (
                          'Sign In'
                        )}
                      </Button>
                    </form>
                  </TabsContent>
                  
                  <TabsContent value="signup">
                    <form onSubmit={handleSignUp} className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="firstName">First Name</Label>
                          <Input 
                            id="firstName" 
                            value={signUpData.firstName}
                            onChange={e => setSignUpData({ ...signUpData, firstName: e.target.value })}
                            className="h-12 rounded-xl border-2"
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="lastName">Last Name</Label>
                          <Input 
                            id="lastName" 
                            value={signUpData.lastName}
                            onChange={e => setSignUpData({ ...signUpData, lastName: e.target.value })}
                            className="h-12 rounded-xl border-2"
                          />
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="signupEmail">Email</Label>
                        <Input 
                          id="signupEmail" 
                          type="email" 
                          value={signUpData.email}
                          onChange={e => setSignUpData({ ...signUpData, email: e.target.value })}
                          className="h-12 rounded-xl border-2"
                          required 
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="signupPassword">Password</Label>
                        <Input 
                          id="signupPassword" 
                          type="password" 
                          value={signUpData.password}
                          onChange={e => setSignUpData({ ...signUpData, password: e.target.value })}
                          className="h-12 rounded-xl border-2"
                          required 
                        />
                      </div>
                      
                      <Button type="submit" className="w-full h-14 text-base font-semibold rounded-xl" disabled={loading}>
                        {loading ? (
                          <>
                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                            Creating Account...
                          </>
                        ) : (
                          'Create Account'
                        )}
                      </Button>
                    </form>
                  </TabsContent>
                </Tabs>
              )}

              {/* Forgot Password Form */}
              {authMethod === 'email' && showForgotPassword && (
                <div className="space-y-4">
                  {!forgotPasswordSent ? (
                    <form onSubmit={handleForgotPassword} className="space-y-4">
                      <div className="text-center mb-2">
                        <h2 className="text-lg font-semibold">Reset your password</h2>
                        <p className="text-sm text-muted-foreground">
                          Enter your email and we'll send you a reset link
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="forgotEmail">Email</Label>
                        <Input 
                          id="forgotEmail" 
                          type="email" 
                          value={forgotPasswordEmail}
                          onChange={e => setForgotPasswordEmail(e.target.value)}
                          className="h-12 rounded-xl border-2"
                          placeholder="Enter your email"
                          required 
                        />
                      </div>
                      {resetCooldown > 0 && (
                        <p className="text-sm text-amber-600 dark:text-amber-400 text-center">
                          Please wait {resetCooldown}s before requesting another link
                        </p>
                      )}
                      <Button 
                        type="submit" 
                        className="w-full h-14 text-base font-semibold rounded-xl" 
                        disabled={loading || resetCooldown > 0}
                      >
                        {loading ? (
                          <>
                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                            Sending...
                          </>
                        ) : resetCooldown > 0 ? (
                          `Wait ${resetCooldown}s`
                        ) : (
                          'Send Reset Link'
                        )}
                      </Button>
                      <Button 
                        type="button" 
                        variant="ghost" 
                        className="w-full text-muted-foreground"
                        onClick={() => {
                          setShowForgotPassword(false);
                          setForgotPasswordSent(false);
                        }}
                      >
                        Back to sign in
                      </Button>
                    </form>
                  ) : (
                    <div className="text-center space-y-4 py-4">
                      <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                        <Mail className="h-7 w-7 text-green-600" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold mb-1">Check your email</h2>
                        <p className="text-sm text-muted-foreground">
                          We've sent a password reset link to<br />
                          <span className="font-medium text-foreground">{forgotPasswordEmail}</span>
                        </p>
                      </div>
                      <Button 
                        variant="outline"
                        className="w-full h-12 rounded-xl"
                        onClick={() => {
                          setShowForgotPassword(false);
                          setForgotPasswordSent(false);
                          setForgotPasswordEmail('');
                        }}
                      >
                        Back to sign in
                      </Button>
                    </div>
                  )}
                </div>
              )}

              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <Separator className="w-full" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-3 text-muted-foreground">or continue with</span>
                </div>
              </div>

              {/* Auth Method Toggle */}
              <Button
                variant="outline"
                className="w-full h-14 text-base font-medium rounded-xl border-2"
                onClick={() => { 
                  setAuthMethod(authMethod === 'phone' ? 'email' : 'phone'); 
                  setOtpSent(false); 
                }}
              >
                {authMethod === 'phone' ? (
                  <>
                    <Mail className="w-5 h-5 mr-3" />
                    Continue with Email
                  </>
                ) : (
                  <>
                    <Phone className="w-5 h-5 mr-3" />
                    Continue with Phone
                  </>
                )}
              </Button>

              {/* Social Auth Buttons */}
              <div className="grid grid-cols-2 gap-3">
                <Button 
                  variant="outline" 
                  className="h-14 text-sm font-medium rounded-xl border-2"
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                >
                  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Google
                </Button>
                
                <Button 
                  variant="outline" 
                  className="h-14 text-sm font-medium rounded-xl border-2"
                  onClick={handleAppleSignIn}
                  disabled={loading}
                >
                  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                  </svg>
                  Apple
                </Button>
              </div>
            </div>

            {/* Footer */}
            <p className="text-center text-muted-foreground text-sm">
              By continuing, you agree to our{' '}
              <button 
                onClick={() => setTermsOpen(true)}
                className="underline hover:text-foreground transition-colors"
              >
                Terms & Conditions
              </button>
              {' '}and{' '}
              <button 
                onClick={() => setPrivacyOpen(true)}
                className="underline hover:text-foreground transition-colors"
              >
                Privacy Policy
              </button>
            </p>
          </div>
        </div>
      </div>

      {/* Terms & Conditions Dialog */}
      <Dialog open={termsOpen} onOpenChange={setTermsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="text-xl font-bold">Terms & Conditions</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh] px-6 pb-6">
            <div className="prose prose-sm max-w-none text-muted-foreground space-y-4">
              <p className="text-xs text-muted-foreground">Last Updated: Dec 11, 2025</p>
              
              <p>Welcome to Parkzy. These Terms & Conditions ("Terms") are a binding legal agreement between you ("User," "you," or "your") and Parkzy, Inc. ("Parkzy," "we," "us," or "our"). These Terms govern your access to and use of the Parkzy mobile application, website, and related services (collectively, the "Platform").</p>
              
              <p>By accessing or using the Platform, you acknowledge that you have read, understood, and agree to be bound by these Terms. If you do not agree, do not use the Platform.</p>

              <h3 className="font-semibold text-foreground mt-6">1. OVERVIEW OF THE SERVICE</h3>
              <p>Parkzy is a peer-to-peer platform that allows:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Property owners or authorized users ("Hosts") to list parking spaces ("Spots"), and</li>
                <li>Drivers ("Drivers") to reserve those Spots for short-term or scheduled parking.</li>
              </ul>
              <p>Parkzy is not a parking operator, insurer, real estate broker, transportation provider, or towing company. Parkzy does not own, control, inspect, or manage any Spots. All interactions and transactions occur directly between Hosts and Drivers.</p>

              <h3 className="font-semibold text-foreground mt-6">2. ELIGIBILITY</h3>
              <p>To use the Platform, you represent and warrant that:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>You are 18 years of age or older.</li>
                <li>You have the legal capacity to enter into binding agreements.</li>
                <li>If you are a Host, you have full legal authority to list and rent out the Spot (ownership, leasehold rights, or written authorization).</li>
              </ul>
              <p>Parkzy may suspend or terminate accounts at its discretion for violations of these Terms or for suspected fraudulent or harmful activity.</p>

              <h3 className="font-semibold text-foreground mt-6">3. USER ACCOUNTS</h3>
              <p>Users must create an account to use certain features of the Platform. You agree to:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Provide accurate, truthful, and complete information.</li>
                <li>Maintain the confidentiality of your credentials.</li>
                <li>Be responsible for all activities under your account.</li>
              </ul>
              <p>Parkzy is not liable for unauthorized access resulting from your sharing or mishandling of login information.</p>

              <h3 className="font-semibold text-foreground mt-6">4. HOST RESPONSIBILITIES</h3>
              <h4 className="font-medium text-foreground">4.1 Legal Authority to List</h4>
              <p>Hosts represent, warrant, and affirm that they own the Spot, or have express written permission from the lawful owner or property manager to list the Spot.</p>
              <p><strong>Unauthorized Listings:</strong> If a Host lists a Spot without proper authorization, the Host assumes full legal and financial responsibility. The Host agrees to indemnify and hold harmless Parkzy from all claims, damages, losses, attorney's fees, penalties, disputes, and enforcement actions arising from the unauthorized listing. Parkzy may immediately suspend or terminate the Host's account. Parkzy has no obligation to verify ownership or authorization.</p>
              
              <h4 className="font-medium text-foreground">4.2 Accuracy & Condition</h4>
              <p>Hosts are solely responsible for ensuring that the Spot is accurately described, clear instructions, access information, and rules are provided, and the Spot is safe, accessible, and free of hazardous conditions. Parkzy is not liable for inaccurate listings, property hazards, or loss/damage occurring at a Spot.</p>

              <h4 className="font-medium text-foreground">4.3 Compliance With Laws & Rules</h4>
              <p>Hosts must comply with local parking laws, zoning ordinances, HOA/condo/co-op rules, lease agreements, signage requirements, and applicable state and local regulations. Hosts assume all responsibility for consequences arising from non-compliance.</p>

              <h3 className="font-semibold text-foreground mt-6">5. DRIVER RESPONSIBILITIES</h3>
              <p>Drivers agree to park only in the reserved Spot and only during the reserved time, follow all Host rules, listing instructions, and applicable laws, not damage property or obstruct other vehicles, and vacate the Spot by the reservation end time unless extended through the Platform.</p>
              <p>Drivers assume all risk and liability for property damage, parking violations, towings, fines, penalties, and citations. Parkzy is not responsible for the safety of Spots or any incidents occurring while vehicles are parked.</p>

              <h3 className="font-semibold text-foreground mt-6">6. BOOKINGS, PAYMENTS, FEES & OVERSTAYS</h3>
              <h4 className="font-medium text-foreground">6.1 Pricing Structure</h4>
              <p>Hosts set a base price ("Host Price"). Parkzy automatically applies a 20% markup to create the price shown to Drivers ("Driver Price"): Driver Price = Host Price × 1.20. Drivers pay the Driver Price plus taxes, fees, penalties, and adjustments. Hosts receive payouts based on the Host Price, minus applicable fees.</p>

              <h4 className="font-medium text-foreground">6.2 Payment Authorization</h4>
              <p>Drivers authorize Parkzy and its payment partners to charge the Driver Price, charge overstay fees, penalties, and towing fees, place temporary authorization holds, and charge all costs related to enforcement actions. Hosts authorize Parkzy to remit payouts based on the Host Price minus fees.</p>

              <h4 className="font-medium text-foreground">6.3 Cancellations & Refunds</h4>
              <p>Cancellation policies vary by listing and are shown at checkout. Refunds are issued solely at Parkzy's discretion, unless legally required.</p>

              <h4 className="font-medium text-foreground">6.4 Service Fees</h4>
              <p>Parkzy may charge driver service fees, host service fees, processing fees, and administrative or enforcement fees.</p>

              <h4 className="font-medium text-foreground">6.5 Host Payouts</h4>
              <p>Hosts are paid the Host Price minus Parkzy host fees, payment processor fees, applicable deductions, and fraud holds or chargebacks. Parkzy retains the markup difference between the Host Price and the Driver Price.</p>

              <h4 className="font-medium text-foreground">6.6 Markup Disclosure</h4>
              <p>Hosts acknowledge that Drivers may see prices different from the Host Price. Drivers acknowledge that displayed prices include Parkzy's markup.</p>

              <h4 className="font-medium text-foreground">6.7 Overstay Policy</h4>
              <p>Drivers must vacate the Spot by the reservation end time. Drivers receive a 15-minute grace period following the reservation end time. If the Driver remains after the grace period, the Driver will be automatically charged $25 per hour, billed in 15-minute increments. These fees are non-refundable. Parkzy may pre-authorize or charge additional amounts to cover expected fees.</p>

              <h4 className="font-medium text-foreground">6.8 Host Towing Rights</h4>
              <p>After the 15-minute grace period, the Host may request towing directly through the Parkzy app, have the vehicle removed by a licensed towing provider, subject to local laws, and charge all towing-related costs directly to the Driver's stored payment method.</p>
              <p>Drivers expressly authorize Parkzy to charge their payment method for towing fees, storage fees, release fees, service charges, court or administrative penalties, and any Host-imposed towing-related expenses.</p>
              <p>Parkzy does not own, operate, or control towing providers and bears no responsibility for towing damage, delays, improper tows, disputes, or costs incurred. All towing disputes must be resolved between Drivers, Hosts, and towing providers.</p>

              <h4 className="font-medium text-foreground">6.9 Violations, Damage & Enforcement</h4>
              <p>Drivers are solely responsible for parking citations, private property violations, damage to the Spot or surrounding property, and nuisance or trespass complaints. Hosts are solely responsible for ensuring their listing complies with law and enforcement actions taken. Parkzy assumes no liability for any legal, civil, or financial consequences arising from Host or Driver actions.</p>

              <h3 className="font-semibold text-foreground mt-6">7. ENFORCEMENT & TOWING</h3>
              <p>Parkzy is not a towing company and does not supervise, direct, or control towing providers. Parkzy is not responsible for towing outcomes, vehicle damage, losses, delays, or costs, improper or illegal towing initiated by Hosts, and enforcement actions or property access issues. Drivers agree towing may occur at their full expense under the terms above.</p>

              <h3 className="font-semibold text-foreground mt-6">8. USER-GENERATED CONTENT</h3>
              <p>Users grant Parkzy a worldwide, royalty-free, perpetual license to use, display, reproduce, distribute, modify, and create derivative works from User Content, solely for Platform operations. Users represent they have all rights necessary to provide such content and that it does not violate any laws or third-party rights.</p>

              <h3 className="font-semibold text-foreground mt-6">9. PROHIBITED CONDUCT</h3>
              <p>Users may not misrepresent identity or authority, list unauthorized Spots, damage property or vehicles, violate any law or third-party rights, engage in fraud or deceptive behavior, reverse engineer the Platform, use automated tools without authorization, or interfere with Platform operations. Parkzy reserves the right to take appropriate action, including account termination.</p>

              <h3 className="font-semibold text-foreground mt-6">10. INSURANCE & LIABILITY</h3>
              <p>Parkzy does not provide auto insurance, property insurance, liability insurance, Host or Driver insurance, or coverage for theft, vandalism, damage, or injury. Users are solely responsible for obtaining appropriate insurance coverage. Parkzy does not guarantee any dispute resolution, reimbursement, or protection related to any parking interaction.</p>

              <h3 className="font-semibold text-foreground mt-6">11. DISCLAIMERS</h3>
              <p>The Platform is provided on an "AS IS" and "AS AVAILABLE" basis. Parkzy disclaims all warranties, express or implied, including merchantability, fitness for a particular purpose, non-infringement, safety or condition of properties, accuracy or reliability of content, and continuous, error-free operation. Use of the Platform is entirely at your own risk.</p>

              <h3 className="font-semibold text-foreground mt-6">12. LIMITATION OF LIABILITY</h3>
              <p>To the fullest extent permitted by law, Parkzy is not liable for unauthorized Spot listings, towing actions, vehicle damage or theft, property damage, personal injury or death, lost profits or data, municipal fines or penalties, disputes between Hosts and Drivers, or any acts or omissions of towing providers. Parkzy's maximum cumulative liability shall not exceed the greater of (a) the total fees paid by the User to Parkzy in the prior 12 months, or (b) $100.</p>

              <h3 className="font-semibold text-foreground mt-6">13. INDEMNIFICATION</h3>
              <p>Users agree to indemnify, defend, and hold harmless Parkzy, its officers, directors, employees, and affiliates from any claims, liabilities, damages, losses, penalties, towing fees, citations, legal fees, and costs arising from unauthorized Spot listings, property or vehicle damage, overstay violations, towing actions or disputes, misuse of the Platform, violation of these Terms, violations of law or third-party rights, and bodily injury or property loss occurring at a Spot. This obligation survives termination of your account.</p>

              <h3 className="font-semibold text-foreground mt-6">14. DISPUTE RESOLUTION & ARBITRATION</h3>
              <h4 className="font-medium text-foreground">14.1 Mandatory Arbitration</h4>
              <p>All disputes must be resolved through binding arbitration administered by the American Arbitration Association (AAA).</p>
              <h4 className="font-medium text-foreground">14.2 Class Action Waiver</h4>
              <p>Users waive the right to participate in class actions, bring representative suits, and proceed on behalf of others.</p>
              <h4 className="font-medium text-foreground">14.3 Governing Law</h4>
              <p>These Terms are governed by the laws of the State of Delaware, without regard to conflict-of-laws principles.</p>

              <h3 className="font-semibold text-foreground mt-6">15. TERMINATION</h3>
              <p>Parkzy may suspend or terminate accounts at any time for violations, risk issues, or harmful activity. Users may delete their accounts at any time but remain responsible for outstanding obligations.</p>

              <h3 className="font-semibold text-foreground mt-6">16. MODIFICATIONS</h3>
              <p>Parkzy may modify these Terms at any time. Updates take effect upon posting. Continued use constitutes acceptance.</p>

              <h3 className="font-semibold text-foreground mt-6">17. PRIVACY POLICY</h3>
              <p>Your use of the Platform is also governed by Parkzy's Privacy Policy, incorporated by reference.</p>

              <h3 className="font-semibold text-foreground mt-6">18. MISCELLANEOUS</h3>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Entire Agreement:</strong> These Terms constitute the entire agreement.</li>
                <li><strong>Severability:</strong> Invalid provisions do not affect remaining terms.</li>
                <li><strong>No Waiver:</strong> Failure to enforce rights does not waive them.</li>
                <li><strong>Assignment:</strong> Users may not assign rights; Parkzy may assign freely.</li>
              </ul>

              <h3 className="font-semibold text-foreground mt-6">19. CONTACT INFORMATION</h3>
              <p>
                Parkzy, Inc.<br />
                Email: support@useparkzy.com<br />
                Website: www.useparkzy.com
              </p>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Privacy Policy Dialog */}
      <Dialog open={privacyOpen} onOpenChange={setPrivacyOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="text-xl font-bold">Privacy Policy</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh] px-6 pb-6">
            <div className="prose prose-sm max-w-none text-muted-foreground space-y-4">
              <p className="text-xs text-muted-foreground">Last Updated: Dec 11, 2025</p>
              
              <p>This Privacy Policy describes how Parkzy, Inc. ("Parkzy," "we," "us," or "our") collects, uses, discloses, and protects your information when you access or use the Parkzy mobile application, website, and related services (collectively, the "Platform").</p>
              
              <p>By using the Platform, you consent to the practices described in this Privacy Policy.</p>

              <h3 className="font-semibold text-foreground mt-6">1. INFORMATION WE COLLECT</h3>
              <p>We collect information in the following categories:</p>

              <h4 className="font-medium text-foreground">1.1 Information You Provide Directly</h4>
              <p>When you create an account, list a parking spot, or reserve a spot, you may provide:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Name</li>
                <li>Email address</li>
                <li>Phone number</li>
                <li>Account credentials</li>
                <li>Payment information (processed by third-party providers)</li>
                <li>Vehicle information (license plate, make, model, color)</li>
                <li>Spot details (address, access instructions, rules)</li>
                <li>Identity verification information (if required)</li>
                <li>Communications with Parkzy or other users</li>
              </ul>
              <p>We do not store full credit card numbers; these are processed by Stripe or other PCI-compliant processors.</p>

              <h4 className="font-medium text-foreground">1.2 Information We Automatically Collect</h4>
              <p>When you use the Platform, we may automatically collect:</p>
              <p><strong>Device & Usage Information:</strong> IP address, device type and settings, operating system, mobile device identifiers, browser type, app and website usage information, log data, cookies, and analytics data.</p>
              <p><strong>Location Information:</strong> With your permission, Parkzy may collect approximate or precise location, GPS data, and device-based location metadata. Drivers acknowledge that location access may be required to help identify nearby available parking spots or assist Hosts in locating a parked vehicle.</p>

              <h4 className="font-medium text-foreground">1.3 Information From Third Parties</h4>
              <p>We may receive information from payment processors, identity verification services, analytics providers, advertising partners, towing partners (e.g., tow status, timestamps, fees), public databases, and social media platforms (if you connect an account).</p>

              <h3 className="font-semibold text-foreground mt-6">2. HOW WE USE YOUR INFORMATION</h3>
              <p>We use collected information for the following purposes:</p>

              <h4 className="font-medium text-foreground">To Operate the Platform</h4>
              <ul className="list-disc pl-5 space-y-1">
                <li>Facilitate parking spot listings, bookings, payments, and payouts</li>
                <li>Verify user identities</li>
                <li>Display and manage reservations</li>
                <li>Enable Hosts to enforce rules, including towing actions</li>
              </ul>

              <h4 className="font-medium text-foreground">To Communicate With You</h4>
              <ul className="list-disc pl-5 space-y-1">
                <li>Transaction confirmations</li>
                <li>Security alerts</li>
                <li>Customer support</li>
                <li>Policy updates</li>
                <li>Promotional content (you may opt out)</li>
              </ul>

              <h4 className="font-medium text-foreground">To Improve the Platform</h4>
              <ul className="list-disc pl-5 space-y-1">
                <li>Debugging, analytics, testing, and research</li>
                <li>Personalizing your experience</li>
                <li>Monitoring trends and usage</li>
              </ul>

              <h4 className="font-medium text-foreground">To Ensure Compliance & Safety</h4>
              <ul className="list-disc pl-5 space-y-1">
                <li>Detect fraud or unauthorized listing activity</li>
                <li>Support Hosts in enforcement actions</li>
                <li>Process violations, overstays, and towing fees</li>
                <li>Comply with legal obligations</li>
              </ul>

              <h4 className="font-medium text-foreground">To Protect Parkzy</h4>
              <ul className="list-disc pl-5 space-y-1">
                <li>Enforce our Terms & Conditions</li>
                <li>Resolve disputes between Hosts and Drivers</li>
                <li>Investigate prohibited activity or misuse</li>
              </ul>

              <h3 className="font-semibold text-foreground mt-6">3. HOW WE SHARE YOUR INFORMATION</h3>
              <p>We may share your information with:</p>

              <h4 className="font-medium text-foreground">3.1 Other Users</h4>
              <p>Certain information may be shared between Hosts and Drivers, including:</p>
              <p><strong>Shared with Hosts:</strong> Driver's first name, vehicle details, reservation times, profile information necessary for enforcement or towing.</p>
              <p><strong>Shared with Drivers:</strong> Host name or business name, spot address, parking instructions, contact or verification details if required for access.</p>

              <h4 className="font-medium text-foreground">3.2 Service Providers</h4>
              <p>We share information with trusted third-party service providers, such as payment processors (e.g., Stripe), cloud hosting providers, data analytics providers, customer support platforms, towing partners (for enforcement requests), and identity verification vendors. These providers are contractually obligated to protect your information.</p>

              <h4 className="font-medium text-foreground">3.3 Legal, Safety, and Compliance</h4>
              <p>We may disclose information when required by law or when necessary to comply with court orders, warrants, or subpoenas, prevent fraud or abuse, enforce our Terms & Conditions, respond to safety or security concerns, and assist law enforcement or government agencies.</p>

              <h4 className="font-medium text-foreground">3.4 Business Transfers</h4>
              <p>If Parkzy undergoes a merger, acquisition, asset sale, financing, or similar transaction, information may be transferred as part of the business assets.</p>

              <h3 className="font-semibold text-foreground mt-6">4. COOKIES & TRACKING TECHNOLOGIES</h3>
              <p>We use cookies, pixels, SDKs, and similar technologies to authenticate users, remember preferences, enable app functionality, analyze usage, and improve marketing and advertising. Users may adjust cookie settings through browser or device controls, though certain features may not function properly if disabled.</p>

              <h3 className="font-semibold text-foreground mt-6">5. DATA RETENTION</h3>
              <p>We retain information for as long as necessary to provide services, fulfill legitimate business purposes, comply with legal obligations, resolve disputes, and enforce agreements. We may retain anonymized or aggregated data indefinitely.</p>

              <h3 className="font-semibold text-foreground mt-6">6. DATA SECURITY</h3>
              <p>We implement reasonable administrative, technical, and physical safeguards to protect your information. However, no method of transmission or storage is 100% secure. You use the Platform at your own risk.</p>

              <h3 className="font-semibold text-foreground mt-6">7. CHILDREN'S PRIVACY</h3>
              <p>The Platform is not intended for individuals under 18. We do not knowingly collect personal information from minors. If you believe a minor has provided information, contact us and we will delete it.</p>

              <h3 className="font-semibold text-foreground mt-6">8. YOUR PRIVACY RIGHTS</h3>
              <p>Depending on your location, you may have rights including access to personal information, correction or deletion of personal information, opt-out of marketing communications, data portability, and restriction of processing.</p>

              <h4 className="font-medium text-foreground">CCPA / California Privacy Rights</h4>
              <p>California residents may have additional rights, including right to know what personal data is collected, right to delete personal data, right to opt out of data "sales" or "sharing", and right to non-discrimination. Parkzy does not sell personal information as defined under the CCPA.</p>
              <p>To request access or deletion, email support@useparkzy.com. We may require identity verification.</p>

              <h3 className="font-semibold text-foreground mt-6">9. THIRD-PARTY LINKS</h3>
              <p>The Platform may contain links to third-party websites or services. Parkzy is not responsible for their privacy practices or content.</p>

              <h3 className="font-semibold text-foreground mt-6">10. INTERNATIONAL USERS</h3>
              <p>Parkzy is based in the United States. By using the Platform, you consent to your information being transferred to and processed in the U.S.</p>

              <h3 className="font-semibold text-foreground mt-6">11. CHANGES TO THIS PRIVACY POLICY</h3>
              <p>We may update this Privacy Policy at any time. Changes become effective upon posting. Continued use of the Platform constitutes acceptance of updated terms.</p>

              <h3 className="font-semibold text-foreground mt-6">12. CONTACT US</h3>
              <p>For questions, concerns, or privacy requests, contact:</p>
              <p>
                Parkzy, Inc.<br />
                Email: support@useparkzy.com<br />
                Website: www.useparkzy.com
              </p>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Auth;
