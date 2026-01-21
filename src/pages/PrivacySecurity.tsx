import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Shield, Lock, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { ChangePasswordDialog } from "@/components/settings/ChangePasswordDialog";
import { TwoFactorAuthDialog } from "@/components/settings/TwoFactorAuthDialog";
import { PrivacySettingsDialog } from "@/components/settings/PrivacySettingsDialog";

const PrivacySecurity = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [twoFactorOpen, setTwoFactorOpen] = useState(false);
  const [privacySettingsOpen, setPrivacySettingsOpen] = useState(false);

  const securityOptions = [
    {
      icon: Lock,
      title: "Change Password",
      description: "Update your account password",
      action: () => setChangePasswordOpen(true),
    },
    {
      icon: Shield,
      title: "Two-Factor Authentication",
      description: "Add an extra layer of security",
      action: () => setTwoFactorOpen(true),
    },
    {
      icon: Eye,
      title: "Privacy Settings",
      description: "Control who can see your information",
      action: () => setPrivacySettingsOpen(true),
    },
  ];

  return (
    <div className="bg-background">
      <div className="container max-w-2xl mx-auto p-4 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/profile")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Privacy & Security</h1>
            <p className="text-muted-foreground">Account security settings</p>
          </div>
        </div>

        <div className="space-y-4">
          {securityOptions.map((option, index) => {
            const Icon = option.icon;
            return (
              <Card 
                key={index} 
                className="p-6 cursor-pointer active:bg-accent/50 transition-colors touch-scroll-safe" 
                onClick={option.action}
                onMouseDown={e => e.preventDefault()}
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-muted">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{option.title}</p>
                    <p className="text-sm text-muted-foreground">{option.description}</p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        <Card className="p-6">
          <h3 className="font-semibold mb-4">Account Verification Status</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm">Email Verification</span>
              <span className={`text-sm ${user?.email_confirmed_at ? 'text-green-600' : 'text-muted-foreground'}`}>
                {user?.email_confirmed_at ? 'Verified' : 'Not Verified'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">Phone Verification</span>
              <span className={`text-sm ${user?.phone_confirmed_at ? 'text-green-600' : 'text-muted-foreground'}`}>
                {user?.phone_confirmed_at ? 'Verified' : 'Not Verified'}
              </span>
            </div>
          </div>
        </Card>

        <ChangePasswordDialog 
          open={changePasswordOpen} 
          onOpenChange={setChangePasswordOpen} 
        />
        <TwoFactorAuthDialog 
          open={twoFactorOpen} 
          onOpenChange={setTwoFactorOpen} 
        />
        <PrivacySettingsDialog 
          open={privacySettingsOpen} 
          onOpenChange={setPrivacySettingsOpen} 
        />
      </div>
    </div>
  );
};

export default PrivacySecurity;
