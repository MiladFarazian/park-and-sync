-- This will work after you sign up - creates test spots for the first user
DO $$
DECLARE
    first_user_id UUID;
BEGIN
    -- Get the first user's ID
    SELECT user_id INTO first_user_id FROM public.profiles LIMIT 1;
    
    -- Only insert if we have a user
    IF first_user_id IS NOT NULL THEN
        -- Insert sample parking spots
        INSERT INTO public.spots (
          host_id, title, description, address, latitude, longitude, location,
          hourly_rate, daily_rate, has_ev_charging, is_covered, is_secure,
          access_notes, host_rules, status
        ) VALUES 
        (
          first_user_id,
          'Downtown Garage Premium',
          'Secure underground parking in the heart of downtown.',
          '123 Market Street, San Francisco, CA 94103',
          37.7749, -122.4194,
          ST_GeogFromText('POINT(-122.4194 37.7749)'),
          12.00, 80.00, true, true, true,
          'Enter through main entrance, take elevator to B2. Spot #47.',
          'No overnight parking. Max height 6ft 6in.',
          'active'
        ),
        (
          first_user_id,
          'Safe Residential Driveway', 
          'Safe driveway parking in residential area.',
          '456 Valencia Street, San Francisco, CA 94110',
          37.7649, -122.4094,
          ST_GeogFromText('POINT(-122.4094 37.7649)'),
          8.00, 50.00, false, false, true,
          'Park behind the blue Honda. Ring doorbell if needed.',
          'Compact cars only. Be respectful to neighbors.',
          'active'
        );

        -- Add sample photos
        INSERT INTO public.spot_photos (spot_id, url, is_primary, sort_order)
        SELECT id, '/placeholder.svg', true, 0 
        FROM public.spots 
        WHERE host_id = first_user_id;

        -- Add 24/7 availability 
        INSERT INTO public.availability_rules (spot_id, day_of_week, start_time, end_time, is_available)
        SELECT s.id, d.day, '00:00:00'::time, '23:59:59'::time, true
        FROM public.spots s
        CROSS JOIN generate_series(0, 6) d(day)
        WHERE s.host_id = first_user_id;
        
        RAISE NOTICE 'Sample spots created for user: %', first_user_id;
    ELSE
        RAISE NOTICE 'No users found. Sign up first!';
    END IF;
END $$;