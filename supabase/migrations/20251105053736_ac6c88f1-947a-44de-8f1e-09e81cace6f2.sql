-- Add overstay tracking fields to bookings table
ALTER TABLE bookings
ADD COLUMN overstay_detected_at timestamp with time zone,
ADD COLUMN overstay_action text CHECK (overstay_action IN ('charging', 'towing')),
ADD COLUMN overstay_grace_end timestamp with time zone,
ADD COLUMN overstay_charge_amount numeric DEFAULT 0;

-- Create index for finding active bookings efficiently
CREATE INDEX idx_bookings_active ON bookings(status, end_at) 
WHERE status IN ('paid', 'active');

-- Add comment for clarity
COMMENT ON COLUMN bookings.overstay_detected_at IS 'Timestamp when host marked booking as overstayed';
COMMENT ON COLUMN bookings.overstay_action IS 'Host action: charging ($25/hr after grace) or towing';
COMMENT ON COLUMN bookings.overstay_grace_end IS 'End of 10-minute grace period';
COMMENT ON COLUMN bookings.overstay_charge_amount IS 'Total overstay charges accumulated';