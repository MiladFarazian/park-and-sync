import React from 'react';
import { Bell, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNotifications } from '@/hooks/useNotifications';
import { useState, useEffect } from 'react';

const NotificationPermissionBanner = () => {
  const { permission, isSupported, requestPermission } = useNotifications();
  const [dismissed, setDismissed] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if user has previously dismissed
    const wasDismissed = localStorage.getItem('notificationBannerDismissed');
    if (wasDismissed) {
      setDismissed(true);
    } else {
      // Delay showing to avoid flash on load
      const timer = setTimeout(() => setIsVisible(true), 500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(() => {
      setDismissed(true);
      localStorage.setItem('notificationBannerDismissed', 'true');
    }, 300);
  };

  const handleEnable = async () => {
    const granted = await requestPermission();
    setIsVisible(false);
    setTimeout(() => {
      setDismissed(true);
      localStorage.setItem('notificationBannerDismissed', 'true');
    }, 300);
  };

  if (!isSupported || permission === 'granted' || permission === 'denied' || dismissed) {
    return null;
  }

  return (
    <div 
      className={`fixed bottom-20 left-4 right-4 z-50 md:left-auto md:right-6 md:bottom-6 md:max-w-sm transition-all duration-300 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
      }`}
    >
      <div className="bg-card border border-border rounded-xl shadow-lg p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-foreground text-sm">Stay updated!</h4>
            <p className="text-muted-foreground text-xs mt-0.5">
              Enable notifications to get instant alerts for bookings and messages.
            </p>
            <div className="flex gap-2 mt-3">
              <Button 
                size="sm" 
                onClick={handleEnable}
                className="text-xs h-8"
              >
                Enable
              </Button>
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={handleDismiss}
                className="text-xs h-8"
              >
                Not now
              </Button>
            </div>
          </div>
          <button 
            onClick={handleDismiss}
            className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotificationPermissionBanner;
