import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface PrivacySettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PrivacySettings {
  privacy_show_profile_photo: boolean;
  privacy_show_full_name: boolean;
  privacy_show_in_reviews: boolean;
}

export const PrivacySettingsDialog = ({ open, onOpenChange }: PrivacySettingsDialogProps) => {
  const { user, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<PrivacySettings>({
    privacy_show_profile_photo: true,
    privacy_show_full_name: true,
    privacy_show_in_reviews: true,
  });

  useEffect(() => {
    if (open && user) {
      fetchPrivacySettings();
    }
  }, [open, user]);

  const fetchPrivacySettings = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (error) throw error;

      if (data) {
        const profileData = data as any;
        setSettings({
          privacy_show_profile_photo: profileData.privacy_show_profile_photo ?? true,
          privacy_show_full_name: profileData.privacy_show_full_name ?? true,
          privacy_show_in_reviews: profileData.privacy_show_in_reviews ?? true,
        });
      }
    } catch (error: any) {
      console.error("Error fetching privacy settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          privacy_show_profile_photo: settings.privacy_show_profile_photo,
          privacy_show_full_name: settings.privacy_show_full_name,
          privacy_show_in_reviews: settings.privacy_show_in_reviews,
        } as any)
        .eq("user_id", user.id);

      if (error) throw error;

      await refreshProfile();
      
      toast({
        title: "Settings Saved",
        description: "Your privacy settings have been updated.",
      });
      
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save settings.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleSetting = (key: keyof PrivacySettings) => {
    setSettings((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Privacy Settings</DialogTitle>
          <DialogDescription>
            Control what information is visible to other users.
          </DialogDescription>
        </DialogHeader>
        
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6 py-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="show-photo">Show Profile Photo</Label>
                <p className="text-sm text-muted-foreground">
                  Allow others to see your profile picture
                </p>
              </div>
              <Switch
                id="show-photo"
                checked={settings.privacy_show_profile_photo}
                onCheckedChange={() => toggleSetting("privacy_show_profile_photo")}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="show-name">Show Full Name</Label>
                <p className="text-sm text-muted-foreground">
                  Display your full name instead of initials
                </p>
              </div>
              <Switch
                id="show-name"
                checked={settings.privacy_show_full_name}
                onCheckedChange={() => toggleSetting("privacy_show_full_name")}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="show-reviews">Appear in Reviews</Label>
                <p className="text-sm text-muted-foreground">
                  Let your name appear in public reviews
                </p>
              </div>
              <Switch
                id="show-reviews"
                checked={settings.privacy_show_in_reviews}
                onCheckedChange={() => toggleSetting("privacy_show_in_reviews")}
              />
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            className="flex-1"
            onClick={handleSave}
            disabled={loading || saving}
          >
            {saving ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
