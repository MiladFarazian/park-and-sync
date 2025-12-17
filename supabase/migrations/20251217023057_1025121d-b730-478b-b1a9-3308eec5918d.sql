-- Create a new test booking ending in ~15.5 minutes to test notification
INSERT INTO public.bookings (
  spot_id, renter_id, start_at, end_at, status,
  hourly_rate, total_hours, subtotal, platform_fee, total_amount, host_earnings
) VALUES (
  '517cd0c4-3c46-4b9d-bae8-f31de5f0499f',
  '12f65ecc-388f-46e6-b651-f1a8abaeffde',
  NOW() - INTERVAL '1 hour',
  NOW() + INTERVAL '15 minutes 30 seconds',
  'active', 5.00, 1.25, 6.25, 1.25, 7.50, 5.00
);