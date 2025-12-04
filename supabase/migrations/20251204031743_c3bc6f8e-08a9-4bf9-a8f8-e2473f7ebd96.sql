-- Allow email to be nullable for phone-based signups
ALTER TABLE public.profiles ALTER COLUMN email DROP NOT NULL;