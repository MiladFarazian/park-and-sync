

## Add Parking Details to Guest Confirmation Emails

### Problem
Guest booking confirmation emails are missing critical parking information:
- Access instructions (gate codes, parking spot location, etc.)
- EV charging instructions (for spots with charging)

**Root cause:** The `send-guest-booking-confirmation` edge function and its callers don't include these fields.

### Current State

| Email Function | Has Access Notes | Has EV Instructions |
|----------------|------------------|---------------------|
| `send-booking-confirmation` (authenticated) | Yes | Yes |
| `approve-booking` (host approval) | Yes | Yes |
| `send-guest-booking-confirmation` (guest) | No | No |

### Solution

Update the guest booking confirmation flow to include parking details:

#### 1. Update `send-guest-booking-confirmation/index.ts`

**Add fields to interface:**
```typescript
interface GuestBookingConfirmationRequest {
  // ... existing fields ...
  accessNotes?: string;
  evChargingInstructions?: string;
  hasEvCharging?: boolean;
  willUseEvCharging?: boolean;
}
```

**Add HTML sections for access notes and EV instructions** (same styling as `send-booking-confirmation`):
- Blue box for access instructions
- Green box for EV charging instructions (when opted in)
- Gray box for EV available but not selected

#### 2. Update `stripe-webhooks/index.ts` - `handlePaymentSucceeded()`

When fetching the booking (line 86), add spot details:
```typescript
.select('..., spots!inner(host_id, title, address, access_notes, ev_charging_instructions, has_ev_charging)')
```

When calling `send-guest-booking-confirmation`, add the new fields:
```typescript
body: JSON.stringify({
  // ... existing fields ...
  accessNotes: (booking.spots as any).access_notes || '',
  evChargingInstructions: (booking.spots as any).ev_charging_instructions || '',
  hasEvCharging: (booking.spots as any).has_ev_charging || false,
  willUseEvCharging: booking.will_use_ev_charging || false,
}),
```

### Technical Details

#### Files to Modify:
1. `supabase/functions/send-guest-booking-confirmation/index.ts`
   - Add 4 new optional fields to interface
   - Add access notes HTML section (blue box)
   - Add EV charging HTML section (green/gray box)
   
2. `supabase/functions/stripe-webhooks/index.ts`
   - Expand spot select query to include `access_notes`, `ev_charging_instructions`, `has_ev_charging`
   - Add `will_use_ev_charging` to booking select
   - Pass all 4 new fields when calling `send-guest-booking-confirmation`

#### Email Template Additions:
```html
<!-- Access Notes Section (Blue) -->
<table style="background-color: #e0f2fe; border-left: 4px solid #0ea5e9; ...">
  <tr><td>
    <p>🔑 Access Instructions</p>
    <p>${accessNotes}</p>
  </td></tr>
</table>

<!-- EV Charging Section (Green - when opted in) -->
<table style="background-color: #dcfce7; border-left: 4px solid #22c55e; ...">
  <tr><td>
    <p>⚡ EV Charging Instructions</p>
    <p>${evChargingInstructions}</p>
  </td></tr>
</table>
```

### Expected Result
After this change, guest confirmation emails will match authenticated user emails with:
- Access instructions displayed prominently in a blue info box
- EV charging instructions in a green box (if opted in)
- "EV Charging Available" notice in gray (if available but not selected)

