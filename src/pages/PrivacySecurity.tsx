import { useNavigate } from "react-router-dom";
import { ArrowLeft, Shield, Lock, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";

const PrivacySecurity = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const securityOptions = [
    {
      icon: Lock,
      title: "Change Password",
      description: "Update your account password",
      action: () => {},
    },
    {
      icon: Shield,
      title: "Two-Factor Authentication",
      description: "Add an extra layer of security",
      action: () => {},
    },
    {
      icon: Eye,
      title: "Privacy Settings",
      description: "Control who can see your information",
      action: () => {},
    },
  ];

  return (
    <div className="bg-background">
      <div className="container max-w-2xl mx-auto p-4 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
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
              <Card key={index} className="p-6 cursor-pointer hover:bg-accent/50 transition-colors" onClick={option.action}>
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
              <span className={`text-sm ${profile?.email_verified ? 'text-green-600' : 'text-muted-foreground'}`}>
                {profile?.email_verified ? 'Verified' : 'Not Verified'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">Phone Verification</span>
              <span className={`text-sm ${profile?.phone_verified ? 'text-green-600' : 'text-muted-foreground'}`}>
                {profile?.phone_verified ? 'Verified' : 'Not Verified'}
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default PrivacySecurity;
