

# Fix: Orphaned Bookings from Failed Payments

## Root Cause Identified

You experienced the **orphaned booking bug**. Here's exactly what happened:

```text
Timeline of your experience:
1. You filled out the form and clicked "Pay"
2. Backend created a booking with "held" status (line 293-319 of create-guest-booking)
3. Backend created a Stripe PaymentIntent
4. Frontend called stripe.confirmCardPayment() - THIS FAILED (missing zip code)
5. Frontend showed error toast "Booking failed"
6. BUT: The booking record stayed in the database with "held" status
7. When you tried again with correct info, availability check saw the held booking
8. System returned 409: "Spot is not available"
```

**The core problem**: The booking is created BEFORE Stripe payment is confirmed. If the payment fails for any reason (wrong zip, card declined, expired card), the booking remains in the database blocking that time slot.

---

## Solution: Two-Phase Booking Creation

Instead of creating the booking before payment, we need to:

1. **Phase 1 (Pre-payment)**: Only create the PaymentIntent - no database booking yet
2. **Phase 2 (Post-payment)**: Create the booking AFTER payment is confirmed/authorized

This mirrors how most e-commerce sites work - they don't create an order until payment succeeds.

---

## Implementation Plan

### Part 1: Restructure `create-guest-booking` Edge Function

**Current flow (broken):**
```text
1. Check availability
2. Create booking in database ← TOO EARLY
3. Create PaymentIntent
4. Return client_secret
5. Frontend confirms payment (CAN FAIL)
6. Orphaned booking if payment fails
```

**New flow (fixed):**
```text
1. Check availability
2. Create PaymentIntent with all booking data in metadata
3. Return client_secret (NO booking created yet)
4. Frontend confirms payment
5. On success, call verify-guest-payment
6. verify-guest-payment creates the booking
```

### Part 2: Update `verify-guest-payment` Edge Function

This function currently just updates existing bookings. We need to:
- If booking doesn't exist yet, CREATE it using data from PaymentIntent metadata
- This ensures bookings only exist when payment is confirmed

### Part 3: Frontend Adjustments

Update `GuestBookingForm.tsx` to:
- Call `verify-guest-payment` after successful `confirmCardPayment`
- The verify function will create the booking and return the booking ID

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/create-guest-booking/index.ts` | Remove booking creation; only create PaymentIntent |
| `supabase/functions/verify-guest-payment/index.ts` | Add booking creation logic using PaymentIntent metadata |
| `src/components/booking/GuestBookingForm.tsx` | Call verify-guest-payment after successful payment confirmation |

---

## Detailed Technical Changes

### create-guest-booking/index.ts

**Remove lines 292-324** (booking creation) and **move that data to PaymentIntent metadata**:

```typescript
// Store ALL booking data in PaymentIntent metadata
const paymentIntentParams = {
  amount: Math.round(totalAmount * 100),
  currency: 'usd',
  capture_method: isInstantBook ? 'automatic' : 'manual',
  metadata: {
    // Existing metadata
    spot_id,
    host_id: spot.host_id,
    is_guest: 'true',
    guest_email: sanitizedEmail || '',
    guest_phone: sanitizedPhone || '',
    instant_book: isInstantBook ? 'true' : 'false',
    
    // NEW: All booking data needed to create booking later
    start_at,
    end_at,
    guest_full_name: sanitizedName,
    guest_car_model: sanitizedCarModel,
    guest_license_plate: sanitizedLicensePlate || '',
    hourly_rate: spot.hourly_rate.toString(),
    total_hours: totalHours.toString(),
    subtotal: subtotal.toString(),
    platform_fee: platformFee.toString(),
    total_amount: totalAmount.toString(),
    host_earnings: hostEarnings.toString(),
    will_use_ev_charging: useEvCharging ? 'true' : 'false',
    ev_charging_fee: evChargingFee.toString(),
  },
};

// Generate access token now but don't save to DB yet
const guestAccessToken = crypto.randomUUID();
paymentIntentParams.metadata.guest_access_token = guestAccessToken;

// Return token to frontend for redirect after verify
return {
  client_secret: paymentIntent.client_secret,
  payment_intent_id: paymentIntent.id,
  guest_access_token: guestAccessToken,
  approval_required: !isInstantBook,
  // NO booking_id yet - will be created after payment
};
```

### verify-guest-payment/index.ts

**Add booking creation logic**:

```typescript
// After verifying payment succeeded/authorized with Stripe:
const metadata = paymentIntent.metadata;

// Check if booking already exists (idempotency)
const { data: existingBooking } = await supabaseAdmin
  .from('bookings')
  .select('id')
  .eq('stripe_payment_intent_id', paymentIntent.id)
  .single();

if (!existingBooking) {
  // Re-check availability (critical - prevents race conditions)
  const { data: isAvailable } = await supabaseAdmin.rpc('check_spot_availability', {
    p_spot_id: metadata.spot_id,
    p_start_at: metadata.start_at,
    p_end_at: metadata.end_at,
  });

  if (!isAvailable) {
    // Cancel the PaymentIntent and refund if needed
    await stripe.paymentIntents.cancel(paymentIntent.id);
    return { error: 'Spot no longer available', refunded: true };
  }

  // Create booking NOW (payment confirmed)
  const bookingId = crypto.randomUUID();
  const initialStatus = metadata.instant_book === 'true' ? 
    (paymentIntent.status === 'succeeded' ? 'active' : 'pending') : 
    'held';

  await supabaseAdmin.from('bookings').insert({
    id: bookingId,
    spot_id: metadata.spot_id,
    renter_id: metadata.host_id, // placeholder for guest bookings
    start_at: metadata.start_at,
    end_at: metadata.end_at,
    status: initialStatus,
    // ... all other fields from metadata
    stripe_payment_intent_id: paymentIntent.id,
    guest_access_token: metadata.guest_access_token,
    is_guest: true,
  });

  // Send notifications for non-instant bookings
  if (initialStatus === 'held') {
    // Create host notification...
  }

  return { booking_id: bookingId, status: initialStatus };
}

return { booking_id: existingBooking.id };
```

### GuestBookingForm.tsx

**Update payment confirmation flow**:

```typescript
// After confirmCardPayment succeeds:
if (paymentIntent?.status === 'succeeded' || paymentIntent?.status === 'requires_capture') {
  // NOW verify and create the booking
  const { data: verifyData, error: verifyError } = await supabase.functions.invoke('verify-guest-payment', {
    body: { payment_intent_id: payment_intent_id },
  });

  if (verifyError || verifyData?.error) {
    throw new Error(verifyData?.error || 'Failed to verify payment');
  }

  const booking_id = verifyData.booking_id;
  
  // Navigate to booking confirmation
  navigate(`/guest-booking/${booking_id}?token=${guest_access_token}`);
}
```

---

## Benefits of This Approach

1. **No orphaned bookings** - Booking only created after payment succeeds
2. **Cleaner retry experience** - Users can retry payment without blocking issues
3. **Race condition protection** - Availability is re-checked before booking creation
4. **Idempotent** - Multiple verify calls won't create duplicate bookings

---

## Immediate Relief (While Fix Is Implemented)

To clean up the stuck booking so you can test:
```sql
UPDATE bookings 
SET status = 'canceled' 
WHERE id = '9ea6e909-4887-4384-926f-4664baed19da';
```

Or I can implement the full fix now.

