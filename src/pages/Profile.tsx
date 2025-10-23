import React, { useEffect, useState } from 'react';
import { Edit, Star, User, Car, CreditCard, Bell, Shield, ChevronRight, LogOut, AlertCircle, Upload, ChevronDown, Building2, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
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
import { ImageCropDialog } from '@/components/profile/ImageCropDialog';
import { useMode } from '@/contexts/ModeContext';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const profileSchema = z.object({
  first_name: z.string().trim().min(1, 'First name is required').max(50, 'First name must be less than 50 characters'),
  last_name: z.string().trim().min(1, 'Last name is required').max(50, 'Last name must be less than 50 characters'),
  phone: z.string().trim().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format').optional().or(z.literal('')),
});

type ProfileFormData = z.infer<typeof profileSchema>;

const Profile = () => {
  const { user, profile, loading, signOut, updateProfile } = useAuth();
  const navigate = useNavigate();
  const { mode, setMode } = useMode();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [avatarFile, setAvatarFile] = useState<Blob | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>('');
  const [isCropDialogOpen, setIsCropDialogOpen] = useState(false);
  const [tempImageSrc, setTempImageSrc] = useState<string>('');

  const { register, handleSubmit, formState: { errors }, reset } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      first_name: profile?.first_name || '',
      last_name: profile?.last_name || '',
      phone: profile?.phone || '',
    }
  });

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (profile) {
      reset({
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
        phone: profile.phone || '',
      });
      setAvatarPreview(profile.avatar_url || '');
    }
  }, [profile, reset]);

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
      
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, avatarFile, { 
          upsert: true,
          contentType: 'image/jpeg'
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

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

      const { error } = await updateProfile({
        ...data,
        avatar_url,
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
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const getInitials = () => {
    if (profile?.first_name && profile?.last_name) {
      return `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase();
    }
    return user.email?.[0].toUpperCase() || 'U';
  };

  const getDisplayName = () => {
    if (profile?.first_name && profile?.last_name) {
      return `${profile.first_name} ${profile.last_name}`;
    }
    return user.email?.split('@')[0] || 'User';
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

  const settingsItems = [
    { 
      icon: User, 
      label: 'Personal Information', 
      subtitle: 'Update your profile details',
      onClick: () => navigate('/personal-information')
    },
    { 
      icon: Car, 
      label: 'My Vehicles', 
      subtitle: 'Manage your cars',
      onClick: () => navigate('/my-vehicles')
    },
    { 
      icon: CreditCard, 
      label: 'Payment Methods', 
      subtitle: 'Cards and billing',
      onClick: () => navigate('/payment-methods')
    },
    { 
      icon: Bell, 
      label: 'Notifications', 
      subtitle: 'Manage your preferences',
      onClick: () => navigate('/notifications')
    },
    { 
      icon: Shield, 
      label: 'Privacy & Security', 
      subtitle: 'Account security settings',
      onClick: () => navigate('/privacy-security')
    }
  ];

  const handleNotificationToggle = async (field: 'notification_booking_updates' | 'notification_host_messages', value: boolean) => {
    try {
      const { error } = await updateProfile({
        [field]: value
      });
      
      if (error) {
        toast.error('Failed to update notification settings');
      } else {
        toast.success('Notification settings updated');
      }
    } catch (error) {
      toast.error('An unexpected error occurred');
    }
  };

  return (
    <div className="space-y-6">
      {/* Incomplete Profile Alert */}
      {isProfileIncomplete && (
        <div className="px-4 pt-4">
          <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
            <AlertCircle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-800 dark:text-yellow-200">
              Complete your profile to get the most out of Parkway.{' '}
              <button 
                onClick={handleEditClick}
                className="font-semibold underline hover:no-underline"
              >
                Add details now
              </button>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Header with solid blue background */}
      <div className="bg-primary text-primary-foreground p-6 rounded-b-2xl">
        <div className="flex justify-between items-start mb-6">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Profile</h1>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="text-primary-foreground hover:bg-primary-foreground/10">
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="bg-background">
                <DropdownMenuItem 
                  onClick={() => setMode(mode === 'book' ? 'host' : 'book')}
                  className="cursor-pointer"
                >
                  Switch to {mode === 'book' ? 'Host' : 'Book'} Mode
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Button variant="secondary" size="sm" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Profile Info */}
        <div className="flex items-center gap-4 mb-6">
          <div className="relative">
            <Avatar className="h-20 w-20">
              <AvatarImage src={profile?.avatar_url} />
              <AvatarFallback className="text-xl">{getInitials()}</AvatarFallback>
            </Avatar>
            <div className="absolute bottom-0 right-0 bg-background rounded-full p-1">
              <Edit className="h-3 w-3" />
            </div>
          </div>
          
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold">{getDisplayName()}</h2>
            <p className="text-primary-foreground/80 text-sm">Member since {getMemberSince()}</p>
            <div className="flex items-center gap-1 mt-1">
              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              <span className="font-semibold">New</span>
              <span className="text-primary-foreground/80 text-sm">(No reviews yet)</span>
            </div>
          </div>
          
          <Button variant="secondary" size="sm" className="flex-shrink-0" onClick={handleEditClick}>
            <Edit className="h-4 w-4 mr-1" />
            Edit
          </Button>
        </div>
      </div>

      <div className="px-4 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">0</p>
            <p className="text-sm text-muted-foreground">Total Trips</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">New</p>
            <p className="text-sm text-muted-foreground">Rating</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">0</p>
            <p className="text-sm text-muted-foreground">Reviews</p>
          </Card>
        </div>

        {/* Become a Host Widget */}
        {mode === 'book' && (
          <Card className="p-6 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-primary/10 rounded-lg">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg mb-1">Become a Host</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Share your parking spot and earn extra income
                </p>
                <Button 
                  onClick={() => navigate('/list-spot')} 
                  className="w-full"
                >
                  List Your Spot
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Quick Settings */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Quick Settings</h3>
          
          <Card className="p-2">
            <div className="flex justify-between items-center gap-2">
              <div>
                <p className="font-medium text-sm">Booking Updates</p>
                <p className="text-xs text-muted-foreground">Get notified about bookings</p>
              </div>
              <Switch 
                checked={profile?.notification_booking_updates ?? true}
                onCheckedChange={(checked) => handleNotificationToggle('notification_booking_updates', checked)}
              />
            </div>
          </Card>

          <Card className="p-2">
            <div className="flex justify-between items-center gap-2">
              <div>
                <p className="font-medium text-sm">Host Messages</p>
                <p className="text-xs text-muted-foreground">Messages from hosts</p>
              </div>
              <Switch 
                checked={profile?.notification_host_messages ?? true}
                onCheckedChange={(checked) => handleNotificationToggle('notification_host_messages', checked)}
              />
            </div>
          </Card>
        </div>

        {/* Settings Menu */}
        <div className="space-y-3">
          {settingsItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <Card 
                key={index} 
                className="p-4 cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={item.onClick}
              >
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
              </Card>
            );
          })}
        </div>
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
                    <Input
                      id="avatar"
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarChange}
                      className="cursor-pointer"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      PNG, JPG, WEBP up to 5MB
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="first_name">First Name *</Label>
                <Input
                  id="first_name"
                  {...register('first_name')}
                  placeholder="John"
                />
                {errors.first_name && (
                  <p className="text-sm text-destructive">{errors.first_name.message}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="last_name">Last Name *</Label>
                <Input
                  id="last_name"
                  {...register('last_name')}
                  placeholder="Doe"
                />
                {errors.last_name && (
                  <p className="text-sm text-destructive">{errors.last_name.message}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  {...register('phone')}
                  placeholder="+1234567890"
                />
                {errors.phone && (
                  <p className="text-sm text-destructive">{errors.phone.message}</p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsEditDialogOpen(false)}
                disabled={isUpdating}
              >
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
      <ImageCropDialog
        open={isCropDialogOpen}
        imageSrc={tempImageSrc}
        onCropComplete={handleCropComplete}
        onCancel={handleCropCancel}
      />
    </div>
  );
};

export default Profile;