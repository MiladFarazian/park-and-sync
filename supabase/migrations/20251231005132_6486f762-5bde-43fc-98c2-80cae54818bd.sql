-- Drop the previous trigger since it may not work with net.http_post
DROP TRIGGER IF EXISTS on_email_confirmed ON auth.users;
DROP FUNCTION IF EXISTS public.send_welcome_email_on_confirm();

-- Create a simpler tracking approach: add a welcome_email_sent column to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS welcome_email_sent BOOLEAN DEFAULT FALSE;