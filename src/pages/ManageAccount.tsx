import { useNavigate } from "react-router-dom";
import { Upload, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useMode } from "@/contexts/ModeContext";
import ModeSwitcher from "@/components/layout/ModeSwitcher";
import parkzyLogo from "@/assets/parkzy-logo.png";
import { supabase } from "@/integrations/supabase/client";
import { ImageCropDialog } from "@/components/profile/ImageCropDialog";

const ManageAccount = () => {
  const navigate = useNavigate();
  const { profile, updateProfile, signOut } = useAuth();
  const [formData, setFormData] = useState({
    first_name: profile?.first_name || "",
    last_name: profile?.last_name || "",
    email: profile?.email || "",
    phone: profile?.phone || "",
  });
  const [avatarFile, setAvatarFile] = useState<Blob | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>('');
  const [isCropDialogOpen, setIsCropDialogOpen] = useState(false);
  const [tempImageSrc, setTempImageSrc] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (profile) {
      setFormData({
        first_name: profile.first_name || "",
        last_name: profile.last_name || "",
        email: profile.email || "",
        phone: profile.phone || "",
      });
      setAvatarPreview(profile.avatar_url || '');
    }
  }, [profile]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('File size must be less than 5MB');
        return;
      }
      
      if (!file.type.startsWith('image/')) {
        toast.error('Only image files are allowed');
        return;
      }
      
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
    if (!avatarFile || !profile?.user_id) return null;

    try {
      if (profile?.avatar_url) {
        const oldPath = profile.avatar_url.split('/').slice(-2).join('/');
        await supabase.storage.from('avatars').remove([oldPath]);
      }

      const filePath = `${profile.user_id}/avatar.jpg`;
      
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, avatarFile, { 
          upsert: true,
          contentType: 'image/jpeg'
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      return data.publicUrl;
    } catch (error: any) {
      toast.error('Failed to upload avatar: ' + error.message);
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdating(true);
    try {
      let avatar_url = profile?.avatar_url;
      
      if (avatarFile) {
        const uploadedUrl = await uploadAvatar();
        if (uploadedUrl) {
          avatar_url = uploadedUrl;
        }
      }

      // If email is being added/changed, update auth.users first
      const isAddingEmail = formData.email && formData.email !== profile?.email;
      if (isAddingEmail) {
        const { error: authError } = await supabase.auth.updateUser({
          email: formData.email,
        });
        
        if (authError) {
          toast.error("Failed to update email: " + authError.message);
          setIsUpdating(false);
          return;
        }
        
        toast.info("Please check your email to confirm the change");
      }

      const { error } = await updateProfile({
        ...formData,
        avatar_url,
      });
      
      if (error) {
        toast.error("Failed to update profile");
      } else {
        toast.success("Profile updated successfully");
        setAvatarFile(null);
      }
    } catch (error) {
      toast.error("An unexpected error occurred");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') {
      toast.error('Please type DELETE to confirm');
      return;
    }

    setIsDeleting(true);
    try {
      const { error } = await supabase.functions.invoke('delete-account');
      
      if (error) throw error;

      toast.success('Account deleted successfully');
      await signOut();
      navigate('/');
    } catch (error: any) {
      console.error('Error deleting account:', error);
      toast.error('Failed to delete account: ' + error.message);
    } finally {
      setIsDeleting(false);
      setIsDeleteDialogOpen(false);
    }
  };

  const getInitials = () => {
    if (profile?.first_name && profile?.last_name) {
      return `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase();
    }
    if (profile?.email) {
      return profile.email[0].toUpperCase();
    }
    if (profile?.phone) {
      return 'P';
    }
    return 'U';
  };

  const { mode, setMode } = useMode();

  const handleLogoClick = () => {
    if (mode === 'host') {
      setMode('driver');
    }
    navigate('/');
  };

  return (
    <div className="bg-background">
      {/* Header with logo and mode toggle */}
      <div className="sticky top-0 z-50 bg-background border-b">
        <div className="container max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={handleLogoClick} className="flex items-center">
            <img src={parkzyLogo} alt="Parkzy" className="h-8" />
          </button>
          <ModeSwitcher />
        </div>
      </div>

      <div className="container max-w-2xl mx-auto p-4 space-y-6 pb-20">
        {/* Page subheading */}
        <div>
          <h1 className="text-2xl font-bold">Account</h1>
          <p className="text-muted-foreground">Update your profile and settings</p>
        </div>

        <form onSubmit={handleSubmit}>
          <Card className="p-6 space-y-6">
            {/* Profile Picture Section */}
            <div className="space-y-4">
              <Label>Profile Picture</Label>
              <div className="flex items-center gap-4">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={avatarPreview} />
                  <AvatarFallback>{getInitials()}</AvatarFallback>
                </Avatar>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => document.getElementById('avatar-upload')?.click()}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload
                  </Button>
                  <input
                    id="avatar-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                </div>
              </div>
            </div>

            {/* Personal Information */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="first_name">First Name</Label>
                  <Input
                    id="first_name"
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">Last Name</Label>
                  <Input
                    id="last_name"
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={isUpdating}>
              {isUpdating ? "Saving..." : "Save Changes"}
            </Button>
          </Card>
        </form>

        {/* Delete Account Section */}
        <Card className="p-6">
          <h3 className="font-semibold text-lg mb-2">Delete Account</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Once you delete your account, there is no going back. Please be certain.
          </p>
          <Button
            variant="destructive"
            onClick={() => setIsDeleteDialogOpen(true)}
            className="w-full"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Account
          </Button>
        </Card>
      </div>

      {/* Image Crop Dialog */}
      <ImageCropDialog
        open={isCropDialogOpen}
        imageSrc={tempImageSrc}
        onCropComplete={handleCropComplete}
        onCancel={handleCropCancel}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Account</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete your account and remove all your data from our servers.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              To confirm deletion, please type <span className="font-semibold">DELETE</span> below:
            </p>
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type DELETE to confirm"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsDeleteDialogOpen(false);
                setDeleteConfirmText('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={isDeleting || deleteConfirmText !== 'DELETE'}
            >
              {isDeleting ? 'Deleting...' : 'Delete Account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ManageAccount;
