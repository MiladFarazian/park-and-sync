-- =====================================================
-- SECURITY FIX: Harden increment_balance and notifications
-- =====================================================

-- Part 1: Harden increment_balance to only allow service role
-- Drop and recreate with service role check
CREATE OR REPLACE FUNCTION public.increment_balance(user_id uuid, amount numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Security check: only service role can call this function
  IF current_setting('request.jwt.claims', true)::json->>'role' != 'service_role' THEN
    RAISE EXCEPTION 'Access denied: Only service role can modify balances';
  END IF;

  UPDATE profiles 
  SET balance = balance + amount,
      updated_at = now()
  WHERE profiles.user_id = increment_balance.user_id;
END;
$$;

-- Part 2: Fix notifications INSERT policy to restrict to service role
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;

-- Only service role (edge functions, triggers) can insert notifications
CREATE POLICY "Service role can insert notifications"
ON public.notifications
FOR INSERT
WITH CHECK (
  -- Check if caller is service role via JWT claims
  -- Note: Direct inserts from service role have role = 'service_role'
  current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  OR
  -- Allow users to insert notifications only for themselves (fallback)
  auth.uid() = user_id
);

-- Add comment documenting the security change
COMMENT ON FUNCTION public.increment_balance IS 
  'SECURITY: Service role only. Modifies user balance for payouts/refunds. Called by Stripe webhook handlers.';