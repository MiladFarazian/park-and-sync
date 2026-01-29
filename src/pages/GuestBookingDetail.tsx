import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Calendar, Clock, Car, Check, Navigation, Loader2, Phone, Mail, User, Zap, ChevronLeft, ChevronRight, Clock3, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import GuestChatPane from '@/components/guest/GuestChatPane';
import { logger } from '@/lib/logger';

const log = logger.scope('GuestBookingDetail');

interface SpotPhoto {
  url: string;
  is_primary: boolean;
  sort_order: number;
}

// Simple photo gallery component
const SpotPhotoGallery = ({ photos }: { photos: SpotPhoto[] }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (photos.length === 0) return null;

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev === 0 ? photos.length - 1 : prev - 1));
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev === photos.length - 1 ? 0 : prev + 1));
  };

  return (
    <div className="relative">
      <div className="aspect-video bg-muted">
        <img
          src={photos[currentIndex].url}
          alt={`Parking spot photo ${currentIndex + 1}`}
          className="w-full h-full object-cover"
        />
      </div>
      
      {photos.length > 1 && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-2 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background/90 h-8 w-8 rounded-full"
            onClick={goToPrevious}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background/90 h-8 w-8 rounded-full"
            onClick={goToNext}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          
          {/* Photo counter */}
          <div className="absolute bottom-2 right-2 bg-background/80 px-2 py-1 rounded text-xs font-medium">
            {currentIndex + 1} / {photos.length}
          </div>
        </>
      )}
    </div>
  );
};

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
  const [verifying, setVerifying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [awaitingApproval, setAwaitingApproval] = useState(false);

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

        // If booking is pending or held, verify payment status
        if (data.booking?.status === 'pending' || data.booking?.status === 'held') {
          setVerifying(true);
          try {
            const { data: verifyData } = await supabase.functions.invoke('verify-guest-payment', {
              body: { booking_id: bookingId, access_token: token },
            });
            
            if (verifyData?.awaiting_approval) {
              setAwaitingApproval(true);
              setBooking((prev: any) => ({ ...prev, status: 'held' }));
            } else if (verifyData?.verified && verifyData?.status === 'active') {
              setBooking((prev: any) => ({ ...prev, status: 'active' }));
              toast({ 
                title: "Payment confirmed!", 
                description: "Your booking is now active." 
              });
            }
          } catch (verifyErr) {
            log.error('Payment verification failed:', verifyErr);
          } finally {
            setVerifying(false);
          }
        }
        
        // Check if already held (awaiting approval)
        if (data.booking?.status === 'held') {
          setAwaitingApproval(true);
        }
      } catch (err: any) {
        log.error('Failed to fetch guest booking:', err);
        setError(err.message || 'Failed to load booking');
      } finally {
        setLoading(false);
      }
    };

    fetchBooking();
  }, [bookingId, token, toast]);

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
      setAwaitingApproval(false);
    } catch (err: any) {
      log.error('Failed to cancel booking:', err);
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
    held: 'bg-amber-100 text-amber-800',
    completed: 'bg-blue-100 text-blue-800',
    canceled: 'bg-red-100 text-red-800',
  };

  const getStatusDisplay = (status: string) => {
    if (status === 'held' || awaitingApproval) {
      return 'Awaiting Approval';
    }
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="flex-shrink-0 bg-background border-b" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center gap-3 p-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">Your Booking</h1>
        </div>
      </div>

      <div 
        className="flex-1 overflow-y-auto p-4 space-y-4 max-w-2xl mx-auto w-full" 
        style={{ 
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 2rem)',
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorY: 'contain',
          minHeight: 0,
        } as React.CSSProperties}
      >
        {/* Awaiting Approval Banner */}
        {awaitingApproval && booking.status !== 'canceled' && (
          <Card className="p-4 bg-amber-50 border-amber-200">
            <div className="flex items-start gap-3">
              <Clock3 className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <h3 className="font-semibold text-amber-800">Awaiting Host Approval</h3>
                <p className="text-sm text-amber-700 mt-1">
                  Your booking request has been sent to the host. They have up to 1 hour to respond. 
                  Your payment method has been authorized but will only be charged if the host approves.
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Status Banner */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Booking Status</p>
              {verifying ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Verifying payment...</span>
                </div>
              ) : (
                <Badge className={statusColors[booking.status] || 'bg-gray-100 text-gray-800'}>
                  {getStatusDisplay(booking.status)}
                </Badge>
              )}
            </div>
            {booking.status === 'active' && !verifying && (
              <Check className="h-8 w-8 text-green-600" />
            )}
            {awaitingApproval && booking.status !== 'canceled' && !verifying && (
              <Clock3 className="h-8 w-8 text-amber-600" />
            )}
          </div>
        </Card>

        {/* Spot Photos Gallery */}
        {spot.photos && spot.photos.length > 0 && (
          <Card className="overflow-hidden">
            <SpotPhotoGallery photos={spot.photos} />
          </Card>
        )}

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
            {booking.guest_license_plate && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">License Plate</span>
                <span className="font-mono">{booking.guest_license_plate}</span>
              </div>
            )}
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
              <span>{awaitingApproval ? 'Total (on hold)' : 'Total paid'}</span>
              <span>${booking.total_amount.toFixed(2)}</span>
            </div>
            {awaitingApproval && (
              <p className="text-xs text-muted-foreground mt-2">
                This amount is authorized on your card but won't be charged until the host approves.
              </p>
            )}
          </div>
        </Card>

        {/* Access Notes - only show if booking is active (approved) */}
        {spot.access_notes && booking.status === 'active' && (
          <Card className="p-4">
            <h3 className="font-semibold mb-2">Access Instructions</h3>
            <p className="text-sm text-muted-foreground">{spot.access_notes}</p>
          </Card>
        )}

        {/* EV Charging Instructions - only show if booking is active */}
        {booking.will_use_ev_charging && spot.has_ev_charging && spot.ev_charging_instructions && booking.status === 'active' && (
          <Card className="p-4 border-green-200 bg-green-50/50">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-5 w-5 text-green-600" />
              <h3 className="font-semibold text-green-800">EV Charging Instructions</h3>
            </div>
            <p className="text-sm text-green-700">{spot.ev_charging_instructions}</p>
          </Card>
        )}

        {/* Guest Chat - only show if booking is active */}
        {token && booking.status === 'active' && (
          <GuestChatPane 
            bookingId={bookingId!} 
            accessToken={token} 
            hostName={host?.first_name || 'Host'} 
          />
        )}


        {/* Actions */}
        <div className="space-y-3">
          {booking.status === 'active' && (
            <Button className="w-full" size="lg" onClick={openDirections}>
              <Navigation className="h-4 w-4 mr-2" />
              Get Directions
            </Button>
          )}

          {['pending', 'active', 'held'].includes(booking.status) && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="w-full" size="lg">
                  {awaitingApproval ? 'Cancel Request' : 'Cancel Booking'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {awaitingApproval ? 'Cancel Booking Request?' : 'Cancel Booking?'}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {awaitingApproval 
                      ? 'This will cancel your booking request. The hold on your card will be released.'
                      : 'Cancellations more than 1 hour before the start time are eligible for a full refund.'
                    }
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep {awaitingApproval ? 'Request' : 'Booking'}</AlertDialogCancel>
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
