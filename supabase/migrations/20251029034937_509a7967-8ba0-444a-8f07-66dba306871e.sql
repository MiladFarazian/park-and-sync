-- Add availability rules for all days of the week for existing active spots

-- First, add rules for remaining days (Wednesday-Saturday) for "My Driveway" spot
INSERT INTO availability_rules (spot_id, day_of_week, start_time, end_time, is_available)
VALUES 
  ('28af45f2-bb17-4168-a6d1-f7c0ba5661b4', 3, '09:00:00', '17:00:00', true),
  ('28af45f2-bb17-4168-a6d1-f7c0ba5661b4', 4, '09:00:00', '17:00:00', true),
  ('28af45f2-bb17-4168-a6d1-f7c0ba5661b4', 5, '09:00:00', '17:00:00', true),
  ('28af45f2-bb17-4168-a6d1-f7c0ba5661b4', 6, '09:00:00', '17:00:00', true)
ON CONFLICT DO NOTHING;

-- Add availability rules for all days for "10 Speed Coffee Sawtelle" spot (24/7 availability)
INSERT INTO availability_rules (spot_id, day_of_week, start_time, end_time, is_available)
VALUES 
  ('4b95736c-5903-4eaa-bdc6-ad82bb051e91', 0, '00:00:00', '23:59:00', true),
  ('4b95736c-5903-4eaa-bdc6-ad82bb051e91', 1, '00:00:00', '23:59:00', true),
  ('4b95736c-5903-4eaa-bdc6-ad82bb051e91', 2, '00:00:00', '23:59:00', true),
  ('4b95736c-5903-4eaa-bdc6-ad82bb051e91', 3, '00:00:00', '23:59:00', true),
  ('4b95736c-5903-4eaa-bdc6-ad82bb051e91', 4, '00:00:00', '23:59:00', true),
  ('4b95736c-5903-4eaa-bdc6-ad82bb051e91', 5, '00:00:00', '23:59:00', true),
  ('4b95736c-5903-4eaa-bdc6-ad82bb051e91', 6, '00:00:00', '23:59:00', true)
ON CONFLICT DO NOTHING;