-- Create a test booking starting 2 hours from now (so it can be modified)
INSERT INTO public.bookings (
  spot_id, renter_id, start_at, end_at, status,
  hourly_rate, total_hours, subtotal, platform_fee, total_amount, host_earnings
) VALUES (
  '517cd0c4-3c46-4b9d-bae8-f31de5f0499f',
  '12f65ecc-388f-46e6-b651-f1a8abaeffde',
  NOW() + INTERVAL '2 hours',
  NOW() + INTERVAL '4 hours',
  'paid', 5.00, 2.0, 12.00, 1.00, 13.00, 10.00
);