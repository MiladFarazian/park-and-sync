import React from 'react';
import { Bell, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useNotifications } from '@/hooks/useNotifications';
import { useState, useEffect } from 'react';

const NotificationPermissionBanner = () => {
  const { permission, isSupported, requestPermission } = useNotifications();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if user has previously dismissed
    const wasDismissed = localStorage.getItem('notificationBannerDismissed');
    if (wasDismissed) {
      setDismissed(true);
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('notificationBannerDismissed', 'true');
  };

  const handleEnable = async () => {
    const granted = await requestPermission();
    if (granted) {
      setDismissed(true);
      localStorage.setItem('notificationBannerDismissed', 'true');
    }
  };

  if (!isSupported || permission === 'granted' || permission === 'denied' || dismissed) {
    return null;
  }

  return (
    <div className="w-full p-4 border-b bg-background">
      <Alert className="max-w-2xl mx-auto bg-accent text-accent-foreground border-accent">
        <Bell className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between gap-4">
          <span className="flex-1">
            <strong>Stay updated!</strong> Enable notifications to get instant alerts for bookings, messages, and important updates.
          </span>
          <div className="flex gap-2 items-center">
            <Button 
              size="sm" 
              onClick={handleEnable}
              className="whitespace-nowrap"
            >
              Enable Notifications
            </Button>
            <Button 
              size="sm" 
              variant="ghost" 
              onClick={handleDismiss}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
};

export default NotificationPermissionBanner;
