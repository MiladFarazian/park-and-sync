-- Drop the old 4-parameter version of check_spot_availability
-- Keep only the 5-parameter version with default values
DROP FUNCTION IF EXISTS check_spot_availability(uuid, timestamptz, timestamptz, uuid);