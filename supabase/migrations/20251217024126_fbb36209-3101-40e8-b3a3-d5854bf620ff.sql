-- Clean up test bookings created for notification testing
DELETE FROM public.bookings 
WHERE spot_id = '517cd0c4-3c46-4b9d-bae8-f31de5f0499f' 
  AND renter_id = '12f65ecc-388f-46e6-b651-f1a8abaeffde'
  AND created_at > NOW() - INTERVAL '1 day';

-- Clean up test notifications
DELETE FROM public.notifications 
WHERE user_id = '12f65ecc-388f-46e6-b651-f1a8abaeffde'
  AND type IN ('booking_ending_soon', 'overstay_warning', 'overstay_detected')
  AND created_at > NOW() - INTERVAL '1 day';