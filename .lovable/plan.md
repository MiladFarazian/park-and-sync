
# Plan: Add Email Confirmation Fallback to verify-guest-payment

## Problem Summary
Guest booking email confirmations are not being sent because:
1. **Missing Secret**: `STRIPE_WEBHOOK_SECRET` is not configured in Supabase secrets
2. **Webhook Failure**: The `stripe-webhooks` function returns 500 when the secret is missing
3. **Fallback Gap**: The `verify-guest-payment` fallback successfully activates bookings but doesn't send email confirmations

## Solution Overview
Add email confirmation sending to the `verify-guest-payment` edge function as a fallback mechanism. This ensures emails are sent even when the primary Stripe webhook flow fails.

## Implementation Details

### File to Modify
`supabase/functions/verify-guest-payment/index.ts`

### Changes Required

1. **Expand booking data fetch** to include all fields needed for email:
   - Guest details: `guest_full_name`, `guest_email`, `guest_phone`, `guest_access_token`
   - Booking details: `start_at`, `end_at`, `total_amount`, `will_use_ev_charging`
   - Spot details via join: `title`, `address`, `access_notes`, `ev_charging_instructions`, `has_ev_charging`, `host_id`

2. **Fetch host profile** after successful payment verification to get host name and email

3. **Call send-guest-booking-confirmation** after updating booking status:
   ```typescript
   // After booking is updated to active, send confirmation emails
   await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-guest-booking-confirmation`, {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json',
       'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
     },
     body: JSON.stringify({
       guestEmail: booking.guest_email,
       guestPhone: booking.guest_phone,
       guestName: booking.guest_full_name,
       hostName: hostProfile?.first_name || 'Host',
       hostEmail: hostProfile?.email,
       spotTitle: booking.spots.title,
       spotAddress: booking.spots.address,
       startAt: booking.start_at,
       endAt: booking.end_at,
       totalAmount: booking.total_amount,
       bookingId: booking.id,
       guestAccessToken: booking.guest_access_token,
       accessNotes: booking.spots.access_notes || '',
       evChargingInstructions: booking.spots.ev_charging_instructions || '',
       hasEvCharging: booking.spots.has_ev_charging || false,
       willUseEvCharging: booking.will_use_ev_charging || false,
     }),
   });
   ```

4. **Add host notification** - Insert notification record for the host

5. **Add error handling** - Log but don't fail if email sending fails (booking is already confirmed)

## Code Structure

```text
verify-guest-payment flow:
1. Validate request (booking_id, access_token)
2. Fetch booking with expanded fields (including spot details)
3. Check status (return early if already active/canceled)
4. Verify payment with Stripe API
5. Update booking to "active"
6. Credit host balance
7. [NEW] Fetch host profile
8. [NEW] Send confirmation emails via send-guest-booking-confirmation
9. [NEW] Create host notification
10. Return success response
```

## Technical Notes

- The email function already exists and works - we're just calling it from an additional location
- Uses service role key for internal function-to-function authentication
- Matches the exact same payload structure used in `stripe-webhooks` (lines 169-193)
- Email sending is non-blocking - booking activation succeeds regardless of email status

## Additional Recommendation
After this fix is deployed, you should also add the `STRIPE_WEBHOOK_SECRET` to your Supabase secrets. This can be obtained from the Stripe Dashboard under Developers > Webhooks. The webhook endpoint URL should be:
```
https://mqbupmusmciijsjmzbcu.supabase.co/functions/v1/stripe-webhooks
```

This ensures the primary webhook flow works correctly in the future, with this new fallback as a safety net.
