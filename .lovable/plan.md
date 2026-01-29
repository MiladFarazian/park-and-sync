
# Multi-Spot (Bulk) Listing for Parking Lot Hosts

## Overview

This feature enables commercial parking lot hosts to create a single listing that represents multiple identical parking spots (up to 1,000) at the same address. Instead of creating individual spot entries for each space, hosts can specify a quantity, and the system dynamically tracks availability based on concurrent bookings.

---

## Architecture Decision

### Approach: Add `quantity` Column to Existing `spots` Table

Rather than creating a separate "lot" abstraction, we'll extend the existing `spots` table with a `quantity` field. This approach:

- Minimizes changes to existing UI components and queries
- Maintains compatibility with all current features (availability rules, calendar overrides, photos, etc.)
- Allows gradual adoption (existing spots default to quantity = 1)

---

## Database Schema Changes

### 1. Add `quantity` Column to `spots` Table

```sql
ALTER TABLE spots 
ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1
CHECK (quantity >= 1 AND quantity <= 1000);
```

### 2. Create Function to Count Concurrent Bookings

```sql
CREATE OR REPLACE FUNCTION get_spot_booking_count(
  p_spot_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ,
  p_exclude_booking_id UUID DEFAULT NULL
) RETURNS INTEGER
```

This function counts how many bookings overlap with a given time window for a spot.

### 3. Create Function to Get Available Quantity

```sql
CREATE OR REPLACE FUNCTION get_spot_available_quantity(
  p_spot_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ
) RETURNS INTEGER
```

Returns: `spot.quantity - concurrent_bookings_count - concurrent_holds_count`

### 4. Update `check_spot_availability` Function

Modify to return `TRUE` if `available_quantity >= 1` (or >= requested quantity for multi-booking).

### 5. Update Atomic Booking Functions

Modify `create_booking_hold_atomic` and `create_booking_atomic` to:
- Check available quantity instead of simple conflict detection
- Support optional `p_requested_quantity` parameter for future multi-spot bookings

---

## Backend Changes

### Edge Functions to Update

| Function | Change Required |
|----------|-----------------|
| `search-spots-lite` | Include `quantity` in response; filter by available quantity for time range |
| `search-spots` | Same as above |
| `create-booking-hold` | Check available quantity ≥ 1 |
| `create-booking` | Check available quantity ≥ 1 |
| `create-guest-booking` | Check available quantity ≥ 1 |

### Availability Calculation in Search

When searching with a time range, spots should only appear if:
```
spot.quantity > COUNT(active_bookings_in_time_window) + COUNT(active_holds_in_time_window)
```

---

## Frontend Changes

### 1. List Spot Flow (`ListSpot.tsx`)

Add Step 1.5 or integrate into Step 1:
- **Quantity Input**: Number field (1-1000) with label "How many identical spots?"
- **Category Detection**: Show quantity field prominently for "Commercial Lot", "Apartment / Condo Lot", and "Event / Venue Lot"
- **Explanation Text**: "All spots share the same price, availability, and rules"

```text
┌────────────────────────────────────────┐
│ How many identical parking spots?      │
│ ┌──────────────────┐                   │
│ │ 50               │ spots             │
│ └──────────────────┘                   │
│ All spots share the same price,        │
│ schedule, and instructions.            │
└────────────────────────────────────────┘
```

### 2. Edit Spot Page (`EditSpot.tsx`)

Add editable quantity field in the details section:
- Input with current quantity value
- Validation: Cannot reduce below current concurrent bookings

### 3. Dashboard/Listings Tab (`Dashboard.tsx`)

Display quantity badge on listing cards:
```text
┌─────────────────────────────────────┐
│ [Commercial Lot] [50 spots]         │
│ 📍 123 Main St, Los Angeles         │
│ ⏰ 8 AM - 6 PM Daily                │
│ 💰 $5/hr                            │
│ ──────────────────────────────────  │
│ Total Earnings: $1,250.00           │
└─────────────────────────────────────┘
```

### 4. Spot Detail Page (`SpotDetail.tsx`)

For multi-spot listings:
- Show "X of Y spots available" instead of simple availability
- Example: "3 of 50 spots available for your selected time"

### 5. Explore/Search Results

Map pins and spot cards:
- Show available quantity when time filter is active
- Badge: "3 available" or "Last spot!" 

### 6. Booking Page (`Booking.tsx`)

For future enhancement (Phase 2):
- Quantity selector for booking multiple spots at once
- "Book X spots" with quantity dropdown

---

## Data Flow Diagram

```text
┌─────────────────┐     ┌──────────────────────┐
│  Driver Search  │────▶│ search-spots-lite    │
│  (with times)   │     │ - Get spots          │
└─────────────────┘     │ - Calculate avail qty│
                        │ - Return with count  │
                        └──────────────────────┘
                                   │
                                   ▼
                        ┌──────────────────────┐
                        │  Explore Page        │
                        │  - Show "X available"│
                        └──────────────────────┘
                                   │
                                   ▼
                        ┌──────────────────────┐
                        │  Booking Page        │
                        │  - check_spot_avail  │
                        │  - Returns TRUE if   │
                        │    avail_qty >= 1    │
                        └──────────────────────┘
                                   │
                                   ▼
                        ┌──────────────────────┐
                        │  create_booking_hold │
                        │  atomic              │
                        │  - Verify qty >= 1   │
                        │  - Create hold       │
                        └──────────────────────┘
                                   │
                                   ▼
                        ┌──────────────────────┐
                        │  create_booking      │
                        │  atomic              │
                        │  - Re-verify qty     │
                        │  - Create booking    │
                        └──────────────────────┘
```

---

## Implementation Phases

### Phase 1: Core Infrastructure (This Implementation)
1. Database migration: Add `quantity` column
2. Create quantity-aware availability functions
3. Update atomic booking functions for quantity checks
4. Update search functions to return available quantity
5. Add quantity input to List Spot flow
6. Display quantity on Dashboard listings
7. Show available quantity on Spot Detail page

### Phase 2: Multi-Spot Booking (Future)
- Allow drivers to book multiple spots in one transaction
- Update pricing calculations for multi-spot bookings
- Update booking confirmation UI

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/YYYYMMDD_add_spot_quantity.sql` | Create | Add quantity column and helper functions |
| `supabase/functions/search-spots-lite/index.ts` | Modify | Include quantity and available count |
| `supabase/functions/search-spots/index.ts` | Modify | Include quantity and available count |
| `supabase/functions/create-booking-hold/index.ts` | Modify | Use quantity-aware availability check |
| `supabase/functions/create-booking/index.ts` | Modify | Use quantity-aware availability check |
| `supabase/functions/create-guest-booking/index.ts` | Modify | Use quantity-aware availability check |
| `src/pages/ListSpot.tsx` | Modify | Add quantity input field |
| `src/pages/EditSpot.tsx` | Modify | Add quantity editing |
| `src/pages/Dashboard.tsx` | Modify | Display quantity badge on listings |
| `src/pages/SpotDetail.tsx` | Modify | Show "X of Y available" |
| `src/pages/Explore.tsx` | Modify | Display available quantity badges |
| `src/components/explore/DesktopSpotList.tsx` | Modify | Show quantity info on cards |
| `src/integrations/supabase/types.ts` | Auto-updated | Will include new quantity field |

---

## Technical Considerations

### Race Condition Prevention
The existing atomic booking functions use `FOR UPDATE` row locking. We'll extend this to:
1. Lock the spot row
2. Count current overlapping bookings/holds
3. Verify available quantity ≥ requested quantity
4. Create the hold/booking

### Quantity Reduction Validation
When a host edits quantity:
- Query max concurrent bookings across all time windows
- Prevent reducing below this maximum
- Show clear error: "Cannot reduce to X spots - you have Y concurrent bookings on [date]"

### Performance
- Availability count queries use indexed columns (`spot_id`, `start_at`, `end_at`, `status`)
- Consider adding partial index: `CREATE INDEX idx_bookings_active ON bookings(spot_id, start_at, end_at) WHERE status IN ('pending', 'paid', 'active', 'held')`

---

## Testing Scenarios

1. **Create lot listing**: Host creates a 50-spot commercial lot
2. **Concurrent bookings**: 50 drivers book the same time slot (all succeed)
3. **51st booking fails**: 51st driver sees "No spots available"
4. **Partial availability**: If 48 spots are booked, show "2 available"
5. **Quantity reduction**: Host cannot reduce to 40 if 45 are booked concurrently
6. **Mixed bookings**: Verify holds and bookings are both counted
7. **Booking cancellation**: Available quantity increases when booking cancelled
