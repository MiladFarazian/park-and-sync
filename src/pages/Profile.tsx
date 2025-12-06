import React, { useEffect, useState } from 'react';
import { Edit, Star, User, Car, CreditCard, Bell, Shield, ChevronRight, LogOut, AlertCircle, Upload, Building2, ArrowRight, ExternalLink, X, Mail, CheckCircle2, Clock, Phone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { formatPhoneNumber } from '@/lib/utils';
import { ImageCropDialog } from '@/components/profile/ImageCropDialog';
import ModeSwitcher from '@/components/layout/ModeSwitcher';
import { useMode } from '@/contexts/ModeContext';
const profileSchema = z.object({
  first_name: z.string().trim().min(1, 'First name is required').max(50, 'First name must be less than 50 characters'),
  last_name: z.string().trim().min(1, 'Last name is required').max(50, 'Last name must be less than 50 characters'),
  email: z.string().trim().email('Invalid email address').optional().or(z.literal('')),
  phone: z.string().trim().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format').optional().or(z.literal(''))
});
type ProfileFormData = z.infer<typeof profileSchema>;
const Profile = () => {
  const {
    user,
    profile,
    loading,
    signOut,
    updateProfile
  } = useAuth();
  const navigate = useNavigate();
  const {
    mode,
    setMode
  } = useMode();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [avatarFile, setAvatarFile] = useState<Blob | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>('');
  const [isCropDialogOpen, setIsCropDialogOpen] = useState(false);
  const [tempImageSrc, setTempImageSrc] = useState<string>('');
  const [stripeConnectStatus, setStripeConnectStatus] = useState<{
    connected: boolean;
    charges_enabled: boolean;
    details_submitted: boolean;
  } | null>(null);
  const [profileAlertDismissed, setProfileAlertDismissed] = useState(false);
  const [profileAlertVisible, setProfileAlertVisible] = useState(false);
  const [isLoadingStripe, setIsLoadingStripe] = useState(false);
  const [hasListedSpots, setHasListedSpots] = useState(false);
  const [isResendingEmail, setIsResendingEmail] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isPhoneVerifyDialogOpen, setIsPhoneVerifyDialogOpen] = useState(false);
  const [isSendingPhoneOtp, setIsSendingPhoneOtp] = useState(false);
  const [isVerifyingPhone, setIsVerifyingPhone] = useState(false);
  const [phoneOtp, setPhoneOtp] = useState('');
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneVerifyCooldown, setPhoneVerifyCooldown] = useState(0);
  const {
    register,
    handleSubmit,
    formState: {
      errors
    },
    reset
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      first_name: profile?.first_name || '',
      last_name: profile?.last_name || '',
      email: profile?.email || '',
      phone: profile?.phone || ''
    }
  });
  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  // Show profile alert popup with delay
  useEffect(() => {
    const wasDismissed = localStorage.getItem('profileAlertDismissed');
    if (wasDismissed) {
      setProfileAlertDismissed(true);
    } else {
      const timer = setTimeout(() => setProfileAlertVisible(true), 500);
      return () => clearTimeout(timer);
    }
  }, []);

  // Cooldown timer effect
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Phone verify cooldown timer
  useEffect(() => {
    if (phoneVerifyCooldown <= 0) return;
    const timer = setInterval(() => {
      setPhoneVerifyCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [phoneVerifyCooldown]);

  const handleDismissProfileAlert = () => {
    setProfileAlertVisible(false);
    setTimeout(() => {
      setProfileAlertDismissed(true);
      localStorage.setItem('profileAlertDismissed', 'true');
    }, 300);
  };
  useEffect(() => {
    if (profile) {
      reset({
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
        email: profile.email || '',
        phone: profile.phone || ''
      });
      setAvatarPreview(profile.avatar_url || '');

      // Check Stripe Connect status for hosts
      if (mode === 'host') {
        checkStripeConnectStatus();
      }

      // Check if user has listed any spots
      checkUserSpots();
    }
  }, [profile, reset, mode]);
  const checkUserSpots = async () => {
    if (!user) return;
    try {
      const {
        data,
        error
      } = await supabase.from('spots').select('id').eq('host_id', user.id).limit(1);
      if (error) throw error;
      setHasListedSpots(data && data.length > 0);
    } catch (error) {
      console.error('Error checking user spots:', error);
    }
  };
  const checkStripeConnectStatus = async () => {
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke('check-stripe-connect-status');
      if (error) throw error;
      setStripeConnectStatus(data);
    } catch (error) {
      console.error('Error checking Stripe status:', error);
    }
  };
  const handleStripeConnect = async () => {
    setIsLoadingStripe(true);
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke('create-stripe-connect-link');
      if (error) throw error;

      // Open Stripe onboarding in new tab
      window.open(data.url, '_blank');
      toast.success('Opening Stripe onboarding...');
    } catch (error: any) {
      toast.error('Failed to connect Stripe: ' + error.message);
    } finally {
      setIsLoadingStripe(false);
    }
  };
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('File size must be less than 5MB');
        return;
      }

      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast.error('Only image files are allowed');
        return;
      }

      // Open crop dialog
      const reader = new FileReader();
      reader.onloadend = () => {
        setTempImageSrc(reader.result as string);
        setIsCropDialogOpen(true);
      };
      reader.readAsDataURL(file);
    }
  };
  const handleCropComplete = (croppedBlob: Blob) => {
    setAvatarFile(croppedBlob);

    // Create preview from cropped blob
    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarPreview(reader.result as string);
    };
    reader.readAsDataURL(croppedBlob);
    setIsCropDialogOpen(false);
  };
  const handleCropCancel = () => {
    setIsCropDialogOpen(false);
    setTempImageSrc('');
  };
  const uploadAvatar = async (): Promise<string | null> => {
    if (!avatarFile || !user) return null;
    try {
      // Delete old avatar if exists
      if (profile?.avatar_url) {
        const oldPath = profile.avatar_url.split('/').slice(-2).join('/');
        await supabase.storage.from('avatars').remove([oldPath]);
      }

      // Upload new avatar
      const filePath = `${user.id}/avatar.jpg`;
      const {
        error: uploadError
      } = await supabase.storage.from('avatars').upload(filePath, avatarFile, {
        upsert: true,
        contentType: 'image/jpeg'
      });
      if (uploadError) throw uploadError;

      // Get public URL
      const {
        data
      } = supabase.storage.from('avatars').getPublicUrl(filePath);
      return data.publicUrl;
    } catch (error: any) {
      toast.error('Failed to upload avatar: ' + error.message);
      return null;
    }
  };
  const isProfileIncomplete = !profile?.first_name || !profile?.last_name;
  const onSubmit = async (data: ProfileFormData) => {
    setIsUpdating(true);
    try {
      let avatar_url = profile?.avatar_url;

      // Upload avatar if a new file was selected
      if (avatarFile) {
        const uploadedUrl = await uploadAvatar();
        if (uploadedUrl) {
          avatar_url = uploadedUrl;
        }
      }

      // If email is being added/changed, update auth.users first
      const isAddingEmail = data.email && data.email !== profile?.email;
      if (isAddingEmail) {
        const { error: authError } = await supabase.auth.updateUser({
          email: data.email,
        });
        
        if (authError) {
          toast.error("Failed to update email: " + authError.message);
          setIsUpdating(false);
          return;
        }
        
        toast.info("Please check your email to confirm the change");
      }

      const {
        error
      } = await updateProfile({
        ...data,
        avatar_url
      });
      if (error) {
        toast.error('Failed to update profile: ' + error.message);
      } else {
        toast.success('Profile updated successfully!');
        setIsEditDialogOpen(false);
        setAvatarFile(null);
      }
    } catch (error) {
      toast.error('An unexpected error occurred');
    } finally {
      setIsUpdating(false);
    }
  };
  const handleEditClick = () => {
    setAvatarPreview(profile?.avatar_url || '');
    setAvatarFile(null);
    setIsEditDialogOpen(true);
  };
  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };
  if (loading) {
    return <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>;
  }
  if (!user) {
    return null;
  }
  const getInitials = () => {
    if (profile?.first_name && profile?.last_name) {
      return `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase();
    }
    if (user.email) {
      return user.email[0].toUpperCase();
    }
    if (profile?.phone || user.phone) {
      return 'P';
    }
    return 'U';
  };
  const getDisplayName = () => {
    if (profile?.first_name && profile?.last_name) {
      return `${profile.first_name} ${profile.last_name}`;
    }
    if (user.email) {
      return user.email.split('@')[0];
    }
    if (profile?.phone) {
      return profile.phone;
    }
    if (user.phone) {
      return user.phone;
    }
    return 'User';
  };
  const getMemberSince = () => {
    if (user.created_at) {
      return new Date(user.created_at).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
      });
    }
    return 'Recently';
  };
  const settingsItems = mode === 'host' ? [{
    icon: User,
    label: 'Manage Account',
    subtitle: 'Update your profile details',
    onClick: () => navigate('/manage-account')
  }, {
    icon: Bell,
    label: 'Notifications',
    subtitle: 'Manage your preferences',
    onClick: () => navigate('/notifications')
  }, {
    icon: Shield,
    label: 'Privacy & Security',
    subtitle: 'Account security settings',
    onClick: () => navigate('/privacy-security')
  }] : [{
    icon: User,
    label: 'Manage Account',
    subtitle: 'Update your profile details',
    onClick: () => navigate('/manage-account')
  }, {
    icon: Building2,
    label: 'List Your Spot',
    subtitle: 'Earn money by hosting',
    onClick: () => {
      setMode('host');
      navigate('/list-spot');
    }
  }, {
    icon: Car,
    label: 'My Vehicles',
    subtitle: 'Manage your cars',
    onClick: () => navigate('/my-vehicles')
  }, {
    icon: CreditCard,
    label: 'Payment Methods',
    subtitle: 'Cards and billing',
    onClick: () => navigate('/payment-methods')
  }, {
    icon: Bell,
    label: 'Notifications',
    subtitle: 'Manage your preferences',
    onClick: () => navigate('/notifications')
  }, {
    icon: Shield,
    label: 'Privacy & Security',
    subtitle: 'Account security settings',
    onClick: () => navigate('/privacy-security')
  }];
  return <div className="space-y-6">
      {/* Incomplete Profile Overlay Popup */}
      {isProfileIncomplete && !profileAlertDismissed && (
        <div 
          className={`fixed bottom-20 left-4 right-4 z-50 md:left-auto md:right-6 md:bottom-6 md:max-w-sm transition-all duration-500 ease-out ${
            profileAlertVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8 pointer-events-none'
          }`}
        >
          <div className="bg-card border border-border rounded-xl shadow-lg p-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 bg-yellow-500/10 rounded-full flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-yellow-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-foreground text-sm">Complete your profile</h4>
                <p className="text-muted-foreground text-xs mt-0.5">
                  Add your details to get the most out of Parkzy.
                </p>
                <div className="flex gap-2 mt-3">
                  <Button 
                    size="sm" 
                    onClick={handleEditClick}
                    className="text-xs h-8"
                  >
                    Add details
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={handleDismissProfileAlert}
                    className="text-xs h-8"
                  >
                    Not now
                  </Button>
                </div>
              </div>
              <button 
                onClick={handleDismissProfileAlert}
                className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header with gradient background */}
      <div className="bg-gradient-to-br from-primary via-primary to-primary/90 text-primary-foreground p-6 rounded-b-3xl shadow-lg">
        <div className="flex justify-between items-start mb-6">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Profile</h1>
            <ModeSwitcher />
          </div>
          
        </div>
        
        {/* Profile Info Card */}
        <Card className="bg-white/10 backdrop-blur-sm border-white/20 text-primary-foreground">
          <div className="p-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20 border-3 border-white/30 shadow-lg flex-shrink-0">
                <AvatarImage src={profile?.avatar_url} />
                <AvatarFallback className="text-xl bg-white/20">{getInitials()}</AvatarFallback>
              </Avatar>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h2 className="text-xl font-bold">{getDisplayName()}</h2>
                  <Button variant="ghost" size="sm" onClick={handleEditClick} className="hover:bg-white/20 text-primary-foreground flex-shrink-0 h-8">
                    <Edit className="h-3.5 w-3.5 mr-1" />
                    Edit
                  </Button>
                </div>
                
                <p className="text-primary-foreground/70 text-xs mb-1">Member since</p>
                <p className="text-primary-foreground/90 text-sm font-medium mb-2">{getMemberSince()}</p>
                
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-white/20 px-2 py-1 rounded-full">
                    <Star className="h-3.5 w-3.5 fill-yellow-300 text-yellow-300" />
                    <span className="font-semibold text-xs">
                      {profile?.rating ? profile.rating.toFixed(1) : 'New'}
                    </span>
                  </div>
                  <span className="text-primary-foreground/70 text-xs">
                    {profile?.review_count ? `${profile.review_count} ${profile.review_count === 1 ? 'review' : 'reviews'}` : 'No reviews yet'}
                  </span>
                </div>
                
                {/* Email verification status */}
                {profile?.email && (
                  <div className="flex items-center flex-wrap gap-1.5 mt-2">
                    <Mail className="h-3.5 w-3.5 text-primary-foreground/70" />
                    <span className="text-xs text-primary-foreground/70 truncate max-w-[140px]">{profile.email}</span>
                    {user?.email_confirmed_at ? (
                      <div className="flex items-center gap-1 bg-green-500/20 text-green-200 px-1.5 py-0.5 rounded-full">
                        <CheckCircle2 className="h-3 w-3" />
                        <span className="text-[10px] font-medium">Verified</span>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-1 bg-yellow-500/20 text-yellow-200 px-1.5 py-0.5 rounded-full">
                          <Clock className="h-3 w-3" />
                          <span className="text-[10px] font-medium">Pending</span>
                        </div>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (isResendingEmail || resendCooldown > 0) return;
                            setIsResendingEmail(true);
                            try {
                              const { error } = await supabase.auth.resend({
                                type: 'signup',
                                email: profile.email!,
                              });
                              if (error) throw error;
                              toast.success('Verification email sent! Check your inbox.');
                              setResendCooldown(60);
                            } catch (error: any) {
                              toast.error('Failed to resend: ' + error.message);
                            } finally {
                              setIsResendingEmail(false);
                            }
                          }}
                          disabled={isResendingEmail || resendCooldown > 0}
                          className="text-[10px] text-primary-foreground/80 hover:text-primary-foreground underline underline-offset-2 disabled:opacity-50 disabled:no-underline"
                        >
                          {isResendingEmail ? 'Sending...' : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend'}
                        </button>
                      </>
                    )}
                  </div>
                )}
                
                {/* Phone verification status */}
                {(profile?.phone || user?.phone) && (
                  <div className="flex items-center flex-wrap gap-1.5 mt-1">
                    <Phone className="h-3.5 w-3.5 text-primary-foreground/70" />
                    <span className="text-xs text-primary-foreground/70 truncate max-w-[140px]">
                      {formatPhoneNumber(profile?.phone || user?.phone || '')}
                    </span>
                    {user?.phone_confirmed_at ? (
                      <div className="flex items-center gap-1 bg-green-500/20 text-green-200 px-1.5 py-0.5 rounded-full">
                        <CheckCircle2 className="h-3 w-3" />
                        <span className="text-[10px] font-medium">Verified</span>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-1 bg-yellow-500/20 text-yellow-200 px-1.5 py-0.5 rounded-full">
                          <Clock className="h-3 w-3" />
                          <span className="text-[10px] font-medium">Unverified</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPhoneOtp('');
                            setPhoneOtpSent(false);
                            setIsPhoneVerifyDialogOpen(true);
                          }}
                          className="text-[10px] text-primary-foreground/80 hover:text-primary-foreground underline underline-offset-2"
                        >
                          Verify
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="px-4 pb-4 space-y-6">
        {/* Become a Host Widget */}
        {mode === 'driver' && !hasListedSpots && <Card className="p-6 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-primary/10 rounded-lg">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg mb-1">Become a Host</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Share your parking spot and earn extra income
                </p>
                <Button onClick={() => navigate('/list-spot')} className="w-full">
                  List Your Spot
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>}

        {/* Stripe Connect for Hosts */}
        {mode === 'host' && <Card className="p-6 border-primary/20">
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-primary/10 rounded-lg">
                  <CreditCard className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg mb-1">Payment Setup</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {stripeConnectStatus?.charges_enabled ? 'Your account is set up to receive payments' : 'Connect with Stripe to receive payments from renters'}
                  </p>
                  
                  {stripeConnectStatus?.charges_enabled ? <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                      <div className="h-2 w-2 rounded-full bg-green-600 dark:bg-green-400" />
                      <span className="font-medium">Payment receiving enabled</span>
                    </div> : stripeConnectStatus?.connected && stripeConnectStatus?.details_submitted ? <div className="flex items-center gap-2 text-sm text-yellow-600 dark:text-yellow-400">
                      <div className="h-2 w-2 rounded-full bg-yellow-600 dark:bg-yellow-400" />
                      <span className="font-medium">Pending verification</span>
                    </div> : <Button onClick={handleStripeConnect} disabled={isLoadingStripe} className="w-full">
                      {isLoadingStripe ? <Loader2 className="h-4 w-4 animate-spin" /> : <>
                          Connect with Stripe
                          <ExternalLink className="ml-2 h-4 w-4" />
                        </>}
                    </Button>}
                  
                  {stripeConnectStatus?.connected && !stripeConnectStatus?.charges_enabled && <Button onClick={handleStripeConnect} disabled={isLoadingStripe} variant="outline" className="w-full mt-2">
                      Continue Setup
                      <ExternalLink className="ml-2 h-4 w-4" />
                    </Button>}
                </div>
              </div>
            </div>
          </Card>}

        {/* Settings Menu */}
        <div className="space-y-3">
          {settingsItems.map((item, index) => {
          const Icon = item.icon;
          return <Card key={index} className="p-4 cursor-pointer hover:bg-accent/50 transition-colors" onClick={item.onClick}>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-muted rounded-lg">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{item.label}</p>
                    <p className="text-sm text-muted-foreground">{item.subtitle}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </Card>;
        })}
        </div>

        {/* Logout Button */}
        <Button variant="outline" onClick={handleSignOut} className="w-full mb-8">
          <LogOut className="h-4 w-4 mr-2" />
          Logout
        </Button>
      </div>

      {/* Edit Profile Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
            <DialogDescription>
              Update your profile information. Click save when you're done.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="grid gap-4 py-4">
              {/* Avatar Upload */}
              <div className="space-y-2">
                <Label>Profile Picture</Label>
                <div className="flex items-center gap-4">
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={avatarPreview || profile?.avatar_url} />
                    <AvatarFallback className="text-xl">{getInitials()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <Input id="avatar" type="file" accept="image/*" onChange={handleAvatarChange} className="cursor-pointer" />
                    <p className="text-xs text-muted-foreground mt-1">
                      PNG, JPG, WEBP up to 5MB
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="first_name">First Name *</Label>
                <Input id="first_name" {...register('first_name')} placeholder="John" />
                {errors.first_name && <p className="text-sm text-destructive">{errors.first_name.message}</p>}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="last_name">Last Name *</Label>
                <Input id="last_name" {...register('last_name')} placeholder="Doe" />
                {errors.last_name && <p className="text-sm text-destructive">{errors.last_name.message}</p>}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input id="email" type="email" {...register('email')} placeholder="john@example.com" />
                {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
                {!profile?.email && (
                  <p className="text-xs text-muted-foreground">Add an email to enable payment methods</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input id="phone" {...register('phone')} placeholder="+1234567890" />
                {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={isUpdating}>
                Cancel
              </Button>
              <Button type="submit" disabled={isUpdating}>
                {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Image Crop Dialog */}
      <ImageCropDialog open={isCropDialogOpen} imageSrc={tempImageSrc} onCropComplete={handleCropComplete} onCancel={handleCropCancel} />

      {/* Phone Verification Dialog */}
      <Dialog open={isPhoneVerifyDialogOpen} onOpenChange={setIsPhoneVerifyDialogOpen}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Verify Phone Number</DialogTitle>
            <DialogDescription>
              {phoneOtpSent 
                ? `Enter the 6-digit code sent to ${formatPhoneNumber(profile?.phone || user?.phone || '')}`
                : `We'll send a verification code to ${formatPhoneNumber(profile?.phone || user?.phone || '')}`
              }
            </DialogDescription>
          </DialogHeader>
          
          {!phoneOtpSent ? (
            <div className="space-y-4 py-4">
              <Button
                onClick={async () => {
                  const phone = profile?.phone || user?.phone;
                  if (!phone || isSendingPhoneOtp) return;
                  setIsSendingPhoneOtp(true);
                  try {
                    // Use updateUser to add/update phone - this sends an OTP
                    const { error } = await supabase.auth.updateUser({
                      phone: phone,
                    });
                    if (error) throw error;
                    toast.success('Verification code sent!');
                    setPhoneOtpSent(true);
                    setPhoneVerifyCooldown(60);
                  } catch (error: any) {
                    toast.error('Failed to send code: ' + error.message);
                  } finally {
                    setIsSendingPhoneOtp(false);
                  }
                }}
                disabled={isSendingPhoneOtp}
                className="w-full"
              >
                {isSendingPhoneOtp ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send Verification Code'
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="phone-otp">Verification Code</Label>
                <Input
                  id="phone-otp"
                  value={phoneOtp}
                  onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="text-center text-2xl tracking-widest"
                  maxLength={6}
                />
              </div>
              
              <Button
                onClick={async () => {
                  const phone = profile?.phone || user?.phone;
                  if (!phone || phoneOtp.length !== 6 || isVerifyingPhone) return;
                  setIsVerifyingPhone(true);
                  try {
                    // Store current user ID to verify we stay on same account
                    const currentUserId = user?.id;
                    
                    const { data, error } = await supabase.auth.verifyOtp({
                      phone: phone,
                      token: phoneOtp,
                      type: 'phone_change',
                    });
                    if (error) throw error;
                    
                    // Check if verification switched accounts (phone already on another account)
                    if (data?.user?.id && data.user.id !== currentUserId) {
                      // Sign back out and show error - phone belongs to different account
                      await supabase.auth.signOut();
                      toast.error('This phone number is already associated with another account. Please sign in again.');
                      return;
                    }
                    
                    // Refresh the current session to get updated phone_verified status
                    await supabase.auth.refreshSession();
                    
                    toast.success('Phone number verified!');
                    setIsPhoneVerifyDialogOpen(false);
                    setPhoneOtp('');
                    setPhoneOtpSent(false);
                  } catch (error: any) {
                    toast.error('Invalid code: ' + error.message);
                  } finally {
                    setIsVerifyingPhone(false);
                  }
                }}
                disabled={phoneOtp.length !== 6 || isVerifyingPhone}
                className="w-full"
              >
                {isVerifyingPhone ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Verify'
                )}
              </Button>
              
              <div className="text-center">
                <button
                  onClick={async () => {
                    const phone = profile?.phone || user?.phone;
                    if (!phone || isSendingPhoneOtp || phoneVerifyCooldown > 0) return;
                    setIsSendingPhoneOtp(true);
                    try {
                      // Use updateUser to resend OTP for phone verification
                      const { error } = await supabase.auth.updateUser({
                        phone: phone,
                      });
                      if (error) throw error;
                      toast.success('New code sent!');
                      setPhoneVerifyCooldown(60);
                    } catch (error: any) {
                      toast.error('Failed to resend: ' + error.message);
                    } finally {
                      setIsSendingPhoneOtp(false);
                    }
                  }}
                  disabled={isSendingPhoneOtp || phoneVerifyCooldown > 0}
                  className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 disabled:opacity-50 disabled:no-underline"
                >
                  {isSendingPhoneOtp 
                    ? 'Sending...' 
                    : phoneVerifyCooldown > 0 
                      ? `Resend in ${phoneVerifyCooldown}s` 
                      : "Didn't receive code? Resend"
                  }
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>;
};
export default Profile;