-- Create SECURITY DEFINER function to create booking holds bypassing RLS safely
create or replace function public.create_booking_hold(
  p_spot_id uuid,
  p_user_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_expires_at timestamptz,
  p_idempotency_key text
)
returns public.booking_holds
language sql
security definer
set search_path = public
as $$
  insert into public.booking_holds (spot_id, user_id, start_at, end_at, expires_at, idempotency_key)
  values (p_spot_id, p_user_id, p_start_at, p_end_at, p_expires_at, coalesce(p_idempotency_key, gen_random_uuid()::text))
  returning *;
$$;

-- Allow authenticated users to call the function
revoke all on function public.create_booking_hold(uuid, uuid, timestamptz, timestamptz, timestamptz, text) from public;
grant execute on function public.create_booking_hold(uuid, uuid, timestamptz, timestamptz, timestamptz, text) to authenticated;