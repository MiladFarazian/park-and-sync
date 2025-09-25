-- Update spot photos with custom images for remaining spots
DELETE FROM public.spot_photos WHERE url = '/placeholder.svg';

-- Add custom photos for remaining spots
INSERT INTO public.spot_photos (spot_id, url, is_primary, sort_order)
SELECT s.id, '/src/assets/vermont-exposition-lot.jpg', true, 0
FROM public.spots s 
WHERE s.title = 'Vermont/Exposition Lot';

INSERT INTO public.spot_photos (spot_id, url, is_primary, sort_order)
SELECT s.id, '/src/assets/west-adams-mansion.jpg', true, 0
FROM public.spots s 
WHERE s.title = 'Historic West Adams Mansion';

INSERT INTO public.spot_photos (spot_id, url, is_primary, sort_order)
SELECT s.id, '/src/assets/main-street-venice-border.jpg', true, 0
FROM public.spots s 
WHERE s.title = 'Main Street Venice Border';

INSERT INTO public.spot_photos (spot_id, url, is_primary, sort_order)
SELECT s.id, '/src/assets/pico-business-hub.jpg', true, 0
FROM public.spots s 
WHERE s.title = 'Pico Boulevard Business Hub';

INSERT INTO public.spot_photos (spot_id, url, is_primary, sort_order)
SELECT s.id, '/src/assets/smc-college-area.jpg', true, 0
FROM public.spots s 
WHERE s.title = 'Santa Monica College Area';

INSERT INTO public.spot_photos (spot_id, url, is_primary, sort_order)
SELECT s.id, '/src/assets/wilshire-office-complex.jpg', true, 0
FROM public.spots s 
WHERE s.title = 'Wilshire Boulevard Office Complex';

INSERT INTO public.spot_photos (spot_id, url, is_primary, sort_order)
SELECT s.id, '/src/assets/melrose-design-district.jpg', true, 0
FROM public.spots s 
WHERE s.title = 'Melrose Design District';

INSERT INTO public.spot_photos (spot_id, url, is_primary, sort_order)
SELECT s.id, '/src/assets/santa-monica-blvd-hub.jpg', true, 0
FROM public.spots s 
WHERE s.title = 'Santa Monica Blvd Hub';

INSERT INTO public.spot_photos (spot_id, url, is_primary, sort_order)
SELECT s.id, '/src/assets/beverly-hills-city-hall.jpg', true, 0
FROM public.spots s 
WHERE s.title = 'Beverly Hills City Hall';

INSERT INTO public.spot_photos (spot_id, url, is_primary, sort_order)
SELECT s.id, '/src/assets/abbot-kinney-creative.jpg', true, 0
FROM public.spots s 
WHERE s.title = 'Abbot Kinney Creative District';

INSERT INTO public.spot_photos (spot_id, url, is_primary, sort_order)
SELECT s.id, '/src/assets/venice-canals-historic.jpg', true, 0
FROM public.spots s 
WHERE s.title = 'Venice Canals Historic';

INSERT INTO public.spot_photos (spot_id, url, is_primary, sort_order)
SELECT s.id, '/src/assets/arts-district-loft.jpg', true, 0
FROM public.spots s 
WHERE s.title = 'Arts District Loft';

INSERT INTO public.spot_photos (spot_id, url, is_primary, sort_order)
SELECT s.id, '/src/assets/grand-central-market.jpg', true, 0
FROM public.spots s 
WHERE s.title = 'Grand Central Market';

INSERT INTO public.spot_photos (spot_id, url, is_primary, sort_order)
SELECT s.id, '/src/assets/little-tokyo-cultural.jpg', true, 0
FROM public.spots s 
WHERE s.title = 'Little Tokyo Cultural Hub';

INSERT INTO public.spot_photos (spot_id, url, is_primary, sort_order)
SELECT s.id, '/src/assets/financial-district-highrise.jpg', true, 0
FROM public.spots s 
WHERE s.title = 'Financial District High-Rise';

INSERT INTO public.spot_photos (spot_id, url, is_primary, sort_order)
SELECT s.id, '/src/assets/hollywood-walk-fame.jpg', true, 0
FROM public.spots s 
WHERE s.title = 'Hollywood Walk of Fame';

INSERT INTO public.spot_photos (spot_id, url, is_primary, sort_order)
SELECT s.id, '/src/assets/griffith-observatory-area.jpg', true, 0
FROM public.spots s 
WHERE s.title = 'Griffith Observatory Area';

-- Update access_notes with more detailed directions for all spots
UPDATE public.spots 
SET access_notes = CASE 
    WHEN title = 'USC Campus Adjacent Garage' THEN 'Enter through main gate on Figueroa Street. Show parking pass to security guard. Your spot is B-12 on Level 2. Elevator available near entrance. Gate closes at midnight.'
    WHEN title = 'Exposition Park Driveway' THEN 'Drive to the back of the property and park behind the white Tesla Model 3. Ring doorbell #2 at the front house if you need assistance. Access code for side gate is 2847.'
    WHEN title = 'Vermont/Exposition Lot' THEN 'Enter lot from Vermont Avenue entrance. Drive to spot #47 located near the chain-link fence on the north side. Pay the attendant in the blue booth or use SpotPark mobile app. Lot has 24/7 security cameras.'
    WHEN title = 'Historic West Adams Mansion' THEN 'Use electronic gate code 1908 to enter the property. Park in the designated visitor area (marked with white lines) to the right of the main driveway. Please respect the historic nature of this property.'
    WHEN title = 'Santa Monica Pier Parking' THEN 'Spot is located on the Ocean Avenue side of the building. Beach gear storage locker #15 is available with your booking. Validation available at participating pier merchants. Watch for street cleaning Tuesdays 8-10 AM.'
    WHEN title = 'Third Street Promenade Garage' THEN 'Enter garage from 3rd Street entrance. Take elevator or stairs to Level 2, Section C. Your reserved spot will be marked with your booking number. Validation available at promenade businesses.'
    WHEN title = 'Main Street Venice Border' THEN 'Park in front of the distinctive blue building with murals (address 789). Meter enforcement is Monday-Friday 8 AM-6 PM. Free parking on weekends and holidays. Support local artists and businesses!'
    WHEN title = 'Pico Boulevard Business Hub' THEN 'Enter through the main business center entrance and check in with reception for parking validation. Your reserved spot is in the covered section. Business center amenities included with parking.'
    WHEN title = 'Santa Monica College Area' THEN 'Student discount available with valid student ID (20% off). Park in designated visitor spots near the campus entrance. Bus stop for Big Blue Bus lines 1, 2, and 8 is right across the street.'
    WHEN title = 'Wilshire Boulevard Office Complex' THEN 'Valet service available Monday-Friday 7 AM-7 PM ($5 extra). For self-park, take elevator to Level P2. Business center access includes WiFi, printing, and conference room booking.'
    WHEN title = 'Sunset Strip Premium' THEN 'VIP entrance through the lobby of 8901 Sunset Boulevard. Concierge available 24/7 for restaurant reservations and club entry assistance. Premium location for nightlife enthusiasts.'
    WHEN title = 'Melrose Design District' THEN 'Street parking with 2-hour validation available at participating vintage shops and boutiques. Perfect for fashion shopping and Instagram photos. Meter enforcement ends at 6 PM.'
    WHEN title = 'Santa Monica Blvd Hub' THEN 'Metered street parking with mobile payment options (ParkSmarter app accepted). Located in the heart of West Hollywood''s LGBTQ+ district. Walking distance to all major clubs and restaurants.'
    WHEN title = 'Rodeo Drive Luxury' THEN 'Valet parking service available through the concierge. For self-parking, spaces are located in the private garage beneath the building. Concierge shopping assistance available upon request.'
    WHEN title = 'Beverly Hills City Hall' THEN 'Enter public parking structure from Rexford Drive. Take ticket at entrance and validate at city hall information desk. Convenient for city services and nearby Golden Triangle shopping.'
    WHEN title = 'Venice Beach Boardwalk' THEN 'Beach parking area - bring quarters for meters ($1.25/hour). Optional sand cleanup service available for $10. Watch for street performers and enjoy the iconic Venice vibe!'
    WHEN title = 'Abbot Kinney Creative District' THEN 'Park in the creative district hub area. Support local artists by visiting galleries and boutiques. Many shops offer parking validation. Perfect for discovering unique Venice culture.'
    WHEN title = 'Venice Canals Historic' THEN 'Quiet residential street parking perfect for peaceful canal walks. Respect the neighborhood and observe quiet hours after 9 PM. Historic area with beautiful photo opportunities.'
    WHEN title = 'Staples Center Event Parking' THEN 'Premium event parking with direct access to arena. Book early for Lakers, Clippers, and major concerts. Pricing varies by event. Entry through South Park entrance on game days.'
    WHEN title = 'Arts District Loft' THEN 'Industrial area perfect for brewery hopping and gallery visits. Street art tours available on weekends. Many spots offer validation at local breweries and art spaces.'
    WHEN title = 'Grand Central Market' THEN 'Historic food hall parking with validation available at market information booth (minimum $10 purchase). Perfect for experiencing LA''s diverse culinary scene. Try the famous egg sandwiches!'
    WHEN title = 'Little Tokyo Cultural Hub' THEN 'Cultural district parking near Japanese American Museum and authentic restaurants. Some venues require shoe removal - bring socks! Parking validation at cultural center gift shop.'
    WHEN title = 'Financial District High-Rise' THEN 'Corporate parking with business center access. Professional dress code recommended in building common areas. Conference room booking available through concierge. Valet service during business hours.'
    WHEN title = 'Hollywood Walk of Fame' THEN 'Tourist central location! Perfect for star photos and celebrity spotting. Street performers and costumed characters are common. Bring your camera and comfortable walking shoes.'
    WHEN title = 'Griffith Observatory Area' THEN 'Scenic mountain parking perfect for hikers and stargazers. Observatory is free but parking fills up on clear nights. Bring layers - it gets cool at elevation. Hiking trails nearby.'
    ELSE access_notes
END;