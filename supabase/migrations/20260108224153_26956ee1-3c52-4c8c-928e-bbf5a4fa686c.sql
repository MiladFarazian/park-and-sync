-- Add EV charger type column to spots table
ALTER TABLE public.spots 
ADD COLUMN ev_charger_type TEXT;

-- Add a comment explaining the valid values
COMMENT ON COLUMN public.spots.ev_charger_type IS 'Type of EV charger: tesla_nacs, j1772, ccs1, chademo';