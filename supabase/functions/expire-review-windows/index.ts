import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting review window expiration check...');

    // Find all bookings where review window has expired and has at least one unrevealed review
    const { data: expiredBookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('id')
      .not('review_window_ends_at', 'is', null)
      .lte('review_window_ends_at', new Date().toISOString());

    if (bookingsError) {
      console.error('Error fetching expired bookings:', bookingsError);
      throw bookingsError;
    }

    console.log(`Found ${expiredBookings?.length || 0} bookings with expired review windows`);

    if (!expiredBookings || expiredBookings.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No expired review windows found', revealed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let revealedCount = 0;

    // For each expired booking, reveal any unrevealed reviews
    for (const booking of expiredBookings) {
      // Check if there are unrevealed reviews for this booking
      const { data: unrevealedReviews, error: reviewsError } = await supabase
        .from('reviews')
        .select('id, reviewee_id')
        .eq('booking_id', booking.id)
        .is('revealed_at', null);

      if (reviewsError) {
        console.error(`Error checking reviews for booking ${booking.id}:`, reviewsError);
        continue;
      }

      if (unrevealedReviews && unrevealedReviews.length > 0) {
        // Reveal all reviews for this booking
        const { error: updateError } = await supabase
          .from('reviews')
          .update({ revealed_at: new Date().toISOString() })
          .eq('booking_id', booking.id)
          .is('revealed_at', null);

        if (updateError) {
          console.error(`Error revealing reviews for booking ${booking.id}:`, updateError);
          continue;
        }

        revealedCount += unrevealedReviews.length;
        console.log(`Revealed ${unrevealedReviews.length} review(s) for booking ${booking.id}`);

        // Send notifications to reviewees that reviews are now visible
        for (const review of unrevealedReviews) {
          try {
            await supabase.from('notifications').insert({
              user_id: review.reviewee_id,
              type: 'review_revealed',
              title: 'New Review Available',
              message: 'A review has been posted about you. Check your profile to see it!',
              related_id: booking.id,
            });
          } catch (notifError) {
            console.error(`Error sending notification for review ${review.id}:`, notifError);
          }
        }
      }
    }

    console.log(`Successfully revealed ${revealedCount} reviews`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Revealed ${revealedCount} reviews from ${expiredBookings.length} expired booking windows`,
        revealed: revealedCount 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in expire-review-windows:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
