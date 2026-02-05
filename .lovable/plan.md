
## Fix Host Earnings Breakdown on BookingDetail Page

### Problem
The BookingDetail page currently shows hosts:
- **"Driver paid"**: $33.00
- **"Parkzy fee"**: -$6.00 (which is 20% of driver total)

This is confusing because it implies the host is paying 20% when actually:
- Host rate × hours = Host Gross
- 10% platform fee is deducted from Host Gross
- Driver's 10% service fee is separate and shouldn't be visible to host

### Solution
Update the Host earnings breakdown to match the transparent model shown on HostBookingConfirmation page:

**Before (current - confusing)**:
```
You earned                    $27.00
─────────────────────────────────────
Driver paid                   $33.00
Parkzy fee                    -$6.00
```

**After (transparent - correct)**:
```
You earned                    $27.00
─────────────────────────────────────
Gross earnings (2hrs × $15)   $30.00
Platform fee (10%)            -$3.00
[EV Charging (100% to you)]   $X.XX   ← only if applicable
```

---

### Technical Changes

#### File: `src/pages/BookingDetail.tsx`

**Location**: Lines 909-920 (the Host earnings breakdown section)

**Current code**:
```tsx
<div className="text-xs text-muted-foreground space-y-1">
  <div className="flex justify-between">
    <span>Driver paid</span>
    <span>${(booking.total_amount + booking.overstay_charge_amount).toFixed(2)}</span>
  </div>
  <div className="flex justify-between">
    <span>Parkzy fee</span>
    <span>-${getParkzyFee(booking).toFixed(2)}</span>
  </div>
</div>
```

**New code**:
```tsx
{(() => {
  // Calculate host gross and platform fee
  const durationMs = new Date(booking.end_at).getTime() - new Date(booking.start_at).getTime();
  const totalMinutes = Math.round(durationMs / (1000 * 60));
  const hours = totalMinutes / 60;
  const hostGross = Math.round(booking.hourly_rate * hours * 100) / 100;
  const platformFee = calculatePlatformFee(hostGross);
  const evChargingFee = booking.ev_charging_fee ?? 0;
  
  // Format duration for display
  const hoursInt = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const durationLabel = hoursInt === 0 ? `${minutes}min` : 
                        minutes === 0 ? `${hoursInt}h` : 
                        `${hoursInt}h ${minutes}min`;
  
  return (
    <div className="text-xs text-muted-foreground space-y-1">
      <div className="flex justify-between">
        <span>Gross earnings ({durationLabel} × ${booking.hourly_rate.toFixed(2)})</span>
        <span>${hostGross.toFixed(2)}</span>
      </div>
      <div className="flex justify-between">
        <span>Platform fee (10%)</span>
        <span className="text-destructive">-${platformFee.toFixed(2)}</span>
      </div>
      {evChargingFee > 0 && (
        <div className="flex justify-between">
          <span>EV Charging (100% to you)</span>
          <span>${evChargingFee.toFixed(2)}</span>
        </div>
      )}
    </div>
  );
})()}
```

**Import changes**: `calculatePlatformFee` is already imported from `@/lib/pricing` (line 19)

---

### User Experience After Fix
- Hosts see their **gross earnings** (rate × time) clearly
- The **10% platform fee** is shown as a deduction from their gross
- **EV charging** is shown separately (if applicable) with "(100% to you)" label
- The breakdown is consistent with HostBookingConfirmation page
- No more confusion about "20%" fees

---

### Files to Modify
| File | Lines | Change |
|------|-------|--------|
| `src/pages/BookingDetail.tsx` | 909-920 | Replace "Driver paid / Parkzy fee" breakdown with "Gross earnings / Platform fee (10%)" breakdown |
