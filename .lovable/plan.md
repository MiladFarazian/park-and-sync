
Goal: fix (1) current build failure blocking edge-function deploys, and (2) missing booking-request notifications + “Request Expired” behavior for both driver and host.

---

## 1) Fix the current build error (Resend import)
### What’s happening
Your build is failing with:
- “Could not find a matching package for `npm:resend@2.0.0` in the node_modules directory…”

This happens because multiple Supabase Edge Functions import Resend via `npm:resend@2.0.0`, but this repo does not have a Deno config (`deno.json`) enabling npm auto-install / node_modules resolution.

### Fix approach (lowest-risk)
Stop using `npm:` imports for Resend inside edge functions and switch to the already-working pattern you have elsewhere:
- `import { Resend } from "https://esm.sh/resend@2.0.0";`

### Files to update (all occurrences)
Update every edge function that imports `Resend` from `npm:resend@2.0.0` to use `https://esm.sh/resend@2.0.0` instead (examples from your repo):
- `supabase/functions/approve-booking/index.ts` (this is the one currently breaking the build)
- `supabase/functions/reject-booking/index.ts`
- `supabase/functions/expire-pending-bookings/index.ts`
- `supabase/functions/send-booking-confirmation/index.ts`
- `supabase/functions/send-guest-booking-confirmation/index.ts`
- `supabase/functions/send-report-notification/index.ts`
- `supabase/functions/detect-overstays/index.ts`
- `supabase/functions/forward-support-messages/index.ts`
(and any other matches found by search)

Expected outcome: the project builds again, and edge functions can deploy.

---

## 2) Fix booking-request notifications not being sent (host + driver)
### What’s happening
For “request” bookings (non-instant), `create-booking` sets the booking status to `held` and tries to create notifications, but it only inserts notifications if BOTH `hostProfile` and `renterProfile` exist:

```ts
if (hostProfile && renterProfile) { insert notifications }
```

If either profile lookup fails or returns null (missing profile row, RLS quirks, partial data), NO notifications are created at all — which matches your “no in-app notification” symptom.

### Fix approach
Make notification creation unconditional and resilient:
1) In `supabase/functions/create-booking/index.ts` (non-instant path):
   - Always insert the host and driver notifications after setting `status = 'held'`.
   - Use safe fallbacks for names:
     - driverName: `renterProfile?.first_name || userData.user.user_metadata?.first_name || 'A driver'`
     - hostName: `hostProfile?.first_name || 'Host'`
   - Don’t require both profiles to exist.

2) Add delivery channels beyond “in-app bell”:
   - Push notification: send a push to the host (if they have `push_subscriptions` rows), using your existing `send-push-notification` edge function.
   - Email: send an email to the host (“New booking request — approve within 1 hour”) using Resend (after we fix the build).

Notes:
- “Text/SMS” for signed-in hosts/drivers is not implemented for booking requests today (Twilio is used in guest booking confirmation only). If you want SMS for booking requests too, we can add it as an optional follow-up once the core system is working reliably.

---

## 3) Ensure booking requests actually expire (backend + UI)
### What’s happening
Your screenshot shows the UI still in “Booking Request Sent” state even though it says “expires about 5 hours ago.”
Right now:
- `BookingConfirmation.tsx` shows “Pending Approval” purely when `booking.status === 'held'`
- It never flips to an “Expired” UI unless the booking status changes in the database
- The database status change depends on background expiry logic; in your environment, it appears the expiry job is not reliably running, so bookings can remain `held` indefinitely.

Also: `expire-pending-bookings` currently expires held requests after ~90 minutes, while the UI says 1 hour. That mismatch needs to be corrected.

### Fix approach (reliable + consistent)
A) Backend “failsafe” expiry function (user-triggered)
Create a small edge function that can expire a single booking request when it’s past its 1-hour response window:
- Validates the caller is either:
  - the renter (driver) of the booking, OR
  - the host of the booked spot
- Validates booking is still `held` and `created_at + 1 hour < now`
- Cancels the Stripe PaymentIntent (manual capture hold) using Stripe secret
- Updates booking status to `canceled` with a clear `cancellation_reason` (e.g., “Booking request expired - host did not respond within 1 hour”)
- Inserts notifications for BOTH parties:
  - Driver: “Booking Request Expired”
  - Host: “Booking Request Expired (no response)”

This creates determinism: even if a cron/background job isn’t running, the UI can trigger the correct state transition.

B) Frontend: show “Request Expired” state automatically
Update both pages to detect expiry and react:
- `src/pages/BookingConfirmation.tsx`
  - Compute expiryAt = created_at + 1 hour
  - If booking.status is still `held` but now > expiryAt:
    - Show a new “Request Expired” UI (red/alert styling)
    - Call the new expiry edge function once (idempotent) to ensure backend catches up
    - Provide CTAs like “Search again” and “Back to Activity”
- `src/pages/HostBookingConfirmation.tsx`
  - Same expiry detection
  - If expired:
    - Disable Approve/Decline actions
    - Show “Request Expired” and explain that the driver was not charged and has been notified

C) Align expiry timing everywhere
Update `supabase/functions/expire-pending-bookings/index.ts` (once build is fixed) to match the promised “1 hour” logic if you still want the background expiry mechanism:
- Reminder at 30 minutes before expiry (optional)
- Expire at 60 minutes (not 90)

(We’ll keep the “failsafe” function anyway; it’s a safety net.)

---

## 4) Fix push delivery reliability for booking events
There is a secondary reliability issue in `src/hooks/useNotifications.tsx`:
- It attempts to subscribe to bookings with a filter string: `renter_id=eq.${user.id},host_id=eq.${user.id}`
- Supabase realtime filters don’t work like “OR” with comma-separated clauses; this likely results in missing booking-change notifications.

Fix:
- Remove or simplify this bookings realtime listener (it’s not the source of the in-app bell, but it impacts browser notifications).
- Rely on:
  - notifications table realtime (`notifications` INSERT) for showing browser notifications, and
  - NotificationBell polling + realtime for the in-app list.

---

## 5) Implementation order (to minimize downtime)
1) Fix Resend imports in edge functions so the build passes again.
2) Patch `create-booking` (held path) to always create notifications + send push + send email.
3) Add the “expire single booking request” edge function and wire it into BookingConfirmation + HostBookingConfirmation.
4) Align background expiry timing in `expire-pending-bookings` to 60 minutes and ensure it also sends push/email for expiry notifications.
5) Fix `useNotifications.tsx` booking realtime filter to improve browser notifications.

---

## 6) How we’ll verify end-to-end
We’ll test one “request” booking from a driver account against a host’s request-based spot:
1) Driver books a request-only spot → immediately check:
   - Host in-app bell has a “New Booking Request” item
   - Host receives push (if subscribed) and email (if configured)
2) Host does nothing → after 60 minutes:
   - Driver page becomes “Request Expired”
   - Booking status in DB becomes `canceled` with expiration reason
   - Driver receives in-app notification + push/email (depending on channel availability)
   - Host receives in-app notification + push/email indicating it expired
3) Host approves/declines quickly:
   - Driver gets “Approved” / “Declined” notifications as expected

---

## Notes / constraints
- SMS (“Text”) for signed-in host/driver booking-request events is not currently part of the platform’s booking notification pathways. We can add Twilio SMS for booking requests if you confirm you want it (and define when to send it + phone number requirements).
- The in-app notification bell should work even without browser notification permission; push/OS notifications require permission + a push subscription.

