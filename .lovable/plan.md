

## Fix Incorrect Pricing in Host and Driver Confirmation Emails

### Problem Found

The host confirmation emails incorrectly show the **driver's total** (including the driver's 10% service fee) as the host's "earnings." This overstates what the host actually receives.

### Specific Issues

**1. send-booking-confirmation (registered user bookings)**

| Location | Current (Wrong) | Should Be |
|----------|-----------------|-----------|
| Host header (line 208) | "You've earned $[totalAmount]" | "You've earned $[hostEarnings]" |
| Host "Total Earnings" row (line 254) | Shows `totalAmount` (driver total) | Should show `hostEarnings` (host net) |

The `create-booking` function passes `totalAmount` (driver total = rate + 10% service fee + EV) but the host email uses it as "earnings." For example, a $30 booking at $15/hr for 2 hours: driver pays $33, but host earns $27. The email currently says the host earned $33.

The email template does not receive `hostEarnings` at all -- it needs to be added to the interface and passed through.

**2. send-guest-booking-confirmation (guest bookings)**

| Location | Current (Wrong) | Should Be |
|----------|-----------------|-----------|
| Host header subtitle (line 415) | "You've earned $[totalAmount]" | "You've earned $[hostEarnings]" |
| Host "Your Earnings" row (line 503) | Shows `totalAmount` | Should show host net earnings |

Same issue -- `totalAmount` is the driver-facing total, not what the host receives.

**3. Driver emails -- OK**
Driver emails correctly show `totalAmount` as "Total Paid" -- this is correct since `totalAmount` IS what the driver pays.

**4. Extension emails -- OK**
`send-extension-confirmation` already receives a separate `hostEarnings` field and uses it correctly for the host email. The driver email uses `extensionCost` (driver total for extension) correctly.

### Solution

#### Step 1: Update `send-booking-confirmation` edge function
- Add `hostEarnings` to the `BookingConfirmationRequest` interface
- Replace `totalAmount` with `hostEarnings` in the host email header and earnings row
- Keep `totalAmount` in the driver email (it's correct there)

#### Step 2: Update `create-booking` to pass `hostEarnings`
- Add `hostEarnings` to the email payload sent to `send-booking-confirmation` (line 469-487)
- The `hostEarnings` value is already calculated at line 200

#### Step 3: Update `send-guest-booking-confirmation` edge function
- Add `hostEarnings` to the `GuestBookingConfirmationRequest` interface
- Replace `totalAmount` with `hostEarnings` in the host email header and earnings row
- Keep `totalAmount` in the guest email (correct for driver/guest)

#### Step 4: Update callers of `send-guest-booking-confirmation`
- The `verify-guest-payment` and `approve-booking` functions that call this need to pass `hostEarnings`

---

### Technical Details

**File: `supabase/functions/send-booking-confirmation/index.ts`**

- Add `hostEarnings?: number` to `BookingConfirmationRequest` interface (around line 12)
- Line 208: Change `$${totalAmount.toFixed(2)}` to `$${(hostEarnings ?? totalAmount).toFixed(2)}`
- Line 254: Change `$${totalAmount.toFixed(2)}` to `$${(hostEarnings ?? totalAmount).toFixed(2)}`

**File: `supabase/functions/create-booking/index.ts`**

- Line ~479: Add `hostEarnings: hostEarnings` to the email payload object

**File: `supabase/functions/send-guest-booking-confirmation/index.ts`**

- Add `hostEarnings?: number` to `GuestBookingConfirmationRequest` interface
- Line 415: Change `$${totalAmount.toFixed(2)}` to `$${(hostEarnings ?? totalAmount).toFixed(2)}`
- Line 503: Change `$${totalAmount.toFixed(2)}` to `$${(hostEarnings ?? totalAmount).toFixed(2)}`

**File: `supabase/functions/verify-guest-payment/index.ts`** and **`supabase/functions/approve-booking/index.ts`**

- Add `hostEarnings` to the payload when invoking `send-guest-booking-confirmation`

---

### Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/send-booking-confirmation/index.ts` | Add `hostEarnings` field, use it in host email |
| `supabase/functions/create-booking/index.ts` | Pass `hostEarnings` in email payload |
| `supabase/functions/send-guest-booking-confirmation/index.ts` | Add `hostEarnings` field, use it in host email |
| `supabase/functions/verify-guest-payment/index.ts` | Pass `hostEarnings` in guest confirmation payload |
| `supabase/functions/approve-booking/index.ts` | Pass `hostEarnings` in guest confirmation payload |

### Impact
- Host emails will show accurate net earnings (after 10% platform fee)
- Driver/guest emails remain unchanged (correctly show total paid)
- Backwards compatible: uses `hostEarnings ?? totalAmount` fallback
