-- =====================================================
-- RATE LIMITING INFRASTRUCTURE
-- =====================================================

-- Create rate_limits table for tracking API request counts
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(key, window_start)
);

-- Index for fast lookups by key and window
CREATE INDEX IF NOT EXISTS idx_rate_limits_key_window ON public.rate_limits(key, window_start);

-- Index for cleanup job efficiency
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start ON public.rate_limits(window_start);

-- Enable RLS - only service role can access
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- No RLS policies = only service role can access (secure by default)

-- Function to check and increment rate limit
-- Returns true if request is allowed, false if rate limited
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key text,
  p_window_seconds integer DEFAULT 60,
  p_max_requests integer DEFAULT 10
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start timestamptz;
  v_current_count integer;
BEGIN
  -- Calculate window start based on window size
  IF p_window_seconds <= 60 THEN
    v_window_start := date_trunc('minute', now());
  ELSIF p_window_seconds <= 3600 THEN
    v_window_start := date_trunc('hour', now());
  ELSE
    v_window_start := date_trunc('day', now());
  END IF;
  
  -- Upsert: insert or increment count
  INSERT INTO rate_limits (key, window_start, count)
  VALUES (p_key, v_window_start, 1)
  ON CONFLICT (key, window_start) 
  DO UPDATE SET count = rate_limits.count + 1
  RETURNING count INTO v_current_count;
  
  RETURN v_current_count <= p_max_requests;
END;
$$;

-- Function to cleanup old rate limit records (for cron job)
CREATE OR REPLACE FUNCTION public.cleanup_old_rate_limits()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count integer;
BEGIN
  DELETE FROM rate_limits 
  WHERE window_start < now() - interval '2 hours';
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$;

-- Grant execute on functions to authenticated and anon roles
GRANT EXECUTE ON FUNCTION public.check_rate_limit TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.cleanup_old_rate_limits TO authenticated;