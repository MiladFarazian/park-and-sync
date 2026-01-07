-- First, fix existing spots that have EV charging enabled but no premium set
-- Set has_ev_charging to false for these spots
UPDATE public.spots 
SET has_ev_charging = false 
WHERE has_ev_charging = true 
  AND (ev_charging_premium_per_hour IS NULL OR ev_charging_premium_per_hour <= 0);

-- Now add the check constraint to prevent this in the future
ALTER TABLE public.spots
ADD CONSTRAINT spots_ev_charging_premium_required
CHECK (
  has_ev_charging = false 
  OR (has_ev_charging = true AND ev_charging_premium_per_hour > 0)
);