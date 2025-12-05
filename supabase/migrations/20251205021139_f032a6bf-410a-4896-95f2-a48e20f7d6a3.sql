-- Create spot_reports table for tracking reported listings
CREATE TABLE public.spot_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  spot_id UUID NOT NULL REFERENCES public.spots(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.spot_reports ENABLE ROW LEVEL SECURITY;

-- Users can create reports
CREATE POLICY "Users can create reports" 
ON public.spot_reports 
FOR INSERT 
WITH CHECK (auth.uid() = reporter_id);

-- Users can view their own reports
CREATE POLICY "Users can view own reports" 
ON public.spot_reports 
FOR SELECT 
USING (auth.uid() = reporter_id);

-- Create index for faster lookups
CREATE INDEX idx_spot_reports_spot_id ON public.spot_reports(spot_id);
CREATE INDEX idx_spot_reports_status ON public.spot_reports(status);