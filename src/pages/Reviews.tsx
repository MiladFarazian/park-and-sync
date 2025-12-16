import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, Quote, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useMode } from '@/contexts/ModeContext';
import { supabase } from '@/integrations/supabase/client';

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer_name: string;
  spot_category?: string;
}

const REVIEWS_PER_PAGE = 10;

const Reviews = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { mode } = useMode();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchReviews();
    }
  }, [user, mode, page]);

  const fetchReviews = async () => {
    if (!user) return;
    setLoading(true);
    
    try {
      const offset = (page - 1) * REVIEWS_PER_PAGE;
      
      if (mode === 'driver') {
        // Get reviews where user was the renter (driver reviews)
        const { data: bookings, error: bookingsError } = await supabase
          .from('bookings')
          .select('id, spot_id, spots(category)')
          .eq('renter_id', user.id);
        
        if (bookingsError) throw bookingsError;
        if (!bookings || bookings.length === 0) {
          setReviews([]);
          setTotalCount(0);
          setHasMore(false);
          setLoading(false);
          return;
        }

        const bookingIds = bookings.map(b => b.id);
        const bookingMap = new Map(bookings.map(b => [b.id, b]));

        // Get total count
        const { count } = await supabase
          .from('reviews')
          .select('id', { count: 'exact', head: true })
          .in('booking_id', bookingIds)
          .eq('reviewee_id', user.id);
        
        setTotalCount(count || 0);

        const { data: reviewsData, error: reviewsError } = await supabase
          .from('reviews')
          .select('id, rating, comment, created_at, reviewer_id, booking_id')
          .in('booking_id', bookingIds)
          .eq('reviewee_id', user.id)
          .order('created_at', { ascending: false })
          .range(offset, offset + REVIEWS_PER_PAGE - 1);
        
        if (reviewsError) throw reviewsError;
        
        if (!reviewsData || reviewsData.length === 0) {
          setReviews([]);
          setHasMore(false);
          setLoading(false);
          return;
        }

        setHasMore(offset + reviewsData.length < (count || 0));

        // Get reviewer profiles
        const reviewerIds = [...new Set(reviewsData.map(r => r.reviewer_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, first_name, last_name')
          .in('user_id', reviewerIds);
        
        const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

        const formattedReviews = reviewsData.map(r => {
          const reviewer = profileMap.get(r.reviewer_id);
          const booking = bookingMap.get(r.booking_id);
          return {
            id: r.id,
            rating: r.rating,
            comment: r.comment,
            created_at: r.created_at,
            reviewer_name: reviewer?.first_name && reviewer?.last_name 
              ? `${reviewer.first_name} ${reviewer.last_name.charAt(0)}.`
              : 'Host',
            spot_category: (booking?.spots as any)?.category || undefined
          };
        });

        setReviews(formattedReviews);
      } else {
        // Host mode: Get reviews for spots owned by this user
        const { data: spots, error: spotsError } = await supabase
          .from('spots')
          .select('id, category')
          .eq('host_id', user.id);
        
        if (spotsError) throw spotsError;
        if (!spots || spots.length === 0) {
          setReviews([]);
          setTotalCount(0);
          setHasMore(false);
          setLoading(false);
          return;
        }

        const spotIds = spots.map(s => s.id);
        const spotMap = new Map(spots.map(s => [s.id, s]));

        const { data: bookings, error: bookingsError } = await supabase
          .from('bookings')
          .select('id, spot_id')
          .in('spot_id', spotIds);
        
        if (bookingsError) throw bookingsError;
        if (!bookings || bookings.length === 0) {
          setReviews([]);
          setTotalCount(0);
          setHasMore(false);
          setLoading(false);
          return;
        }

        const bookingIds = bookings.map(b => b.id);
        const bookingSpotMap = new Map(bookings.map(b => [b.id, b.spot_id]));

        // Get total count
        const { count } = await supabase
          .from('reviews')
          .select('id', { count: 'exact', head: true })
          .in('booking_id', bookingIds)
          .eq('reviewee_id', user.id);
        
        setTotalCount(count || 0);

        const { data: reviewsData, error: reviewsError } = await supabase
          .from('reviews')
          .select('id, rating, comment, created_at, reviewer_id, booking_id')
          .in('booking_id', bookingIds)
          .eq('reviewee_id', user.id)
          .order('created_at', { ascending: false })
          .range(offset, offset + REVIEWS_PER_PAGE - 1);
        
        if (reviewsError) throw reviewsError;
        
        if (!reviewsData || reviewsData.length === 0) {
          setReviews([]);
          setHasMore(false);
          setLoading(false);
          return;
        }

        setHasMore(offset + reviewsData.length < (count || 0));

        // Get reviewer profiles
        const reviewerIds = [...new Set(reviewsData.map(r => r.reviewer_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, first_name, last_name')
          .in('user_id', reviewerIds);
        
        const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

        const formattedReviews = reviewsData.map(r => {
          const reviewer = profileMap.get(r.reviewer_id);
          const spotId = bookingSpotMap.get(r.booking_id);
          const spot = spotId ? spotMap.get(spotId) : undefined;
          return {
            id: r.id,
            rating: r.rating,
            comment: r.comment,
            created_at: r.created_at,
            reviewer_name: reviewer?.first_name && reviewer?.last_name 
              ? `${reviewer.first_name} ${reviewer.last_name.charAt(0)}.`
              : 'Driver',
            spot_category: spot?.category || undefined
          };
        });

        setReviews(formattedReviews);
      }
    } catch (error) {
      console.error('Error fetching reviews:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(totalCount / REVIEWS_PER_PAGE);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="flex items-center gap-3 p-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">My Reviews</h1>
            <p className="text-sm text-muted-foreground">
              {mode === 'driver' ? 'Reviews from hosts' : 'Reviews from drivers'}
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4 pb-24">
        {/* Stats Summary */}
        <Card className="p-4 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary/10 rounded-full">
              <Star className="h-6 w-6 text-primary fill-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalCount}</p>
              <p className="text-sm text-muted-foreground">
                Total {totalCount === 1 ? 'review' : 'reviews'}
              </p>
            </div>
          </div>
        </Card>

        {/* Reviews List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : reviews.length === 0 ? (
          <Card className="p-8 text-center">
            <Star className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="font-semibold text-lg mb-2">No reviews yet</h3>
            <p className="text-sm text-muted-foreground">
              {mode === 'driver' 
                ? "You haven't received any reviews from hosts yet." 
                : "You haven't received any reviews from drivers yet."}
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {reviews.map((review) => (
              <Card key={review.id} className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`h-4 w-4 ${
                            star <= review.rating
                              ? 'fill-yellow-400 text-yellow-400'
                              : 'text-muted-foreground/30'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="font-medium">{review.reviewer_name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(review.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </span>
                </div>
                
                {review.comment && (
                  <div className="flex items-start gap-2 mb-2">
                    <Quote className="h-4 w-4 text-primary/50 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-muted-foreground italic">{review.comment}</p>
                  </div>
                )}
                
                {review.spot_category && (
                  <p className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full inline-block">
                    {review.spot_category}
                  </p>
                )}
              </Card>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground px-2">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => p + 1)}
              disabled={!hasMore || loading}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Reviews;
