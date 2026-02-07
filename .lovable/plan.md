

## Fix: Pre-Booking Messages Not Showing in Messages Tab

### Problem
When a driver sends a message to a host before booking their spot (using the "Message" button on the spot detail page), neither the driver nor the host can see that message in their Messages tab.

### Root Cause
The Messages tab filters conversations based on **booking relationships only**. It builds a list of "relevant user IDs" by looking at bookings -- in driver mode, it finds hosts of spots you've booked; in host mode, it finds renters who've booked your spots. Any message thread with a user who isn't in that booking-based list gets silently hidden.

So when a driver messages a host before making a booking, the message is saved to the database, but both users' conversation lists skip it because there's no booking linking them.

### Solution
Expand the "relevant user IDs" logic to also include users who have an existing message thread with the current user, regardless of whether a booking exists.

### Technical Details

**File: `src/contexts/MessagesContext.tsx`**

Update the `fetchRelevantUserIds` function to also query the `messages` table for any existing conversation partners. This ensures that any thread with at least one message always appears, while still maintaining mode-based filtering for booking context display.

The change will:

1. In the `fetchRelevantUserIds` function, after fetching booking-based IDs, also query the `messages` table for distinct conversation partners
2. Merge those partner IDs into the `relevantIds` set
3. This way, pre-booking conversations show up alongside booking-related ones

The query will be something like:
```sql
-- Get all users who have exchanged messages with current user
SELECT DISTINCT sender_id, recipient_id 
FROM messages 
WHERE sender_id = current_user OR recipient_id = current_user
```

Then extract the partner IDs and add them to the relevant set.

### Impact
- Pre-booking messages will now appear in both the driver's and host's Messages tabs
- Booking-related context headers will still only show for conversations that have associated bookings
- No changes needed to message sending, which already works correctly
- Minimal performance impact since this is a single additional query during conversation loading

### Files to Modify

| File | Change |
|------|--------|
| `src/contexts/MessagesContext.tsx` | Update `fetchRelevantUserIds` to include message-thread partners alongside booking-based partners |

