-- Create table to track demand notifications sent to hosts
-- This prevents duplicate notifications within the same day
CREATE TABLE public.demand_notifications_sent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  notification_date DATE NOT NULL DEFAULT CURRENT_DATE,
  search_location GEOGRAPHY(POINT, 4326) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Unique constraint: one notification per host per day
  CONSTRAINT unique_host_per_day UNIQUE (host_id, notification_date)
);

-- Index for efficient lookups by host and date
CREATE INDEX idx_demand_notifications_host_date 
  ON public.demand_notifications_sent(host_id, notification_date);

-- Index for cleanup of old records
CREATE INDEX idx_demand_notifications_created_at 
  ON public.demand_notifications_sent(created_at);

-- Enable RLS - only service role can access this table
ALTER TABLE public.demand_notifications_sent ENABLE ROW LEVEL SECURITY;

-- No user-facing policies - only service role can insert/read
-- This is intentional as this table is only accessed by edge functions

-- Add comment for documentation
COMMENT ON TABLE public.demand_notifications_sent IS 'Tracks demand-based push notifications sent to hosts when drivers search and find no available spots nearby. Used to suppress duplicate notifications within the same day.';