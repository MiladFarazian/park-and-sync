

# Fix: PostgreSQL Function Overloading Conflict (create_booking_atomic)

## Problem Summary

The booking edge function is returning a 500 error because PostgreSQL has **two versions** of the `create_booking_atomic` function with identical parameter types but in different order. PostgREST cannot determine which function to call, resulting in error `PGRST203`.

## Root Cause

When the multi-spot migration ran, it created a new version of `create_booking_atomic` without dropping the old version first. Both functions have the same 14 parameter types, just ordered differently:

| Parameter Position | Old Version | New Version |
|--------------------|-------------|-------------|
| 3 | p_start_at (TIMESTAMPTZ) | p_vehicle_id (UUID) |
| 4 | p_end_at (TIMESTAMPTZ) | p_start_at (TIMESTAMPTZ) |
| 5 | p_vehicle_id (UUID) | p_end_at (TIMESTAMPTZ) |

PostgreSQL treats these as **two separate functions** (overloaded by name) because parameter order differs, but PostgREST cannot resolve named parameters to either candidate.

## Solution

Create a database migration that:
1. Drops **both** existing function signatures explicitly
2. Creates a single, definitive version with quantity-aware logic

---

## Database Migration

```sql
-- Drop old function signatures to resolve overloading conflict
DROP FUNCTION IF EXISTS public.create_booking_atomic(
  UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, BOOLEAN, 
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC
);

DROP FUNCTION IF EXISTS public.create_booking_atomic(
  UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, NUMERIC, 
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, BOOLEAN, NUMERIC, TEXT
);

-- Recreate with consistent parameter order matching edge function calls
CREATE OR REPLACE FUNCTION public.create_booking_atomic(
  p_spot_id UUID,
  p_user_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ,
  p_vehicle_id UUID,
  p_idempotency_key TEXT,
  p_will_use_ev_charging BOOLEAN,
  p_hourly_rate NUMERIC,
  p_total_hours NUMERIC,
  p_subtotal NUMERIC,
  p_platform_fee NUMERIC,
  p_total_amount NUMERIC,
  p_host_earnings NUMERIC,
  p_ev_charging_fee NUMERIC
)
RETURNS TABLE(success BOOLEAN, booking_id UUID, error_message TEXT)
...
-- Function body includes quantity-aware availability logic
```

The new function will:
- Match the edge function's parameter order exactly
- Include quantity-aware availability checks (`get_spot_available_quantity`)
- Use `FOR UPDATE` row locking on the spot
- Support the multi-spot listing feature

---

## Files to Modify

| File | Change |
|------|--------|
| `supabase/migrations/YYYYMMDD_fix_create_booking_atomic_overload.sql` | New migration to drop old signatures and recreate function |

## Expected Outcome

After this migration:
- Only one version of `create_booking_atomic` will exist
- Edge function calls will resolve correctly
- Bookings will work again with multi-spot quantity support

