-- Clean up all recent test bookings for that spot
DELETE FROM public.bookings 
WHERE spot_id = '517cd0c4-3c46-4b9d-bae8-f31de5f0499f' 
  AND created_at > NOW() - INTERVAL '1 day';

-- Create a test booking for the currently logged-in user (starting tomorrow at noon)
INSERT INTO public.bookings (
  spot_id, renter_id, start_at, end_at, status,
  hourly_rate, total_hours, subtotal, platform_fee, total_amount, host_earnings
) VALUES (
  '517cd0c4-3c46-4b9d-bae8-f31de5f0499f',
  '4b63dc97-3ca5-4e6b-b40b-fc9f77f300ed',
  (CURRENT_DATE + INTERVAL '1 day' + INTERVAL '12 hours'),
  (CURRENT_DATE + INTERVAL '1 day' + INTERVAL '14 hours'),
  'paid', 5.00, 2.0, 12.00, 1.00, 13.00, 10.00
);