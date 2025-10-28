import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Clock, MapPin, Star, MessageCircle, Car, Calendar, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { differenceInHours, format } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const BookingConfirmation = () => {
  const { bookingId } = useParams<{ bookingId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [booking, setBooking] = useState<any>(null);
  const [spot, setSpot] = useState<any>(null);
  const [host, setHost] = useState<any>(null);
  const [vehicle, setVehicle] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

  useEffect(() => {
    const fetchBookingDetails = async () => {
      if (!bookingId) return;
      
      try {
        // Fetch booking with related data
        const { data: bookingData, error: bookingError } = await supabase
          .from('bookings')
          .select(`
            *,
            spots (
              *,
              spot_photos(url, is_primary),
              profiles!spots_host_id_fkey(
                id,
                first_name,
                last_name,
                avatar_url,
                rating
              )
            ),
            vehicles (
              *
            )
          `)
          .eq('id', bookingId)
          .single();

        if (bookingError) throw bookingError;

        setBooking(bookingData);
        setSpot(bookingData.spots);
        setHost(bookingData.spots.profiles);
        setVehicle(bookingData.vehicles);
      } catch (error) {
        console.error('Error fetching booking:', error);
        toast({
          title: "Error",
          description: "Failed to load booking details",
          variant: "destructive",
        });
        navigate('/');
      } finally {
        setLoading(false);
      }
    };

    fetchBookingDetails();
  }, [bookingId, navigate, toast]);

  const handleContactHost = async () => {
    if (!host) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth');
        return;
      }

      // Navigate to messages page with host's user_id
      navigate(`/messages?userId=${host.id}`);
    } catch (error) {
      console.error('Error navigating to messages:', error);
      toast({
        title: "Error",
        description: "Failed to open messages",
        variant: "destructive",
      });
    }
  };

  const getCancellationPolicy = () => {
    if (!booking) return { refundable: false, message: '' };
    
    const now = new Date();
    const bookingStart = new Date(booking.start_at);
    const bookingCreated = new Date(booking.created_at);
    const gracePeriodEnd = new Date(bookingCreated.getTime() + 10 * 60 * 1000);
    const oneHourBeforeStart = new Date(bookingStart.getTime() - 60 * 60 * 1000);

    if (now <= gracePeriodEnd) {
      return { refundable: true, message: 'Full refund - within 10-minute grace period' };
    } else if (now <= oneHourBeforeStart) {
      return { refundable: true, message: 'Full refund - more than 1 hour before start time' };
    } else {
      return { refundable: false, message: 'No refund - less than 1 hour before start time' };
    }
  };

  const handleCancelBooking = async () => {
    if (!booking) return;

    setCancelling(true);
    try {
      const { data, error } = await supabase.functions.invoke('cancel-booking', {
        body: { bookingId: booking.id }
      });

      if (error) throw error;

      toast({
        title: "Booking cancelled",
        description: data.refundAmount > 0 
          ? `Refund of $${data.refundAmount.toFixed(2)} will be processed within 5-10 business days`
          : data.refundReason,
      });

      // Refresh booking details
      const { data: updatedBooking } = await supabase
        .from('bookings')
        .select(`
          *,
          spots (
            *,
            spot_photos(url, is_primary),
            profiles!spots_host_id_fkey(
              id,
              first_name,
              last_name,
              avatar_url,
              rating
            )
          ),
          vehicles (
            *
          )
        `)
        .eq('id', bookingId)
        .single();

      if (updatedBooking) {
        setBooking(updatedBooking);
      }

      setCancelDialogOpen(false);
    } catch (error) {
      console.error('Error cancelling booking:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to cancel booking",
        variant: "destructive"
      });
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!booking || !spot) {
    return null;
  }

  const duration = differenceInHours(new Date(booking.end_at), new Date(booking.start_at));
  const primaryPhoto = spot?.spot_photos?.find((p: any) => p.is_primary)?.url || spot?.spot_photos?.[0]?.url;
  const hostName = host ? `${host.first_name || ''} ${host.last_name || ''}`.trim() : 'Host';
  const hostInitial = hostName.charAt(0).toUpperCase();
  const bookingNumber = `#PK-${new Date(booking.created_at).getFullYear()}-${booking.id.slice(0, 3).toUpperCase()}`;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/')}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-bold">Booking Confirmed</h1>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-2xl space-y-6">
        {/* Success Message */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="rounded-full bg-green-100 dark:bg-green-900/20 p-6">
              <CheckCircle2 className="h-16 w-16 text-green-600 dark:text-green-500" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-green-700 dark:text-green-500">Booking Confirmed!</h2>
          <p className="text-muted-foreground">
            Your parking reservation has been confirmed. You'll receive a confirmation email shortly.
          </p>
        </div>

        {/* Booking Summary Card */}
        <Card className="p-6">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Booking ID</span>
              <span className="font-bold">{bookingNumber}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Duration</span>
              <span className="font-bold">{duration} hours</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Total Paid</span>
              <span className="font-bold text-lg">${booking.total_amount.toFixed(2)}</span>
            </div>
          </div>
        </Card>

        {/* Spot Details Card */}
        <Card className="p-4">
          <h3 className="font-bold mb-4">Parking Spot</h3>
          <div className="flex gap-4">
            {primaryPhoto && (
              <img 
                src={primaryPhoto} 
                alt={spot.title}
                className="w-20 h-20 rounded-lg object-cover"
              />
            )}
            <div className="flex-1">
              <h4 className="font-semibold mb-1">{spot.title}</h4>
              <div className="flex items-center gap-1 text-sm text-muted-foreground mb-2">
                <MapPin className="h-3 w-3" />
                <span>{spot.address}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>{format(new Date(booking.start_at), 'MMM d, h:mm a')} - {format(new Date(booking.end_at), 'h:mm a')}</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Vehicle Info Card */}
        {vehicle && (
          <Card className="p-4">
            <h3 className="font-bold mb-4">Vehicle</h3>
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Car className="h-6 w-6 text-primary" />
              </div>
              <div>
                <div className="font-semibold">{vehicle.make} {vehicle.model}</div>
                <div className="text-sm text-muted-foreground">{vehicle.license_plate}</div>
              </div>
            </div>
          </Card>
        )}

        {/* Host Info Card */}
        <Card className="p-4">
          <h3 className="font-bold mb-4">Your Host</h3>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12">
                <AvatarImage src={host?.avatar_url} />
                <AvatarFallback>{hostInitial}</AvatarFallback>
              </Avatar>
              <div>
                <div className="font-semibold">{hostName}</div>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                  <span>{host?.rating || '4.8'}</span>
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleContactHost}>
              <MessageCircle className="h-4 w-4 mr-2" />
              Message
            </Button>
          </div>
        </Card>

        {/* Ad Placeholder - Future geolocation-based ads */}
        <Card className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center flex-shrink-0">
              <span className="text-2xl">🍔</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-bold text-foreground">Tony's Burgers</h4>
                <span className="text-xs bg-orange-500 text-white px-2 py-0.5 rounded">Sponsored</span>
              </div>
              <div className="flex items-center gap-1 text-sm mb-1">
                <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                <span className="font-semibold">4.6</span>
                <span className="text-muted-foreground">(324 reviews)</span>
              </div>
              <p className="text-sm text-muted-foreground">Gourmet burgers & craft shakes • 2 blocks away</p>
              <div className="mt-2 inline-block bg-green-500 text-white text-xs font-semibold px-2 py-1 rounded">
                20% OFF with code PARKWAY
              </div>
            </div>
          </div>
          <Button variant="outline" className="w-full mt-4 bg-white dark:bg-background hover:bg-amber-50 dark:hover:bg-amber-950/30 border-amber-300 dark:border-amber-700">
            View Menu & Order
          </Button>
        </Card>

        {/* Action Buttons */}
        <div className="space-y-3 pt-2">
          <Button 
            className="w-full" 
            size="lg"
            onClick={() => navigate('/activity')}
          >
            View My Bookings
          </Button>
          <Button 
            variant="outline" 
            className="w-full" 
            size="lg"
            onClick={() => navigate('/')}
          >
            Find More Parking
          </Button>
          
          {/* Cancel Booking Button - Only show if not cancelled and not past */}
          {booking.status !== 'canceled' && new Date(booking.end_at) > new Date() && (
            <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="destructive" 
                  className="w-full" 
                  size="lg"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Cancel Booking
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel Booking?</AlertDialogTitle>
                  <AlertDialogDescription className="space-y-2">
                    <p>Are you sure you want to cancel this booking?</p>
                    <div className="mt-4 p-3 bg-muted rounded-lg">
                      <p className="font-semibold text-foreground">{spot?.title}</p>
                      <p className="text-sm mt-1">{format(new Date(booking.start_at), 'MMM d, yyyy')}</p>
                      <p className="text-sm">{format(new Date(booking.start_at), 'h:mm a')} - {format(new Date(booking.end_at), 'h:mm a')}</p>
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-sm font-semibold text-foreground">
                          {getCancellationPolicy().message}
                        </p>
                      </div>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={cancelling}>Keep Booking</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleCancelBooking}
                    disabled={cancelling}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {cancelling ? 'Cancelling...' : 'Cancel Booking'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
    </div>
  );
};

export default BookingConfirmation;
