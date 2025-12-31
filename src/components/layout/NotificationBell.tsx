import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { useMode } from "@/contexts/ModeContext";
import { useAuth } from "@/contexts/AuthContext";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  created_at: string;
  related_id: string | null;
}

export const NotificationBell = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { mode, setMode } = useMode();
  const { user } = useAuth();
  const channelRef = useRef<any>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (!error && data) {
      setNotifications(data);
      setUnreadCount(data.filter((n) => !n.read).length);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    // Initial fetch
    fetchNotifications();

    // Set up realtime subscription with user filter
    const channelName = `notifications-${user.id}-${Date.now()}`;
    channelRef.current = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('[NotificationBell] Realtime update:', payload.eventType);
          fetchNotifications();
        }
      )
      .subscribe((status) => {
        console.log('[NotificationBell] Subscription status:', status);
      });

    // Polling fallback every 10 seconds for reliability
    pollingRef.current = setInterval(() => {
      fetchNotifications();
    }, 10000);

    // Refresh on visibility change (when user returns to tab)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchNotifications();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Refresh on window focus
    const handleFocus = () => {
      fetchNotifications();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [user, fetchNotifications]);

  const markAsRead = async (notificationId: string) => {
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", notificationId);

    fetchNotifications();
  };

  const handleNotificationClick = async (notification: Notification) => {
    await markAsRead(notification.id);

    // Handle navigation based on notification type
    if (notification.type === "booking" || notification.type === "booking_pending") {
      // Driver booking confirmation - switch to driver mode if needed
      if (mode === 'host') {
        setMode('driver');
      }
      navigate(`/booking-confirmation/${notification.related_id}`);
    } else if (notification.type === "booking_host" || notification.type === "booking_approval_required") {
      // Host booking confirmation - switch to host mode if needed
      if (mode === 'driver') {
        setMode('host');
      }
      navigate(`/host-booking-confirmation/${notification.related_id}`);
    } else if (notification.type === "message") {
      navigate(`/messages`);
    } else if (
      notification.type === "overstay_warning" ||
      notification.type === "overstay_grace_ended"
    ) {
      // Grace period notifications - deep-link with fromNotification param
      if (notification.related_id) {
        if (mode === 'host') {
          setMode('driver');
        }
        navigate(`/booking/${notification.related_id}?fromNotification=grace_period`);
      }
    } else if (notification.type === "booking_ending_soon") {
      // 15-minute warning - deep-link with fromNotification param
      if (notification.related_id) {
        if (mode === 'host') {
          setMode('driver');
        }
        navigate(`/booking/${notification.related_id}?fromNotification=ending_soon`);
      }
    } else if (
      notification.type === "overstay_detected" ||
      notification.type === "overstay_action_needed"
    ) {
      // Host overstay notifications - deep-link to booking detail
      if (notification.related_id) {
        if (mode === 'driver') {
          setMode('host');
        }
        navigate(`/booking/${notification.related_id}?fromNotification=overstay_host`);
      }
    } else if (
      notification.type === "overstay_charge_applied" ||
      notification.type === "overstay_charge_finalized" ||
      notification.type === "overstay_charge_update" ||
      notification.type === "overstay_charging" ||
      notification.type === "overstay_towing" ||
      notification.type === "overstay_booking_completed" ||
      notification.type === "departure_confirmed"
    ) {
      // Navigate to booking detail for other overstay-related notifications
      if (notification.related_id) {
        navigate(`/booking/${notification.related_id}`);
      }
    }

    setOpen(false);
  };

  const markAllAsRead = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false);

    fetchNotifications();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllAsRead}
              className="text-xs"
            >
              Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="h-[400px]">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No notifications yet
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <button
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`w-full text-left p-4 hover:bg-accent transition-colors ${
                    !notification.read ? "bg-accent/50" : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm mb-1">
                        {notification.title}
                      </p>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {notification.message}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(notification.created_at), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                    {!notification.read && (
                      <div className="w-2 h-2 bg-primary rounded-full mt-1" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};
