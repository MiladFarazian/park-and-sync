-- Delete all related data first (respecting foreign key constraints)
DELETE FROM reviews WHERE booking_id IN (SELECT id FROM bookings);
DELETE FROM messages WHERE booking_id IN (SELECT id FROM bookings);
DELETE FROM booking_holds;
DELETE FROM bookings;
DELETE FROM spot_photos;
DELETE FROM availability_rules;
DELETE FROM calendar_overrides;

-- Finally delete all spots
DELETE FROM spots;