-- Fix the test booking to have correct pricing values for a 2-hour $5/hr booking
-- hostRate = $5, upcharge = $1, driverRate = $6
-- subtotal = $6 × 2hrs = $12
-- platformFee = max($5 × 0.20, $1) × 2hrs wait no, fee is on total
-- Actually: platformFee = max(hostEarnings × 0.20, $1) = max($10 × 0.20, $1) = $2
-- totalAmount = $12 + $2 = $14

UPDATE bookings 
SET 
  subtotal = 12.00,
  platform_fee = 2.00,
  total_amount = 14.00,
  hourly_rate = 5.00,
  total_hours = 2.00
WHERE id = 'c1296fd3-73f3-4a86-8dc0-7499a1dbe684';