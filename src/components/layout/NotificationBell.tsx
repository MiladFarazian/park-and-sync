import { Bell, Calendar, MessageCircle, AlertTriangle, Check, Clock, CheckCheck } from "lucide-react";
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
import { toast } from "sonner";
import { SwipeableNotificationItem } from "./SwipeableNotificationItem";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  created_at: string;
  related_id: string | null;
}

// Get icon based on notification type
const getNotificationIcon = (type: string) => {
  switch (type) {
    case 'booking':
    case 'booking_pending':
    case 'booking_host':
    case 'booking_approval_required':
    case 'booking_declined':
    case 'booking_rejected':
      return Calendar;
    case 'message':
      return MessageCircle;
    case 'overstay_warning':
    case 'overstay_detected':
    case 'overstay_action_needed':
    case 'overstay_grace_ended':
      return AlertTriangle;
    case 'departure_confirmed':
    case 'overstay_booking_completed':
      return Check;
    case 'booking_ending_soon':
      return Clock;
    default:
      return Bell;
  }
};

// Get icon color based on notification type
const getIconColor = (type: string, isRead: boolean) => {
  if (isRead) return "text-muted-foreground";
  
  switch (type) {
    case 'overstay_warning':
    case 'overstay_detected':
    case 'overstay_action_needed':
    case 'overstay_grace_ended':
      return "text-destructive";
    case 'booking_declined':
    case 'booking_rejected':
      return "text-destructive";
    case 'departure_confirmed':
    case 'overstay_booking_completed':
      return "text-green-600";
    case 'message':
      return "text-primary";
    default:
      return "text-primary";
  }
};

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

  // Optimistic mark as read
  const markAsRead = useCallback(async (notificationId: string) => {
    // Find the notification
    const notification = notifications.find(n => n.id === notificationId);
    if (!notification || notification.read) return;

    // Optimistic update
    setNotifications(prev => 
      prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));

    // Server update
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", notificationId);

    if (error) {
      // Rollback on failure
      fetchNotifications();
      toast.error("Failed to mark notification as read");
    }
  }, [notifications, fetchNotifications]);

  const navigateToNotification = useCallback((notification: Notification) => {
    // Handle navigation based on notification type
    if (notification.type === "booking_declined" || notification.type === "booking_rejected") {
      if (mode === 'host') setMode('driver');
      navigate(`/booking-declined/${notification.related_id}`);
    } else if (notification.type === "booking" || notification.type === "booking_pending") {
      if (mode === 'host') setMode('driver');
      navigate(`/booking-confirmation/${notification.related_id}`);
    } else if (notification.type === "booking_host" || notification.type === "booking_approval_required") {
      if (mode === 'driver') setMode('host');
      navigate(`/host-booking-confirmation/${notification.related_id}`);
    } else if (notification.type === "message") {
      navigate(`/messages`);
    } else if (
      notification.type === "overstay_warning" ||
      notification.type === "overstay_grace_ended"
    ) {
      if (notification.related_id) {
        if (mode === 'host') setMode('driver');
        navigate(`/booking/${notification.related_id}?fromNotification=grace_period`);
      }
    } else if (notification.type === "booking_ending_soon") {
      if (notification.related_id) {
        if (mode === 'host') setMode('driver');
        navigate(`/booking/${notification.related_id}?fromNotification=ending_soon`);
      }
    } else if (
      notification.type === "overstay_detected" ||
      notification.type === "overstay_action_needed"
    ) {
      if (notification.related_id) {
        if (mode === 'driver') setMode('host');
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
      if (notification.related_id) {
        navigate(`/booking/${notification.related_id}`);
      }
    }
  }, [mode, setMode, navigate]);

  const handleNotificationClick = useCallback(async (notification: Notification) => {
    await markAsRead(notification.id);
    navigateToNotification(notification);
    setOpen(false);
  }, [markAsRead, navigateToNotification]);

  // Staggered mark all as read
  const markAllAsRead = useCallback(async () => {
    if (!user) return;
    
    const unreadNotifications = notifications.filter(n => !n.read);
    if (unreadNotifications.length === 0) return;

    // Staggered optimistic animation
    unreadNotifications.forEach((n, i) => {
      setTimeout(() => {
        setNotifications(prev => 
          prev.map(notif => notif.id === n.id ? { ...notif, read: true } : notif)
        );
      }, i * 50); // 50ms stagger for smooth cascade effect
    });
    setUnreadCount(0);

    // Server update
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false);

    if (error) {
      // Rollback on failure
      fetchNotifications();
      toast.error("Failed to mark all as read");
    }
  }, [user, notifications, fetchNotifications]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs animate-scale-in"
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
              className="text-xs gap-1.5 hover:bg-primary/10"
            >
              <CheckCheck className="h-4 w-4" />
              Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="h-[400px]">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Bell className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => {
                const Icon = getNotificationIcon(notification.type);
                const iconColor = getIconColor(notification.type, notification.read);
                
                return (
                  <SwipeableNotificationItem
                    key={notification.id}
                    isRead={notification.read}
                    onMarkAsRead={() => markAsRead(notification.id)}
                    onNavigate={() => handleNotificationClick(notification)}
                  >
                    <button
                      onClick={() => handleNotificationClick(notification)}
                      className={cn(
                        "w-full text-left p-4 hover:bg-accent/50 transition-colors",
                        !notification.read && "bg-accent/30"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        {/* Type-specific icon */}
                        <div className={cn(
                          "mt-0.5 p-1.5 rounded-full transition-all duration-300",
                          !notification.read ? "bg-primary/10" : "bg-muted"
                        )}>
                          <Icon className={cn("h-4 w-4", iconColor)} />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            "text-sm mb-1 transition-all duration-300",
                            !notification.read ? "font-semibold" : "font-medium text-muted-foreground"
                          )}>
                            {notification.title}
                          </p>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {notification.message}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1.5">
                            {formatDistanceToNow(new Date(notification.created_at), {
                              addSuffix: true,
                            })}
                          </p>
                        </div>
                        
                        {/* Animated unread indicator */}
                        {!notification.read && (
                          <div className="w-2.5 h-2.5 bg-primary rounded-full mt-1.5 animate-pulse shadow-sm shadow-primary/50" />
                        )}
                      </div>
                    </button>
                  </SwipeableNotificationItem>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};
