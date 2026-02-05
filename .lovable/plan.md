

# Allow Free Cancellation for Unapproved Booking Requests

## Overview

Drivers should be able to cancel a booking request that the host hasn't approved yet **at any time** without being charged. Currently, the cancellation policy applies time-based rules regardless of approval status.

## Current Behavior

The `cancel-booking` edge function applies these rules uniformly:
- Within 10-minute grace period → full refund
- More than 1 hour before start → full refund  
- Less than 1 hour before start → no refund

This means if a driver submits a booking request on a non-instant-book spot and the host doesn't respond for 45 minutes, then the driver wants to cancel, the system would charge them if the booking start time is within an hour.

## Solution

### 1. Edge Function Update (`supabase/functions/cancel-booking/index.ts`)

Add a check at the top of the refund logic to handle `held` status bookings specially:

```text
Current flow:
1. Check grace period
2. Check time until start
3. Determine refund

New flow:
1. Check if booking status is 'held' (pending approval)
   → If yes: Always cancel the Stripe authorization, no charge
2. Check grace period
3. Check time until start
4. Determine refund
```

**Changes:**
- After line 53 (after checking if already cancelled), add logic to detect `held` status
- If `status === 'held'`, set `refundAmount = 0` and `refundReason = 'Booking request cancelled before host approval - no charge'`
- The existing Stripe logic already handles canceling uncaptured PaymentIntents correctly (lines 107-119)

### 2. Frontend Update (`src/pages/BookingConfirmation.tsx`)

Update the `getCancellationPolicy()` function to recognize held bookings:

```text
Current:
- Returns message based on grace period and time before start

New:
- First check if booking.status === 'held'
  → Return: "No charge - host hasn't accepted yet"
- Then apply existing time-based rules
```

**Changes to `getCancellationPolicy()` (around line 188):**
```typescript
const getCancellationPolicy = () => {
  if (!booking) return { refundable: false, message: '' };
  
  // Special case: Booking request pending host approval
  if (booking.status === 'held') {
    return {
      refundable: true,
      message: 'No charge - booking request not yet approved'
    };
  }
  
  // Existing time-based logic...
  const now = new Date();
  // ...rest of function
};
```

---

## Technical Details

### Why This Works

For `held` bookings, Stripe PaymentIntent is in `requires_capture` status (authorized but not captured). The current edge function code at lines 107-119 already handles this:

```typescript
if (pi.status !== 'canceled') {
  await stripe.paymentIntents.cancel(pi.id);
}
refundReason = `Payment not captured (status=${pi.status}); canceled intent; no refund needed`;
refundAmount = 0;
```

The fix ensures we hit this path by setting `refundAmount = 0` for held bookings, and the existing Stripe logic will cancel the authorization hold.

### Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/cancel-booking/index.ts` | Add held status check before refund calculation |
| `src/pages/BookingConfirmation.tsx` | Update `getCancellationPolicy()` to show correct message for held bookings |

### Notification Updates

The existing notification logic will work correctly. The host notification message will say the driver cancelled their booking request, which is appropriate.

