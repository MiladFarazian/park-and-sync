import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { XCircle, ArrowLeft, Search, MapPin, Calendar, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

const BookingDeclined = () => {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBooking = async () => {
      if (!bookingId) return;

      try {
        const { data, error } = await supabase
          .from('bookings')
          .select(`
            *,
            spots (
              title,
              address,
              category
            )
          `)
          .eq('id', bookingId)
          .single();

        if (error) throw error;
        setBooking(data);
      } catch (error) {
        console.error('Error fetching booking:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchBooking();
  }, [bookingId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const spotTitle = booking?.spots?.category || booking?.spots?.title || 'Parking Spot';
  const spotAddress = booking?.spots?.address || 'Address unavailable';
  const declineReason = booking?.cancellation_reason || 'The host was unable to accommodate your request.';

  return (
    <div className="bg-background min-h-screen">
      {/* Header */}
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/activity')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-bold">Booking Declined</h1>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-lg space-y-6">
        {/* Status Header */}
        <div className="flex items-center gap-4">
          <div className="rounded-full bg-destructive/10 p-3 shrink-0">
            <XCircle className="h-8 w-8 text-destructive" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-destructive">Request Declined</h2>
            <p className="text-muted-foreground text-sm">
              The host was unable to approve your request
            </p>
          </div>
        </div>

        {/* No Charge Confirmation */}
        <Card className="p-4 bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800">
          <div className="flex items-start gap-3">
            <CreditCard className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-green-700 dark:text-green-400">
                Your card was not charged
              </p>
              <p className="text-sm text-green-600 dark:text-green-500 mt-1">
                The authorization hold on your card will be released automatically within a few business days.
              </p>
            </div>
          </div>
        </Card>

        {/* Booking Details */}
        {booking && (
          <Card className="p-4">
            <h3 className="font-semibold mb-4 text-muted-foreground text-sm uppercase tracking-wide">
              Request Details
            </h3>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
                <div>
                  <p className="font-medium">{spotTitle}</p>
                  <p className="text-sm text-muted-foreground">{spotAddress}</p>
                </div>
              </div>
              <Separator />
              <div className="flex items-start gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
                <div>
                  <p className="font-medium">Requested Times</p>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(booking.start_at), 'EEE, MMM d • h:mm a')} – {format(new Date(booking.end_at), 'h:mm a')}
                  </p>
                </div>
              </div>
              {declineReason && declineReason !== 'Host declined the booking request' && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Reason</p>
                    <p className="text-sm">{declineReason}</p>
                  </div>
                </>
              )}
            </div>
          </Card>
        )}

        {/* Actions */}
        <div className="space-y-3 pt-2">
          <Button className="w-full" size="lg" onClick={() => navigate('/explore')}>
            <Search className="h-4 w-4 mr-2" />
            Find Other Parking
          </Button>
          <Button variant="outline" className="w-full" size="lg" asChild>
            <Link to="/activity">View Activity</Link>
          </Button>
        </div>

        {/* Help Text */}
        <p className="text-center text-sm text-muted-foreground pt-4">
          Need help? <Link to="/messages" className="text-primary underline">Contact support</Link>
        </p>
      </div>
    </div>
  );
};

export default BookingDeclined;
