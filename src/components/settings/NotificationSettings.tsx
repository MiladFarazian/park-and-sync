import React from 'react';
import { Bell, BellOff } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNotifications } from '@/hooks/useNotifications';

const NotificationSettings = () => {
  const { permission, isSupported, requestPermission } = useNotifications();

  if (!isSupported) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-3 text-muted-foreground">
          <BellOff className="h-5 w-5" />
          <div>
            <p className="font-medium">Notifications Not Supported</p>
            <p className="text-sm">Your browser doesn't support push notifications</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bell className="h-5 w-5 text-primary" />
            <div>
              <p className="font-semibold">Push Notifications</p>
              <p className="text-sm text-muted-foreground">
                Get instant alerts for bookings, messages, and updates
              </p>
            </div>
          </div>
          {permission === 'granted' && (
            <Badge variant="default" className="bg-green-500">
              Enabled
            </Badge>
          )}
          {permission === 'denied' && (
            <Badge variant="destructive">
              Blocked
            </Badge>
          )}
          {permission === 'default' && (
            <Badge variant="secondary">
              Not Set
            </Badge>
          )}
        </div>

        {permission !== 'granted' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Enable notifications to receive:
            </p>
            <ul className="text-sm space-y-1 ml-4 list-disc text-muted-foreground">
              <li>New booking confirmations</li>
              <li>Booking cancellations and updates</li>
              <li>New messages from hosts or drivers</li>
              <li>Overstay warnings and alerts</li>
              <li>Payment confirmations</li>
            </ul>

            {permission === 'default' && (
              <Button onClick={requestPermission} className="w-full">
                <Bell className="h-4 w-4 mr-2" />
                Enable Notifications
              </Button>
            )}

            {permission === 'denied' && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm">
                <p className="font-medium text-destructive mb-1">
                  Notifications are blocked
                </p>
                <p className="text-muted-foreground">
                  To enable notifications, please update your browser settings:
                </p>
                <ol className="mt-2 ml-4 list-decimal space-y-1 text-muted-foreground">
                  <li>Click the lock icon in your address bar</li>
                  <li>Find "Notifications" in the permissions list</li>
                  <li>Change it to "Allow"</li>
                  <li>Refresh this page</li>
                </ol>
              </div>
            )}
          </div>
        )}

        {permission === 'granted' && (
          <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
            <p className="text-sm text-green-700 dark:text-green-400">
              ✅ You're all set! You'll receive notifications for important updates.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
};

export default NotificationSettings;
