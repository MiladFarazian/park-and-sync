-- This will create sample spots using your user account as the host
-- Run this AFTER you sign up for an account

-- First, let's check if we have any profiles
DO $$
DECLARE
    user_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO user_count FROM public.profiles;
    
    IF user_count > 0 THEN
        -- Insert sample parking spots
        INSERT INTO public.spots (
          host_id, title, description, address, latitude, longitude, location,
          hourly_rate, daily_rate, has_ev_charging, is_covered, is_secure,
          access_notes, host_rules, status
        ) VALUES 
        (
          (SELECT user_id FROM public.profiles LIMIT 1),
          'Downtown Garage Premium',
          'Secure underground parking in the heart of downtown. Perfect for business meetings and shopping.',
          '123 Market Street, San Francisco, CA 94103',
          37.7749,
          -122.4194,
          ST_GeogFromText('POINT(-122.4194 37.7749)'),
          12.00,
          80.00,
          true,
          true,
          true,
          'Enter through main entrance, take elevator to B2. Spot #47.',
          'No overnight parking. Max height 6ft 6in.',
          'active'
        ),
        (
          (SELECT user_id FROM public.profiles LIMIT 1),
          'Residential Driveway - Mission',
          'Safe driveway parking in residential area. Easy access to public transport.',
          '456 Valencia Street, San Francisco, CA 94110', 
          37.7649,
          -122.4094,
          ST_GeogFromText('POINT(-122.4094 37.7649)'),
          8.00,
          50.00,
          false,
          false,
          true,
          'Park behind the blue Honda. Ring doorbell if needed.',
          'Compact cars only. Be respectful to neighbors.',
          'active'
        ),
        (
          (SELECT user_id FROM public.profiles LIMIT 1),
          'Mall Parking with EV Charging',
          'Shopping mall parking with Tesla Supercharger access.',
          '789 Geary Boulevard, San Francisco, CA 94109',
          37.7849,
          -122.4294,
          ST_GeogFromText('POINT(-122.4294 37.7849)'),
          6.00,
          40.00,
          true,
          false,
          false,
          'Level 2 parking, near Macys entrance. Charging stations available.',
          'Shopping customers welcome. 4 hour maximum.',
          'active'
        );

        -- Add sample photos
        INSERT INTO public.spot_photos (spot_id, url, is_primary, sort_order)
        SELECT 
          id,
          '/placeholder.svg',
          true,
          0
        FROM public.spots
        WHERE title IN ('Downtown Garage Premium', 'Residential Driveway - Mission', 'Mall Parking with EV Charging');

        -- Add availability rules (24/7 for testing)
        INSERT INTO public.availability_rules (spot_id, day_of_week, start_time, end_time, is_available)
        SELECT 
          s.id,
          generate_series(0, 6) as day_of_week,
          '00:00:00'::time,
          '23:59:59'::time,
          true
        FROM public.spots s
        WHERE s.title IN ('Downtown Garage Premium', 'Residential Driveway - Mission', 'Mall Parking with EV Charging');

        RAISE NOTICE 'Sample parking spots created successfully!';
    ELSE
        RAISE NOTICE 'No user profiles found. Please sign up first, then run this migration again.';
    END IF;
END $$;