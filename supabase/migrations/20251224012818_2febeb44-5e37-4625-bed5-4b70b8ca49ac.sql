-- Create has_role security definer function (if not exists)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS Policy: Support can read all bookings
CREATE POLICY "Support can read all bookings"
ON public.bookings
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'support'));

-- RLS Policy: Support can read all spot_reports
CREATE POLICY "Support can read all spot_reports"
ON public.spot_reports
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'support'));

-- RLS Policy: Support can update spot_reports
CREATE POLICY "Support can update spot_reports"
ON public.spot_reports
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'support'));

-- RLS Policy: Support can read messages involving SUPPORT_USER_ID
CREATE POLICY "Support can read support messages"
ON public.messages
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'support') AND (
    sender_id = '00000000-0000-0000-0000-000000000001' OR
    recipient_id = '00000000-0000-0000-0000-000000000001'
  )
);

-- RLS Policy: Support can insert messages as Parkzy Support
CREATE POLICY "Support can send messages as support"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'support') AND
  sender_id = '00000000-0000-0000-0000-000000000001'
);

-- RLS Policy: Support can update messages (mark as read)
CREATE POLICY "Support can update support messages"
ON public.messages
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'support') AND
  recipient_id = '00000000-0000-0000-0000-000000000001'
);

-- RLS Policy: Support can read all spots (for context on reports/reservations)
CREATE POLICY "Support can read all spots"
ON public.spots
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'support'));

-- RLS Policy: Support can read all profiles (for context)
CREATE POLICY "Support can read all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'support'));