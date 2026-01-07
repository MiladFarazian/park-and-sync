-- Create guest_messages table for guest-to-host communication
CREATE TABLE public.guest_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('guest', 'host')),
  message TEXT NOT NULL,
  media_url TEXT,
  media_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  read_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.guest_messages ENABLE ROW LEVEL SECURITY;

-- Hosts can read messages for their bookings
CREATE POLICY "Hosts can read guest messages" ON public.guest_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM bookings b
      JOIN spots s ON b.spot_id = s.id
      WHERE b.id = guest_messages.booking_id
      AND s.host_id = auth.uid()
    )
  );

-- Hosts can insert messages (reply to guests)
CREATE POLICY "Hosts can send guest messages" ON public.guest_messages
  FOR INSERT WITH CHECK (
    sender_type = 'host' AND
    EXISTS (
      SELECT 1 FROM bookings b
      JOIN spots s ON b.spot_id = s.id
      WHERE b.id = guest_messages.booking_id
      AND s.host_id = auth.uid()
    )
  );

-- Hosts can update messages (mark as read)
CREATE POLICY "Hosts can update guest messages" ON public.guest_messages
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM bookings b
      JOIN spots s ON b.spot_id = s.id
      WHERE b.id = guest_messages.booking_id
      AND s.host_id = auth.uid()
    )
  );

-- Enable realtime
ALTER TABLE public.guest_messages REPLICA IDENTITY FULL;

-- Add index for faster queries
CREATE INDEX idx_guest_messages_booking_id ON public.guest_messages(booking_id);
CREATE INDEX idx_guest_messages_created_at ON public.guest_messages(created_at DESC);