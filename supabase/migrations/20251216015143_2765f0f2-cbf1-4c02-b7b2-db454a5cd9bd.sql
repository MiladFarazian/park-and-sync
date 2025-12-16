-- Add custom_rate column to availability_rules for day-of-week pricing
ALTER TABLE public.availability_rules 
ADD COLUMN custom_rate numeric NULL;

-- Add custom_rate column to calendar_overrides for specific date pricing
ALTER TABLE public.calendar_overrides 
ADD COLUMN custom_rate numeric NULL;

-- Add comments for clarity
COMMENT ON COLUMN public.availability_rules.custom_rate IS 'Custom hourly rate for this day. If NULL, uses spot base rate.';
COMMENT ON COLUMN public.calendar_overrides.custom_rate IS 'Custom hourly rate for this date. If NULL, uses spot base rate or day-of-week rate.';