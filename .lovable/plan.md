

# Plan: Demand-Driven Host Availability Notification System

## Overview

This feature implements an intelligent notification system that alerts nearby hosts when drivers search for parking and find zero available spots within 0.5 miles. When hosts update their availability in response, their spots automatically appear on the driver's map in real-time.

## Architecture

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DRIVER SEARCH FLOW                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Driver searches → Zero spots in 0.5mi → Trigger notification flow         │
│         │                                                                   │
│         ▼                                                                   │
│   ┌─────────────────────────────────────────────────────────────────┐      │
│   │  search-spots-lite (modified)                                    │      │
│   │  - Check if 0 spots within 0.5mi (0.804km)                      │      │
│   │  - If yes, call notify-hosts-demand edge function               │      │
│   │  - Return special flag: { demand_notification_sent: true }       │      │
│   └─────────────────────────────────────────────────────────────────┘      │
│                                                                             │
│   Driver map shows:                                                         │
│   "Hosts nearby have been notified to update their availability..."         │
│   + loading indicator for 30-60 seconds                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         HOST NOTIFICATION FLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   notify-hosts-demand edge function:                                        │
│                                                                             │
│   1. Find eligible hosts:                                                   │
│      - Has active spot within 0.75mi (1.2km)                               │
│      - NOT marked unavailable for today (calendar_overrides)                │
│      - NOT already updated availability today (calendar_overrides)          │
│      - NOT already received this notification today (suppression table)     │
│                                                                             │
│   2. For each eligible host:                                                │
│      - Send push notification via send-push-notification                    │
│      - Insert row into demand_notifications_sent table                      │
│                                                                             │
│   3. Return count of hosts notified                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         REAL-TIME UPDATE FLOW                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   When host saves availability:                                             │
│                                                                             │
│   1. ManageAvailability.tsx saves to calendar_overrides                     │
│   2. Database trigger fires → Broadcasts to Supabase channel                │
│      Channel: "availability-updates:{searchSessionId}"                      │
│                                                                             │
│   3. Explore.tsx listens to channel:                                        │
│      - Receives spot_id of updated spot                                     │
│      - Re-fetches spot data from search-spots-lite                          │
│      - If spot now matches search criteria → Adds to map + list             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Technical Components

### 1. New Database Table: `demand_notifications_sent`

Tracks which hosts have been notified to prevent duplicate notifications within the same day.

```sql
CREATE TABLE public.demand_notifications_sent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL,
  notification_date DATE NOT NULL DEFAULT CURRENT_DATE,
  search_location GEOGRAPHY(POINT, 4326) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Unique constraint: one notification per host per day
  CONSTRAINT unique_host_per_day UNIQUE (host_id, notification_date)
);

-- Index for efficient lookups
CREATE INDEX idx_demand_notifications_host_date 
  ON demand_notifications_sent(host_id, notification_date);

-- RLS: Only service role can insert/read
ALTER TABLE demand_notifications_sent ENABLE ROW LEVEL SECURITY;
```

### 2. New Edge Function: `notify-hosts-demand`

Internal function called by `search-spots-lite` when no spots are found.

**Eligibility Logic:**
1. Query `spots` table for active spots within 0.75 miles (1.2km) of search location
2. Exclude spots where host has a `calendar_override` for today with `is_available = false` (full day block)
3. Exclude spots where host has ANY `calendar_override` for today (already updated)
4. Exclude hosts already in `demand_notifications_sent` for today
5. For remaining hosts, send push notification with deep-link to `/manage-availability?date={today}`

**Notification Content:**
- Title: "Drivers searching nearby!"
- Body: "Update your availability today to earn. Tap to manage your spot."
- URL: `/manage-availability?date=2026-01-27`
- Type: `demand_availability`

### 3. Modify `search-spots-lite` Edge Function

Add logic to detect zero-spot scenarios and trigger host notifications:

```typescript
// After filtering spots by distance and availability
if (spotsWithDistance.length === 0 && radius <= HALF_MILE_METERS) {
  // Trigger background notification to hosts
  EdgeRuntime.waitUntil(notifyNearbyHosts(supabase, latitude, longitude, start_time, end_time));
  
  // Return flag to frontend
  return new Response(JSON.stringify({
    spots: [],
    demand_notification_sent: true,
    notification_timeout_seconds: 45
  }), { ... });
}
```

### 4. Frontend Changes: `Explore.tsx`

**Display notification banner when `demand_notification_sent: true`:**

```typescript
// State for demand notification UI
const [showDemandNotificationBanner, setShowDemandNotificationBanner] = useState(false);
const [demandNotificationTimeout, setDemandNotificationTimeout] = useState<number>(0);

// In fetchNearbySpots response handling:
if (data.demand_notification_sent) {
  setShowDemandNotificationBanner(true);
  setDemandNotificationTimeout(data.notification_timeout_seconds || 45);
  
  // Auto-hide after timeout
  setTimeout(() => {
    setShowDemandNotificationBanner(false);
  }, (data.notification_timeout_seconds || 45) * 1000);
}
```

**Banner UI Component:**
```typescript
{showDemandNotificationBanner && (
  <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-parkzy-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 max-w-md">
    <Loader2 className="h-5 w-5 animate-spin" />
    <p className="text-sm">
      Hosts nearby have been notified to update their availability to provide you with more options.
    </p>
  </div>
)}
```

### 5. Real-Time Spot Updates via Supabase Broadcast

**Subscribe to availability updates in Explore.tsx:**

```typescript
useEffect(() => {
  if (!searchLocation || !showDemandNotificationBanner) return;
  
  // Create unique session ID for this search
  const searchSessionId = `demand-${searchLocation.lat.toFixed(4)}-${searchLocation.lng.toFixed(4)}`;
  
  const channel = supabase
    .channel(`availability-updates:${searchSessionId}`)
    .on('broadcast', { event: 'spot_available' }, async (payload) => {
      const { spot_id } = payload.payload;
      
      // Re-fetch this specific spot to check if it matches our search
      const { data } = await supabase.functions.invoke('search-spots-lite', {
        body: {
          latitude: searchLocation.lat,
          longitude: searchLocation.lng,
          radius: HALF_MILE_METERS,
          start_time: startTime?.toISOString(),
          end_time: endTime?.toISOString(),
          spot_ids: [spot_id] // Filter to just this spot
        }
      });
      
      if (data?.spots?.length > 0) {
        // Transform and add to map
        const newSpot = transformSpot(data.spots[0]);
        setParkingSpots(prev => [...prev, newSpot]);
        
        toast.success('New parking spot available!');
      }
    })
    .subscribe();
    
  return () => supabase.removeChannel(channel);
}, [searchLocation, showDemandNotificationBanner, startTime, endTime]);
```

### 6. Broadcast on Availability Save: `ManageAvailability.tsx`

After successfully saving a calendar override, broadcast to notify waiting drivers:

```typescript
// In handleSave, after successful database insert:
const savedDate = format(selectedDates[0], 'yyyy-MM-dd');
const today = format(new Date(), 'yyyy-MM-dd');

if (savedDate === today && availabilityMode !== 'unavailable') {
  // Get spot coordinates for the broadcast key
  for (const spotId of selectedSpots) {
    const spot = spots.find(s => s.id === spotId);
    if (spot) {
      // Broadcast to all nearby searches
      const broadcastKey = `demand-${spot.latitude?.toFixed(4)}-${spot.longitude?.toFixed(4)}`;
      const channel = supabase.channel(`availability-updates:${broadcastKey}`);
      await channel.send({
        type: 'broadcast',
        event: 'spot_available',
        payload: { spot_id: spotId }
      });
      supabase.removeChannel(channel);
    }
  }
}
```

**Note:** Since spots may be searched from various locations, we'll need a regional broadcast approach. A simpler alternative is to broadcast on a global channel and let the frontend filter by distance.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/XXXX_demand_notifications.sql` | Create | New table for notification suppression |
| `supabase/functions/notify-hosts-demand/index.ts` | Create | New edge function for host notifications |
| `supabase/functions/search-spots-lite/index.ts` | Modify | Add zero-spot detection and notification trigger |
| `supabase/config.toml` | Modify | Add config for new edge function (internal) |
| `src/pages/Explore.tsx` | Modify | Add demand notification banner and real-time subscription |
| `src/pages/ManageAvailability.tsx` | Modify | Add broadcast on availability save |
| `src/components/map/MapView.tsx` | Modify | Pass through demand notification state (if needed for overlay) |

## Suppression Rules Summary

| Condition | Outcome |
|-----------|---------|
| Host has `calendar_override` with `is_available = false` for today | Do NOT notify |
| Host has ANY `calendar_override` for today (updated availability) | Do NOT notify |
| Host already in `demand_notifications_sent` for today | Do NOT notify |
| Host's spot is not `status = 'active'` | Do NOT notify |
| Host's spot is > 0.75 miles from search | Do NOT notify |

## MVP Fixed Parameters

| Parameter | Value |
|-----------|-------|
| Driver search radius (trigger) | 0.5 miles (804 meters) |
| Host notification radius | 0.75 miles (1,207 meters) |
| Notification scope | Same day only |
| Max notifications per host per day | 1 |
| Banner display timeout | 45 seconds |

## Edge Cases

1. **Multiple drivers searching simultaneously**: Each triggers separate notifications, but hosts only receive one per day due to suppression table
2. **Host opens notification late**: Deep-link still works; if day has passed, they land on current date
3. **Host marks unavailable after receiving notification**: Fine - they simply won't appear on driver's map
4. **Driver refreshes/navigates away**: Banner state resets; spots still appear if host updates

## Security Considerations

- `notify-hosts-demand` is internal-only (verify_jwt = false, validates service role key)
- `demand_notifications_sent` table has RLS enabled, only service role can access
- No user data exposed; only aggregated "hosts were notified" flag returned to drivers

