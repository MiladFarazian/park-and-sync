-- Fix the existing Porter Ranch spot coordinates
UPDATE spots 
SET 
  latitude = 34.282308,
  longitude = -118.5619,
  location = ST_SetSRID(ST_MakePoint(-118.5619, 34.282308), 4326)::geography
WHERE address LIKE '%Porter Ranch%' 
  AND latitude = 34.0522 
  AND longitude = -118.2437;