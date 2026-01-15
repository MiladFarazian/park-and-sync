import React, { useState, useEffect } from 'react';
import { Star, MessageSquare } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer: {
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  };
  spot: {
    address: string;
    category: string | null;
  };
}

const RecentReviews = () => {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchRecentReviews();
    }
  }, [user]);

  const fetchRecentReviews = async () => {
    if (!user) return;
    
    try {
      setLoading(true);

      // Get all spots owned by this host
      const { data: spots, error: spotsError } = await supabase
        .from('spots')
        .select('id')
        .eq('host_id', user.id);
      
      if (spotsError) throw spotsError;
      if (!spots || spots.length === 0) {
        setReviews([]);
        setLoading(false);
        return;
      }

      const spotIds = spots.map(s => s.id);

      // Get all bookings for these spots
      const { data: bookings, error: bookingsError } = await supabase
        .from('bookings')
        .select('id, spot_id')
        .in('spot_id', spotIds);
      
      if (bookingsError) throw bookingsError;
      if (!bookings || bookings.length === 0) {
        setReviews([]);
        setLoading(false);
        return;
      }

      const bookingIds = bookings.map(b => b.id);
      const bookingSpotMap = new Map(bookings.map(b => [b.id, b.spot_id]));

      // Get reviews for these bookings where host is reviewee (only revealed reviews)
      const { data: reviewsData, error: reviewsError } = await supabase
        .from('reviews')
        .select(`
          id,
          rating,
          comment,
          created_at,
          booking_id,
          reviewer_id,
          revealed_at
        `)
        .in('booking_id', bookingIds)
        .eq('reviewee_id', user.id)
        .not('revealed_at', 'is', null)
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (reviewsError) throw reviewsError;
      if (!reviewsData || reviewsData.length === 0) {
        setReviews([]);
        setLoading(false);
        return;
      }

      // Get reviewer profiles
      const reviewerIds = reviewsData.map(r => r.reviewer_id);
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name, avatar_url')
        .in('user_id', reviewerIds);
      
      if (profilesError) throw profilesError;

      // Get spot details
      const spotIdsForReviews = [...new Set(reviewsData.map(r => bookingSpotMap.get(r.booking_id)))].filter(Boolean) as string[];
      const { data: spotDetails, error: spotDetailsError } = await supabase
        .from('spots')
        .select('id, address, category')
        .in('id', spotIdsForReviews);
      
      if (spotDetailsError) throw spotDetailsError;

      // Combine data
      const combinedReviews: Review[] = reviewsData.map(review => {
        const spotId = bookingSpotMap.get(review.booking_id);
        const spot = spotDetails?.find(s => s.id === spotId);
        const reviewer = profiles?.find(p => p.user_id === review.reviewer_id);
        
        return {
          id: review.id,
          rating: review.rating,
          comment: review.comment,
          created_at: review.created_at,
          reviewer: {
            first_name: reviewer?.first_name || null,
            last_name: reviewer?.last_name || null,
            avatar_url: reviewer?.avatar_url || null,
          },
          spot: {
            address: spot?.address || 'Unknown location',
            category: spot?.category || null,
          },
        };
      });

      setReviews(combinedReviews);
    } catch (error) {
      console.error('Error fetching reviews:', error);
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (firstName: string | null, lastName: string | null) => {
    const first = firstName?.charAt(0) || '';
    const last = lastName?.charAt(0) || '';
    return (first + last).toUpperCase() || '?';
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-3.5 w-3.5 ${
              star <= rating
                ? 'fill-yellow-400 text-yellow-400'
                : 'text-muted-foreground/30'
            }`}
          />
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Recent Reviews</h3>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-full" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (reviews.length === 0) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Recent Reviews</h3>
        </div>
        <p className="text-sm text-muted-foreground text-center py-4">
          No reviews yet. Reviews from drivers will appear here.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Recent Reviews</h3>
      </div>
      <div className="space-y-4">
        {reviews.map((review) => (
          <div key={review.id} className="flex gap-3 pb-4 border-b border-border last:border-0 last:pb-0">
            <Avatar className="h-10 w-10 flex-shrink-0">
              <AvatarImage src={review.reviewer.avatar_url || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary text-sm">
                {getInitials(review.reviewer.first_name, review.reviewer.last_name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-sm truncate">
                  {review.reviewer.first_name || 'Anonymous'} {review.reviewer.last_name?.charAt(0) || ''}.
                </p>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {formatDistanceToNow(new Date(review.created_at), { addSuffix: true })}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                {renderStars(review.rating)}
                <span className="text-xs text-muted-foreground truncate">
                  {review.spot.category || review.spot.address}
                </span>
              </div>
              {review.comment && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                  "{review.comment}"
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

export default RecentReviews;
