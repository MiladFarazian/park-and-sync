import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        auth: {
          persistSession: false,
        },
      }
    );

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false,
        },
      }
    );

    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Get the user from the auth header
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    console.log('Deleting account for user:', user.id);

    // Delete user data in order (respecting foreign key constraints)
    
    // 1. Delete bookings (as renter)
    await supabaseAdmin
      .from('bookings')
      .delete()
      .eq('renter_id', user.id);

    // 2. Delete vehicles
    await supabaseAdmin
      .from('vehicles')
      .delete()
      .eq('user_id', user.id);

    // 3. Delete reviews (as reviewer)
    await supabaseAdmin
      .from('reviews')
      .delete()
      .eq('reviewer_id', user.id);

    // 4. Delete messages
    await supabaseAdmin
      .from('messages')
      .delete()
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`);

    // 5. Delete notifications
    await supabaseAdmin
      .from('notifications')
      .delete()
      .eq('user_id', user.id);

    // 6. Get spots to delete associated data
    const { data: spots } = await supabaseAdmin
      .from('spots')
      .select('id')
      .eq('host_id', user.id);

    if (spots && spots.length > 0) {
      const spotIds = spots.map(s => s.id);
      
      // Delete spot photos
      await supabaseAdmin
        .from('spot_photos')
        .delete()
        .in('spot_id', spotIds);

      // Delete availability rules
      await supabaseAdmin
        .from('availability_rules')
        .delete()
        .in('spot_id', spotIds);

      // Delete calendar overrides
      await supabaseAdmin
        .from('calendar_overrides')
        .delete()
        .in('spot_id', spotIds);

      // Delete bookings as host
      await supabaseAdmin
        .from('bookings')
        .delete()
        .in('spot_id', spotIds);

      // Delete reviews as host (reviewee)
      await supabaseAdmin
        .from('reviews')
        .delete()
        .eq('reviewee_id', user.id);

      // Delete spots
      await supabaseAdmin
        .from('spots')
        .delete()
        .eq('host_id', user.id);
    }

    // 7. Delete profile
    await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('user_id', user.id);

    // 8. Delete storage files (avatar)
    const avatarPath = `${user.id}/avatar.jpg`;
    await supabaseAdmin.storage.from('avatars').remove([avatarPath]);

    // 9. Finally, delete the auth user using admin client
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    
    if (deleteError) {
      console.error('Error deleting user:', deleteError);
      throw deleteError;
    }

    console.log('Account deleted successfully for user:', user.id);

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in delete-account function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
