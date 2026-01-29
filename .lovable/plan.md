
# Support App: Back Button & Booking Details Fix

## Overview

Two issues need to be resolved for the Support version of the app:

1. **Back button for `/support-user` routes** - Ensure reliable navigation
2. **Booking Details accuracy** - Show both Driver AND Host correctly for Support users

---

## Issue 1: Back Button Navigation

### Current State
The back button in `SupportUserDetail.tsx` uses `navigate(-1)` which relies on browser history. This works when there's history, but may fail if:
- Support user directly lands on a `/support-user/:id` URL
- The redirect from disallowed routes clears history

### Solution
Add a fallback route when `navigate(-1)` has no history to go back to. Use `/support-reservations` as the default fallback since that's the most common origin for viewing user details.

**File: `src/pages/SupportUserDetail.tsx`**

```text
Lines 257 and 244 - Update back button handlers:

Current:
onClick={() => navigate(-1)}

Updated:
onClick={() => {
  if (window.history.length > 1) {
    navigate(-1);
  } else {
    navigate('/support-reservations');
  }
}}
```

---

## Issue 2: Booking Details - Accurate Driver/Host Display for Support

### Current Problem
When a Support user views a booking:
- `isHost` = `user?.id === booking.spots.host_id` evaluates to `false` (Support isn't the host)
- The page shows only ONE user card labeled "Host"
- BUT it displays the **renter's profile** (`profiles!bookings_renter_id_fkey`) incorrectly labeled as "Host"
- The actual Host's information is never fetched or displayed

### Solution

**Part A: Fetch Host Profile**

Update the Supabase query to also fetch the host's profile via the spots relationship.

**File: `src/pages/BookingDetail.tsx`**

```text
1. Update BookingDetails interface (add host_profile):

interface BookingDetails {
  // ... existing fields ...
  spots: {
    // ... existing fields ...
    host_profile: {
      first_name: string;
      last_name: string;
      avatar_url: string | null;
      privacy_show_profile_photo?: boolean | null;
      privacy_show_full_name?: boolean | null;
    } | null;
  };
  profiles: { ... }; // This is the RENTER's profile
}

2. Update the Supabase query to join host profile through spots:

spots!inner(
  id, title, address, host_id, description, access_notes, 
  has_ev_charging, ev_charging_instructions, instant_book, 
  spot_photos(url, is_primary, sort_order),
  host_profile:profiles!spots_host_id_fkey(
    first_name, last_name, avatar_url, 
    privacy_show_profile_photo, privacy_show_full_name
  )
)
```

**Part B: Conditional UI for Support Users**

For Support users, render TWO separate cards instead of one:

```text
{/* For Support users - show BOTH Driver and Host */}
{isSupport && (
  <>
    {/* Driver Card */}
    <Card className="p-4 space-y-4">
      <h3 className="font-semibold">Driver</h3>
      <div 
        className="flex items-center gap-3 cursor-pointer hover:bg-muted/50 -m-2 p-2 rounded-lg transition-colors"
        onClick={() => navigate(`/support-user/${booking.renter_id}`)}
      >
        {/* Renter avatar and info */}
        <ChevronRight />
      </div>
    </Card>
    
    {/* Host Card */}
    <Card className="p-4 space-y-4">
      <h3 className="font-semibold">Host</h3>
      <div 
        className="flex items-center gap-3 cursor-pointer hover:bg-muted/50 -m-2 p-2 rounded-lg transition-colors"
        onClick={() => navigate(`/support-user/${booking.spots.host_id}`)}
      >
        {/* Host avatar and info from spots.host_profile */}
        <ChevronRight />
      </div>
    </Card>
  </>
)}

{/* For regular users (Driver/Host) - show existing single card */}
{!isSupport && (
  <Card>...</Card>
)}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/SupportUserDetail.tsx` | Add fallback navigation for back button |
| `src/pages/BookingDetail.tsx` | Fetch host profile, show both Driver + Host cards for Support |

---

## Implementation Details

### SupportUserDetail.tsx Changes

**Line 244** (User not found state):
```typescript
<Button className="mt-4" onClick={() => {
  if (window.history.length > 1) {
    navigate(-1);
  } else {
    navigate('/support-reservations');
  }
}}>
```

**Line 257** (Header back button):
```typescript
<Button variant="ghost" size="icon" onClick={() => {
  if (window.history.length > 1) {
    navigate(-1);
  } else {
    navigate('/support-reservations');
  }
}}>
```

### BookingDetail.tsx Changes

**Interface update** (around line 54-69):
Add `host_profile` to the `spots` interface to hold the host's profile information.

**Query update** (line 188):
Add the host profile join via `host_profile:profiles!spots_host_id_fkey(...)`.

**UI update** (lines 972-1030):
Replace the existing single card with conditional rendering:
- If `isSupport`: Show two cards (Driver + Host) with clickable navigation
- Otherwise: Show the existing single card based on `isHost` flag

---

## Expected Behavior After Fix

### Back Button
- Clicking back on `/support-user/:id` navigates to the previous page
- If no history exists, falls back to `/support-reservations`

### Booking Details for Support
- Support users see TWO cards:
  1. **Driver** - The person who booked the spot (with their name, avatar)
  2. **Host** - The spot owner (with their name, avatar)
- Each card shows a chevron indicator and is clickable
- Clicking navigates to `/support-user/:userId` for the respective user
- Labels are accurate: "Driver" for renter, "Host" for spot owner
