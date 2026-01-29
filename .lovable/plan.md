
# Fix: Guest Bookings Ignoring Instant Book Setting

## Problem Identified

**Confirmed Bug**: Guest bookings (unauthenticated users) always bypass host confirmation, even when the host has disabled the "Instant Book" feature.

### Evidence from Database
A guest booking on a spot with `instant_book: false` was immediately set to `active` status instead of `held` (awaiting approval):
- Booking ID: `2b71b6dc-6a80-4ce9-888a-7c03f675ba95`
- Spot instant_book: `false`
- Is guest: `true`
- Status: `active` (incorrect - should be `held`)

### Root Cause
The `create-guest-booking` edge function fetches the `instant_book` field but never uses it. Unlike the registered-user booking flow, the guest flow:
1. Always creates a standard PaymentIntent (immediate capture)
2. Always activates the booking when payment succeeds
3. Never sends approval requests to hosts

---

## Affected Users

| Scenario | Behavior |
|----------|----------|
| Registered user + instant_book=true | Correct (instant) |
| Registered user + instant_book=false | Correct (held for approval) |
| Guest user + instant_book=true | Correct (instant) |
| **Guest user + instant_book=false** | **BUG: Treated as instant** |

**Occurrence Rate**: 100% for guest bookings on non-instant-book spots

---

## Solution

### Part 1: Update `create-guest-booking` Edge Function

Add instant book logic that mirrors the registered user flow:

```text
1. After fetching spot details, check instant_book setting
2. If instant_book = false:
   - Create PaymentIntent with capture_method: 'manual' (hold funds)
   - Return a flag indicating approval_required
3. If instant_book = true:
   - Keep current behavior (immediate capture)
```

### Part 2: Update `verify-guest-payment` Edge Function

Handle the held/approval-required case:

```text
1. When verifying payment, check if spot.instant_book is false
2. If false and payment is authorized (not captured):
   - Keep booking status as 'held'
   - Do NOT activate the booking
   - Return appropriate response to frontend
3. If true or payment is captured:
   - Activate booking as normal
```

### Part 3: Create Host Notification Flow for Guest Approval Requests

```text
1. When guest booking is held (non-instant):
   - Create 'booking_approval_required' notification for host
   - Send email to host with approval/decline links
   - Send push notification
2. Host uses existing approve-booking / reject-booking functions
```

### Part 4: Frontend Updates for Guest Booking Confirmation

Update the guest booking confirmation page to show appropriate status:

```text
1. If booking status is 'held':
   - Show "Awaiting Host Approval" message
   - Explain the 1-hour window
   - Show card hold notice
2. If booking status is 'active':
   - Show current "Booking Confirmed" message
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/create-guest-booking/index.ts` | Add instant_book check and manual capture for non-instant spots |
| `supabase/functions/verify-guest-payment/index.ts` | Handle held bookings differently from captured ones |
| `src/pages/GuestBookingDetail.tsx` | Show "Awaiting Approval" UI for held bookings |

---

## Technical Implementation Details

### create-guest-booking Changes

```text
Line ~237: Already fetches spot.instant_book
Line ~270: Add check: const isInstantBook = spot.instant_book !== false;
Line ~320-336: Modify PaymentIntent creation:

If isInstantBook:
  - Current behavior (no capture_method, immediate capture)
If NOT isInstantBook:
  - Add capture_method: 'manual'
  - Update booking status to 'held' instead of 'pending'
  - Create host notification for approval
  - Send push + email to host
  - Return { approval_required: true } in response
```

### verify-guest-payment Changes

```text
Line ~100-108: Update the status check logic:

If booking.status === 'held':
  - Check if payment was just authorized (not captured)
  - If so, don't change status - return that it's awaiting approval
  - Only the approve-booking function should activate these

Line ~153-166: Add guard:
  - Only update to 'active' if spot allows instant book
  - Or if payment was captured (not just authorized)
```

---

## Expected Behavior After Fix

### For Hosts with Instant Book OFF

1. Guest completes booking form and enters payment
2. Card is authorized (funds held) but not charged
3. Booking status set to `held`
4. Host receives notification: "New booking request - approve within 1 hour"
5. Guest sees: "Your booking request is pending host approval"
6. If host approves: Payment captured, booking becomes `active`
7. If host declines/timeout: Authorization released, booking `canceled`

### For Hosts with Instant Book ON

1. Guest completes booking and pays
2. Payment immediately captured
3. Booking status set to `active`
4. Host and guest receive confirmations
5. (Current behavior - no changes needed)
