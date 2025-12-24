-- Allow support users to read all vehicles (for viewing user details)
CREATE POLICY "Support can read all vehicles"
ON public.vehicles
FOR SELECT
USING (has_role(auth.uid(), 'support'));