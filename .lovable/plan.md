
## Fix: Stripe Webhook Bypassing Host Confirmation

### Problem Confirmed
The UI tester's concern is **valid**. When a host sets their spot to "Requires Confirmation" (`instant_book = false`), bookings can still end up as `active` without host approval.

**Root cause**: The `stripe-webhooks` edge function's `handlePaymentSucceeded` handler unconditionally sets any booking to `active` when Stripe fires a `payment_intent.succeeded` event. For non-instant-book spots, the `create-booking` and `verify-guest-payment` functions correctly set the booking to `held` status (awaiting host approval), but the webhook fires shortly after and overrides it to `active`, bypassing the approval flow entirely.

### Evidence
Database query confirmed that booking `2b71b6dc` (a guest booking on a non-instant-book spot) is `active` with no approval notifications -- meaning it was never approved by the host.

### Solution
Update `handlePaymentSucceeded` in `supabase/functions/stripe-webhooks/index.ts` to skip bookings that are in `held` status, since those are intentionally awaiting host approval.

### Technical Details

**File: `supabase/functions/stripe-webhooks/index.ts`**

In the `handlePaymentSucceeded` function, change the early-return check (line 115) from:

```typescript
if (booking.status === 'active' || booking.status === 'completed') {
  console.log('Booking already active/completed, skipping...');
  return;
}
```

To:

```typescript
if (booking.status === 'active' || booking.status === 'completed') {
  console.log('Booking already active/completed, skipping...');
  return;
}

// Don't override 'held' status - these bookings are awaiting host approval
// The approve-booking function will handle the transition to 'active'
if (booking.status === 'held') {
  console.log('Booking is held (awaiting host approval), skipping automatic activation:', booking.id);
  return;
}
```

This ensures that:
- `pending` bookings still get activated by the webhook (normal instant-book flow fallback)
- `held` bookings are left alone for the host to approve/reject
- `active`/`completed` bookings are still skipped (existing idempotency)

### Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/stripe-webhooks/index.ts` | Add `held` status check in `handlePaymentSucceeded` to prevent overriding host confirmation flow |

### Risk Assessment
- **Low risk**: This is a targeted, additive change (adding one more early-return condition)
- **No side effects**: The `approve-booking` function already handles the `held` to `active` transition with payment capture
- **Backwards compatible**: Existing instant-book bookings are unaffected since they never enter `held` status
