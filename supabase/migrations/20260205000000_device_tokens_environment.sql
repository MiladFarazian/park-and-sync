-- Add environment column to device_tokens table
-- This tracks whether the token was generated from a development (Xcode) or production (TestFlight/App Store) build
-- Tokens can only be used with the matching APNs server (sandbox vs production)

ALTER TABLE public.device_tokens
ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'production'
CHECK (environment IN ('development', 'production'));

-- Add comment explaining the column
COMMENT ON COLUMN public.device_tokens.environment IS 'APNs environment: development (Xcode builds) or production (TestFlight/App Store)';

-- Create index for efficient filtering by environment when sending notifications
CREATE INDEX IF NOT EXISTS idx_device_tokens_environment ON public.device_tokens(environment);
