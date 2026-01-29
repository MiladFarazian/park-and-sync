
# Fix: Incorrect Platform Fee Display on Host Booking Confirmation

## Issue Identified

The `HostBookingConfirmation.tsx` page displays **"Platform Fee (15%)"** on line 422, which is incorrect in two ways:

1. **Wrong percentage**: The label says 15%, but the actual service fee is **20% of host earnings (or $1 minimum)**
2. **Inconsistent terminology**: All other pages use "Service fee" without a percentage

Additionally, showing `booking.subtotal` to hosts is mixing driver-facing amounts with host earnings, which can cause confusion.

### Current Display (Incorrect)
```
Booking Subtotal:       $12.00
Platform Fee (15%):    -$1.80
Your Earnings:         $10.50
```

### Issue with the Math
- $12.00 × 15% = $1.80 ✓ (this is what's displayed)
- But the actual fee logic is: 20% of **host earnings** or $1 minimum
- Host hourly rate is $3.00, so for 3.5 hours: $3.00 × 3.5 = $10.50 host earnings
- Service fee should be: max($10.50 × 0.20, $1.00) = $2.10

This booking appears to have been created with old/different pricing logic.

---

## Solution

Change the display to match the established pattern from other pages and follow the host earnings transparency guidelines:

**Option A (Recommended - Simplest)**: Show a cleaner breakdown that accurately reflects what hosts care about

```
Your Rate:              $3.00/hr × 3.5 hrs = $10.50
Platform Fee (20%):    -$2.10  (or show actual stored value)
Your Earnings:         $10.50
```

**Option B**: Remove the percentage from the label entirely (consistent with driver-facing pages)

```
Booking Subtotal:      $12.00
Platform Fee:         -$1.80
Your Earnings:        $10.50
```

I recommend **Option B** because:
- It matches driver-facing pages ("Service fee" without percentage)
- It works with both old and new booking data
- It doesn't require recalculating fees for legacy bookings

---

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/HostBookingConfirmation.tsx` | Line 422: Change "Platform Fee (15%)" to "Platform Fee" |

---

## Implementation

### HostBookingConfirmation.tsx - Line 422

```typescript
// BEFORE
<span className="text-muted-foreground">Platform Fee (15%)</span>

// AFTER
<span className="text-muted-foreground">Platform Fee</span>
```

---

## Additional Consideration

The `booking.subtotal` displayed ($12.00) is the **driver's** payment subtotal, not the host's gross earnings. This is slightly confusing terminology for hosts. However, changing this would require more extensive refactoring to recalculate based on `hourly_rate × hours`. 

For now, the minimal fix (removing the incorrect "15%") addresses the immediate issue. A future enhancement could display:

```
Your Rate × Duration:   $3.00/hr × 3.5 hrs
Platform Fee:          -$1.80
Your Earnings:         $10.50
```

---

## Summary

A one-line fix to change "Platform Fee (15%)" to "Platform Fee" will:
- Remove the incorrect percentage
- Be consistent with other pages that show "Service fee" without percentages
- Work correctly for both legacy and new bookings
