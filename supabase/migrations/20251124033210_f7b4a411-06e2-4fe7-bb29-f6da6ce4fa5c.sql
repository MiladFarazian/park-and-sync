-- Add departed_at column to track when driver confirms departure
ALTER TABLE bookings ADD COLUMN departed_at TIMESTAMP WITH TIME ZONE;

-- Add index for efficient querying of bookings needing auto-completion
CREATE INDEX idx_bookings_completion 
ON bookings(status, end_at) 
WHERE status IN ('active', 'paid') AND overstay_detected_at IS NULL;

-- Add comment for clarity
COMMENT ON COLUMN bookings.departed_at IS 'Timestamp when driver confirmed they left the parking spot';