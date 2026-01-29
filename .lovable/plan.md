

# Fix: Guest Booking Emails + Cancellation for Held Bookings

## Issues Identified

### Issue 1: "Booking Requested" Emails Not Being Sent

**Root Cause**: The `verify-guest-payment` function calls `send-booking-confirmation` with a `type: 'host_request'` parameter, but this function doesn't support a `type` field - it expects `hostEmail` and `driverEmail` directly.

The edge function logs confirm this:
```
Skipping host email: no valid recipient. Email provided: undefined
Skipping driver email: no valid recipient. Email provided: undefined
```

The call in `verify-guest-payment` (lines 255-272):
```typescript
body: JSON.stringify({
  to: hostProfile.email,       // Wrong parameter name - should be hostEmail
  type: 'host_request',        // This parameter is not supported
  hostName: hostProfile.first_name,
  // ... rest of fields
}),
```

**Additionally**: No email is being sent to the guest when their booking request is submitted (held status). Only the host is notified.

### Issue 2: Cancellation Fails for 'held' Status

**Root Cause**: Line 126 in `cancel-guest-booking` only allows cancellation for `['pending', 'active']` statuses:

```typescript
if (!['pending', 'active'].includes(booking.status)) {
  return new Response(JSON.stringify({ 
    error: 'This booking cannot be cancelled' 
  }), { status: 400 });
}
```

Bookings awaiting host approval have status `'held'`, which is not in this list.

---

## Solution

### Part 1: Fix cancel-guest-booking to Allow 'held' Status

Add `'held'` to the allowed statuses and handle Stripe authorization release (cancel the PaymentIntent instead of refunding):

```typescript
// Line 126: Add 'held' to allowed statuses
if (!['pending', 'active', 'held'].includes(booking.status)) {
  return new Response(JSON.stringify({ 
    error: 'This booking cannot be cancelled' 
  }), { status: 400 });
}

// Update Stripe handling to cancel authorization for held bookings
if (booking.stripe_payment_intent_id) {
  const paymentIntent = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id);
  
  if (paymentIntent.status === 'requires_capture') {
    // Cancel the authorization - releases the hold
    await stripe.paymentIntents.cancel(booking.stripe_payment_intent_id);
  } else if (paymentIntent.status === 'succeeded') {
    // Already captured - issue refund if eligible
    if (isEligibleForRefund) {
      const refund = await stripe.refunds.create({ payment_intent: ... });
    }
  }
}
```

### Part 2: Fix Email Sending for "Booking Requested" Flow

For **non-instant-book** guest bookings (status = 'held'), we need to:

1. **Send "Booking Request Submitted" email to Guest** - Let them know their request is pending
2. **Send "New Booking Request" email to Host** - Notify them to approve/decline

Create a new email template section in `verify-guest-payment` that calls `send-guest-booking-confirmation` with a new `isRequest` flag, or create dedicated request email templates.

**Recommended approach**: Add a `type` parameter to `send-guest-booking-confirmation` to distinguish between:
- `type: 'confirmed'` - Current behavior (booking is active)
- `type: 'request'` - New behavior (awaiting host approval)

This allows reusing the existing infrastructure while customizing the email content:

| Recipient | Email Type | Subject | Key Message |
|-----------|------------|---------|-------------|
| Guest | Request | "📋 Booking Request Submitted" | "Your request is pending host approval. We'll notify you within 1 hour." |
| Host | Request | "🔔 New Booking Request" | "A guest wants to book your spot. Approve or decline within 1 hour." |

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/cancel-guest-booking/index.ts` | Add 'held' to allowed statuses; handle authorization cancellation |
| `supabase/functions/send-guest-booking-confirmation/index.ts` | Add `type` parameter to support 'request' vs 'confirmed' emails |
| `supabase/functions/verify-guest-payment/index.ts` | Fix email call to use correct function with proper parameters |

---

## Technical Implementation

### cancel-guest-booking/index.ts Changes

```text
Line 126: Change allowed statuses from ['pending', 'active'] to ['pending', 'active', 'held']

Lines 144-163: Update Stripe refund logic:
- If status === 'requires_capture': Cancel the PaymentIntent (releases authorization)
- If status === 'succeeded': Create refund as before
- Update response message for held bookings ("Authorization released" instead of "Refund processed")
```

### send-guest-booking-confirmation/index.ts Changes

```text
Add new interface field:
  type?: 'confirmed' | 'request';  // Default: 'confirmed'

For type === 'request':
  - Guest email subject: "📋 Booking Request Submitted"
  - Guest email body: "Your request is awaiting host approval..."
  - Host email subject: "🔔 New Booking Request - Action Required"
  - Host email body: Include Approve/Decline buttons linking to Activity page
  
Keep current email templates as default for 'confirmed' type.
```

### verify-guest-payment/index.ts Changes

```text
Lines 252-278: Replace the send-booking-confirmation call with send-guest-booking-confirmation:

await fetch(`${supabaseUrl}/functions/v1/send-guest-booking-confirmation`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${serviceRoleKey}`,
  },
  body: JSON.stringify({
    type: 'request',  // NEW: Indicates this is a pending request
    guestEmail: metadata.guest_email || null,
    guestPhone: metadata.guest_phone || null,
    guestName: metadata.guest_full_name,
    hostName: hostProfile?.first_name || 'Host',
    hostEmail: hostProfile?.email,
    spotTitle: spot?.title || 'Parking Spot',
    spotAddress: spot?.address || '',
    startAt: metadata.start_at,
    endAt: metadata.end_at,
    totalAmount: parseFloat(metadata.total_amount),
    bookingId,
    guestAccessToken: metadata.guest_access_token,
  }),
});
```

---

## Expected Email Flow After Fix

### For Non-Instant Book (Booking Request)

```text
1. Guest submits booking → Payment authorized (not captured)
2. IMMEDIATELY:
   - Guest receives: "Booking Request Submitted - Awaiting host approval"
   - Host receives: "New Booking Request - Approve within 1 hour"
3. If host approves:
   - Guest receives: "Booking Confirmed!"
   - Host receives: "Booking Confirmed - Earn $X"
4. If host declines or timeout:
   - Guest receives: "Booking Request Declined/Expired"
   - Authorization released
```

### For Instant Book (Current Behavior - No Changes)

```text
1. Guest submits booking → Payment captured
2. IMMEDIATELY:
   - Guest receives: "Booking Confirmed!"
   - Host receives: "New Guest Booking!"
```

---

## Cancellation Flow After Fix

### Guest Cancels Held Booking (Awaiting Approval)

```text
1. Guest clicks "Cancel Request" on /guest-booking page
2. cancel-guest-booking detects status = 'held'
3. Stripe PaymentIntent cancelled (releases authorization)
4. Booking status updated to 'canceled'
5. Host notified: "A guest cancelled their booking request"
6. Guest sees success: "Request cancelled. Authorization released."
```

