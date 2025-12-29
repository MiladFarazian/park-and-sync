import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Calendar, Clock, Car, Check, Navigation, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

const GuestBookingDetail = () => {
  const { bookingId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const token = searchParams.get('token');

  const [booking, setBooking] = useState<any>(null);
  const [spot, setSpot] = useState<any>(null);
  const [host, setHost] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBooking = async () => {
      if (!bookingId || !token) {
        setError('Invalid booking link');
        setLoading(false);
        return;
      }

      try {
        const { data, error: fetchError } = await supabase.functions.invoke('get-guest-booking', {
          body: { booking_id: bookingId, access_token: token },
        });

        if (fetchError) throw fetchError;
        if (data?.error) throw new Error(data.error);

        setBooking(data.booking);
        setSpot(data.spot);
        setHost(data.host);
      } catch (err: any) {
        console.error('Failed to fetch guest booking:', err);
        setError(err.message || 'Failed to load booking');
      } finally {
        setLoading(false);
      }
    };

    fetchBooking();
  }, [bookingId, token]);

  const handleCancel = async () => {
    if (!bookingId || !token) return;
    
    setCancelling(true);
    try {
      const { data, error: cancelError } = await supabase.functions.invoke('cancel-guest-booking', {
        body: { booking_id: bookingId, access_token: token },
      });

      if (cancelError) throw cancelError;
      if (data?.error) throw new Error(data.error);

      toast({ 
        title: "Booking cancelled", 
        description: data.refund_amount > 0 ? `Refund of $${data.refund_amount.toFixed(2)} will be processed` : undefined 
      });
      
      // Refresh booking data
      setBooking((prev: any) => ({ ...prev, status: 'canceled' }));
    } catch (err: any) {
      console.error('Failed to cancel booking:', err);
      toast({ title: "Cancellation failed", description: err.message, variant: "destructive" });
    } finally {
      setCancelling(false);
    }
  };

  const openDirections = () => {
    if (!spot?.address) return;
    const encodedAddress = encodeURIComponent(spot.address);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`, '_blank');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <h1 className="text-xl font-semibold mb-2">Unable to Load Booking</h1>
        <p className="text-muted-foreground mb-4">{error}</p>
        <Button onClick={() => navigate('/')}>Go Home</Button>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    pending: 'bg-yellow-100 text-yellow-800',
    completed: 'bg-blue-100 text-blue-800',
    canceled: 'bg-red-100 text-red-800',
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="flex items-center gap-3 p-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">Your Booking</h1>
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        {/* Status Banner */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Booking Status</p>
              <Badge className={statusColors[booking.status] || 'bg-gray-100 text-gray-800'}>
                {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
              </Badge>
            </div>
            {booking.status === 'active' && (
              <Check className="h-8 w-8 text-green-600" />
            )}
          </div>
        </Card>

        {/* Spot Details */}
        <Card className="p-4">
          <h2 className="font-semibold mb-3">{spot.title}</h2>
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{spot.address}</span>
          </div>
          
          <Separator className="my-4" />
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground mb-1">Check-in</p>
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                <span>{format(new Date(booking.start_at), 'MMM d, yyyy')}</span>
              </div>
              <div className="flex items-center gap-1 mt-1">
                <Clock className="h-4 w-4" />
                <span>{format(new Date(booking.start_at), 'h:mm a')}</span>
              </div>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">Check-out</p>
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                <span>{format(new Date(booking.end_at), 'MMM d, yyyy')}</span>
              </div>
              <div className="flex items-center gap-1 mt-1">
                <Clock className="h-4 w-4" />
                <span>{format(new Date(booking.end_at), 'h:mm a')}</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Guest Details */}
        <Card className="p-4">
          <h3 className="font-semibold mb-3">Your Details</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Name</span>
              <span>{booking.guest_full_name}</span>
            </div>
            {booking.guest_email && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email</span>
                <span>{booking.guest_email}</span>
              </div>
            )}
            {booking.guest_phone && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Phone</span>
                <span>{booking.guest_phone}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Vehicle</span>
              <span>{booking.guest_car_model}</span>
            </div>
          </div>
        </Card>

        {/* Payment Summary */}
        <Card className="p-4">
          <h3 className="font-semibold mb-3">Payment Summary</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{booking.total_hours} hours</span>
              <span>${booking.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Service fee</span>
              <span>${booking.platform_fee.toFixed(2)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-semibold">
              <span>Total paid</span>
              <span>${booking.total_amount.toFixed(2)}</span>
            </div>
          </div>
        </Card>

        {/* Access Notes */}
        {spot.access_notes && (
          <Card className="p-4">
            <h3 className="font-semibold mb-2">Access Instructions</h3>
            <p className="text-sm text-muted-foreground">{spot.access_notes}</p>
          </Card>
        )}

        {/* Actions */}
        <div className="space-y-3">
          <Button className="w-full" size="lg" onClick={openDirections}>
            <Navigation className="h-4 w-4 mr-2" />
            Get Directions
          </Button>

          {['pending', 'active'].includes(booking.status) && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="w-full" size="lg">
                  Cancel Booking
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel Booking?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Cancellations more than 1 hour before the start time are eligible for a full refund.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep Booking</AlertDialogCancel>
                  <AlertDialogAction onClick={handleCancel} disabled={cancelling}>
                    {cancelling ? 'Cancelling...' : 'Yes, Cancel'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        {/* Create Account CTA */}
        <Card className="p-4 bg-primary/5 border-primary/20">
          <h3 className="font-semibold mb-2">Create an Account</h3>
          <p className="text-sm text-muted-foreground mb-3">
            Sign up to manage all your bookings, save payment methods, and book faster next time.
          </p>
          <Button 
            variant="outline" 
            onClick={() => {
              // Pass guest info to pre-fill signup form
              const params = new URLSearchParams();
              if (booking.guest_email) params.set('email', booking.guest_email);
              if (booking.guest_full_name) {
                const nameParts = booking.guest_full_name.split(' ');
                if (nameParts[0]) params.set('firstName', nameParts[0]);
                if (nameParts.length > 1) params.set('lastName', nameParts.slice(1).join(' '));
              }
              params.set('convert', 'true');
              navigate(`/auth?${params.toString()}`);
            }}
          >
            Create Free Account
          </Button>
        </Card>
      </div>
    </div>
  );
};

export default GuestBookingDetail;
