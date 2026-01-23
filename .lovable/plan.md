
## Modernize Notification "Mark as Read" Experience

### Current Problems
1. **Click-only interaction** - Must tap each notification to mark it read, no gesture support
2. **No visual feedback** - The blue unread dot just disappears with no animation
3. **Full refetch after each action** - No optimistic UI updates
4. **No swipe gestures** - Unlike your SwipeableToast, can't swipe to dismiss/mark read
5. **All notifications look identical** - No icons to differentiate types
6. **Dated styling** - Small tap targets, no hover states on the unread indicator

---

### Solution: Modern Notification UX

#### 1. Swipe-to-Mark-Read Gesture
Leverage similar swipe mechanics from SwipeableToast:
- **Swipe left** → Mark as read (with checkmark animation)
- **Swipe right** → Navigate to related content + mark as read
- Haptic feedback on threshold crossing

#### 2. Visual Improvements

| Element | Before | After |
|---------|--------|-------|
| Unread indicator | Small 8px blue dot | Animated pulse + scale-down on read |
| Read transition | Instant disappear | Fade + slide animation |
| Notification icons | None | Type-specific icons (Bell, Calendar, MessageCircle, AlertTriangle, etc.) |
| "Mark all read" | Small text button | Prominent button with checkmark icon |

#### 3. Optimistic Updates
- Immediately update local state before server response
- Animate the change instantly
- Rollback if server fails (with toast error)

#### 4. New Interaction Patterns
- **Tap** → Navigate (existing behavior)  
- **Swipe left** → Mark as read only (stay in dropdown)
- **Long press** (optional) → Show quick actions menu
- **Mark all** → Staggered animation as all items fade

---

### Technical Changes

#### File: `src/components/layout/NotificationBell.tsx`

**Add type-to-icon mapping:**
```typescript
import { Bell, Calendar, MessageCircle, AlertTriangle, Check, Clock } from "lucide-react";

const getNotificationIcon = (type: string) => {
  switch (type) {
    case 'booking':
    case 'booking_pending':
    case 'booking_host':
      return Calendar;
    case 'message':
      return MessageCircle;
    case 'overstay_warning':
    case 'overstay_detected':
      return AlertTriangle;
    case 'departure_confirmed':
      return Check;
    default:
      return Bell;
  }
};
```

**Create SwipeableNotificationItem component:**
- Wrap each notification in swipe-enabled container
- Track `translateX` for swipe progress
- Show checkmark icon when swiping left past threshold
- Trigger optimistic `markAsRead` on swipe completion

**Optimistic updates:**
```typescript
const markAsRead = async (notificationId: string) => {
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
};
```

**Animated "Mark all as read":**
```typescript
const markAllAsRead = async () => {
  // Staggered animation
  notifications.forEach((n, i) => {
    if (!n.read) {
      setTimeout(() => {
        setNotifications(prev => 
          prev.map(notif => notif.id === n.id ? { ...notif, read: true } : notif)
        );
      }, i * 50); // 50ms stagger
    }
  });
  setUnreadCount(0);
  
  // Server update
  await supabase
    .from("notifications")
    .update({ read: true })
    .eq("user_id", user.id)
    .eq("read", false);
};
```

**Animated unread indicator:**
```tsx
{!notification.read && (
  <div className="w-2 h-2 bg-primary rounded-full mt-1 animate-pulse" />
)}
```

---

### Files to Modify

| File | Changes |
|------|---------|
| `src/components/layout/NotificationBell.tsx` | Add swipe support, icons, optimistic updates, animations |
| `src/components/layout/SwipeableNotificationItem.tsx` | New component for swipeable notification row |

---

### Expected UX Flow

1. **User opens notification dropdown** → Sees icons next to each notification type
2. **User swipes a notification left** → Checkmark appears, haptic fires, item fades to read state
3. **User taps "Mark all read"** → All unread items animate in sequence
4. **User taps a notification** → Navigates + marks read (existing behavior)

This brings the notification experience in line with modern iOS/Android patterns.
