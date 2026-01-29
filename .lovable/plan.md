
# Support App Improvements Plan

## Overview

This plan addresses two main improvements to the Support version of the app:

1. **Standardize booking status naming** across Support pages to match Driver/Host conventions (Booked, Active, Completed, Cancelled)
2. **Enable clickable user profiles** from Booking Details that navigate to the existing User Profile page

---

## Part 1: Standardize Booking Status Labels

### Current State
- Support pages (`SupportReservations.tsx`, `SupportUserDetail.tsx`) display raw database statuses: "Pending", "Held", "Paid", "Active", etc.
- Driver/Host pages use a standardized system with: "Booked", "Active", "Completed", "Cancelled", "Requested", "Expired"

### Changes Required

**File: `src/pages/SupportReservations.tsx`**
- Import `getBookingStatus` and `getBookingStatusColor` from `@/lib/bookingStatus`
- Replace the `getStatusBadge` function to use the standardized terminology
- The function will transform raw statuses to user-friendly labels (e.g., "paid" → "Booked", "canceled" → "Cancelled")

**File: `src/pages/SupportUserDetail.tsx`**
- Same changes as above for the `getStatusBadge` function in the Bookings tab
- Import and use the booking status utilities

### Status Mapping
| Database Status | Display Label |
|-----------------|---------------|
| pending (before start) | Requested or Booked |
| held | Booked |
| paid | Active (if ongoing) or Booked (if upcoming) |
| active | Active (if ongoing) or Booked (if upcoming) |
| completed | Completed |
| canceled | Cancelled |
| refunded | Cancelled |

---

## Part 2: Clickable User Profiles from Booking Details

### Goal
When a Support user views a booking's details, clicking on the Host or Driver section should navigate to `/support-user/:userId` to view their full profile.

### Changes Required

**File: `src/components/auth/SupportRedirect.tsx`**
- Add `/support-user/` to the allowed routes array (currently missing, which would cause support users to be blocked)

**File: `src/pages/BookingDetail.tsx`**
- Import `useSupportRole` hook
- Detect if current user is a support user
- For the Host/Driver card section (around line 970-1016):
  - Add click handlers when `isSupport` is true
  - Make the user info section clickable
  - Navigate to `/support-user/:userId` on click
  - Add visual indicators (cursor, hover state) that it's clickable
  - Show the user's role context (e.g., "View Driver Profile" or "View Host Profile")

### Visual Changes
- When support user hovers over user info, show a subtle highlight
- Add a "View Profile" button or chevron indicator
- Click navigates to the existing SupportUserDetail page

---

## Implementation Details

### SupportReservations.tsx Changes

```text
Replace getStatusBadge function:
1. Import getBookingStatus, getBookingStatusColor
2. Update function to call getBookingStatus with booking data
3. Use returned label and color for consistent styling
```

### SupportUserDetail.tsx Changes

```text
Same pattern as SupportReservations:
1. Import booking status utilities
2. Update getStatusBadge in bookings tab
3. Each booking row already navigates to /booking/:id on click (keep this)
```

### BookingDetail.tsx Changes

```text
1. Import useSupportRole hook
2. Get isSupport from hook
3. In Host/Driver card section:
   - Wrap user info in clickable container when isSupport
   - Add onClick handler: navigate(`/support-user/${userId}`)
   - Add ChevronRight icon as visual indicator
   - Add hover:bg-muted/50 for visual feedback
4. Determine correct userId:
   - If viewing as host: use renter_id
   - If viewing as driver: use host_id
   - For support: show both options with clear labels
```

### SupportRedirect.tsx Changes

```text
Add to SUPPORT_ALLOWED_ROUTES array:
'/support-user/'
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/SupportReservations.tsx` | Use getBookingStatus for labels |
| `src/pages/SupportUserDetail.tsx` | Use getBookingStatus for labels |
| `src/pages/BookingDetail.tsx` | Add clickable user navigation for support |
| `src/components/auth/SupportRedirect.tsx` | Add /support-user/ to allowed routes |

---

## Expected Behavior After Implementation

### Status Labels
- All Support pages will display consistent terminology matching Driver/Host views
- "Booked" for upcoming confirmed bookings
- "Active" for in-progress bookings
- "Completed" for finished bookings
- "Cancelled" for canceled/refunded bookings

### User Profile Navigation
1. Support user opens `/booking/:id`
2. Sees the Host and/or Driver section
3. Each section shows the user info with a clickable indicator
4. Clicking opens `/support-user/:userId`
5. The SupportUserDetail page shows:
   - Full user profile (name, email, phone, verification status)
   - Their bookings as a driver
   - Their registered vehicles
   - Their listed spots as a host

This provides support staff with a complete view of any user's activity on the platform from any booking they investigate.
