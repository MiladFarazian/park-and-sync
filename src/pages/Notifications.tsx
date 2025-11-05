import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const Notifications = () => {
  const navigate = useNavigate();
  const { profile, updateProfile } = useAuth();

  const handleToggle = async (field: 'notification_booking_updates' | 'notification_host_messages', value: boolean) => {
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
    <div className="bg-background">
      <div className="container max-w-2xl mx-auto p-4 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Notifications</h1>
            <p className="text-muted-foreground">Manage your preferences</p>
          </div>
        </div>

        <div className="space-y-4">
          <Card className="p-6">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-medium">Booking Updates</p>
                <p className="text-sm text-muted-foreground">Get notified about booking status changes</p>
              </div>
              <Switch 
                checked={profile?.notification_booking_updates ?? true}
                onCheckedChange={(checked) => handleToggle('notification_booking_updates', checked)}
              />
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-medium">Host Messages</p>
                <p className="text-sm text-muted-foreground">Receive messages from hosts</p>
              </div>
              <Switch 
                checked={profile?.notification_host_messages ?? true}
                onCheckedChange={(checked) => handleToggle('notification_host_messages', checked)}
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Notifications;
