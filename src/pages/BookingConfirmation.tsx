import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Clock, MapPin, Star, MessageCircle, Car, Calendar, XCircle, Navigation, Copy, AlertTriangle, Zap, Key, CalendarPlus, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { differenceInHours, format, formatDistanceToNow, isPast, addHours } from 'date-fns';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useAuth } from '@/contexts/AuthContext';
import RequireAuth from '@/components/auth/RequireAuth';
import { calculateDriverPrice } from '@/lib/pricing';
import { logger } from '@/lib/logger';

const log = logger.scope('BookingConfirmation');

const BookingConfirmationContent = () => {
  const {
    bookingId
  } = useParams<{
    bookingId: string;
  }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const {
    toast
  } = useToast();
  const { user, profile, loading: authLoading } = useAuth();
  const [booking, setBooking] = useState<any>(null);
  const [spot, setSpot] = useState<any>(null);
  const [host, setHost] = useState<any>(null);
  const [vehicle, setVehicle] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [directionsDialogOpen, setDirectionsDialogOpen] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const [expiringRequest, setExpiringRequest] = useState(false);
  const expireAttemptedRef = useRef(false);
  const magicLoginToastShown = useRef(false);

  // Show magic login toast if user arrived via magic link
  useEffect(() => {
    const isMagicLogin = searchParams.get('magic_login') === 'true';
    if (isMagicLogin && user && !magicLoginToastShown.current) {
      magicLoginToastShown.current = true;
      const displayName = profile?.email || user.email || profile?.phone || 'your account';
      toast({
        title: "Logged in successfully",
        description: `Signed in as ${displayName}`,
      });
      // Clean up URL
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, [searchParams, user, profile, toast]);

  useEffect(() => {
    const fetchBookingDetails = async () => {
      // Wait for auth to be resolved before fetching
      if (authLoading) return;
      if (!bookingId) return;
      try {
        // Fetch booking with related data
        const {
          data: bookingData,
          error: bookingError
        } = await supabase.from('bookings').select(`
            id,
            spot_id,
            renter_id,
            vehicle_id,
            start_at,
            end_at,
            status,
            hourly_rate,
            total_hours,
            subtotal,
            platform_fee,
            total_amount,
            host_earnings,
            ev_charging_fee,
            extension_charges,
            is_guest,
            guest_full_name,
            guest_email,
            guest_phone,
            guest_car_model,
            guest_license_plate,
            created_at,
            updated_at,
            departed_at,
            cancellation_reason,
            overstay_detected_at,
            overstay_action,
            will_use_ev_charging,
            refund_amount,
            original_total_amount,
            stripe_payment_intent_id,
            spots (
              *,
              spot_photos(url, is_primary),
              profiles!spots_host_id_fkey(
                id,
                user_id,
                first_name,
                last_name,
                avatar_url,
                rating
              )
            ),
            vehicles (
              *
            )
          `).eq('id', bookingId).single();
        if (bookingError) throw bookingError;
        setBooking(bookingData);
        setSpot(bookingData.spots);
        setHost(bookingData.spots.profiles);
        setVehicle(bookingData.vehicles);
      } catch (error) {
        log.error('Error fetching booking:', error);
        toast({
          title: "Error",
          description: "Failed to load booking details",
          variant: "destructive"
        });
        navigate('/');
      } finally {
        setLoading(false);
      }
    };
    fetchBookingDetails();
  }, [bookingId, navigate, toast, authLoading]);
  const handleContactHost = async () => {
    if (!host) return;
    try {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth');
        return;
      }

      // Navigate to messages page with host's user_id
      navigate(`/messages?userId=${host.user_id || host.id}`);
    } catch (error) {
      log.error('Error navigating to messages:', error);
      toast({
        title: "Error",
        description: "Failed to open messages",
        variant: "destructive"
      });
    }
  };
  const handleDirections = () => {
    setDirectionsDialogOpen(true);
  };
  const openMapApp = (app: 'google' | 'apple' | 'waze') => {
    if (!spot?.address) return;
    const encodedAddress = encodeURIComponent(spot.address);
    const coords = spot.latitude && spot.longitude ? `${spot.latitude},${spot.longitude}` : '';
    let url = '';
    switch (app) {
      case 'google':
        // Google Maps works on all platforms
        url = coords ? `https://www.google.com/maps/dir/?api=1&destination=${coords}` : `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
        break;
      case 'apple':
        // Apple Maps
        url = coords ? `http://maps.apple.com/?daddr=${coords}` : `http://maps.apple.com/?q=${encodedAddress}`;
        break;
      case 'waze':
        // Waze
        url = coords ? `https://waze.com/ul?ll=${coords}&navigate=yes` : `https://waze.com/ul?q=${encodedAddress}&navigate=yes`;
        break;
    }
    window.open(url, '_blank');
    setDirectionsDialogOpen(false);
  };
  const getCancellationPolicy = () => {
    if (!booking) return {
      refundable: false,
      message: ''
    };
    const now = new Date();
    const bookingStart = new Date(booking.start_at);
    const bookingCreated = new Date(booking.created_at);
    const gracePeriodEnd = new Date(bookingCreated.getTime() + 10 * 60 * 1000);
    const oneHourBeforeStart = new Date(bookingStart.getTime() - 60 * 60 * 1000);
    if (now <= gracePeriodEnd) {
      return {
        refundable: true,
        message: 'Full refund - within 10-minute grace period'
      };
    } else if (now <= oneHourBeforeStart) {
      return {
        refundable: true,
        message: 'Full refund - more than 1 hour before start time'
      };
    } else {
      return {
        refundable: false,
        message: 'No refund - less than 1 hour before start time'
      };
    }
  };
  const handleCancelBooking = async () => {
    if (!booking) return;
    setCancelling(true);
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke('cancel-booking', {
        body: {
          bookingId: booking.id
        }
      });
      if (error) throw error;
      toast({
        title: "Booking cancelled",
        description: data.refundAmount > 0 ? `Refund of $${data.refundAmount.toFixed(2)} will be processed within 5-10 business days` : data.refundReason
      });

      // Refresh booking details
      const {
        data: updatedBooking
      } = await supabase.from('bookings').select(`
          id,
          spot_id,
          renter_id,
          vehicle_id,
          start_at,
          end_at,
          status,
          hourly_rate,
          total_hours,
          subtotal,
          platform_fee,
          total_amount,
          host_earnings,
          ev_charging_fee,
          extension_charges,
          is_guest,
          guest_full_name,
          guest_email,
          guest_phone,
          guest_car_model,
          guest_license_plate,
          created_at,
          updated_at,
          departed_at,
          cancellation_reason,
          overstay_detected_at,
          overstay_action,
          will_use_ev_charging,
          refund_amount,
          original_total_amount,
          stripe_payment_intent_id,
          spots (
            *,
            spot_photos(url, is_primary),
            profiles!spots_host_id_fkey(
              id,
              user_id,
              first_name,
              last_name,
              avatar_url,
              rating
            )
          ),
          vehicles (
            *
          )
        `).eq('id', bookingId).single();
      if (updatedBooking) {
        setBooking(updatedBooking);
      }
      setCancelDialogOpen(false);
    } catch (error) {
      log.error('Error cancelling booking:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to cancel booking",
        variant: "destructive"
      });
    } finally {
      setCancelling(false);
    }
  };
  // Calculate expiry values (safe even when booking is null)
  const expiryAt = booking ? addHours(new Date(booking.created_at), 1) : new Date();
  const isPendingApproval = booking?.status === 'held';
  const hasExpired = isPendingApproval && isPast(expiryAt);

  // Expire the booking request if it's past the expiry time
  const expireBookingRequest = useCallback(async () => {
    if (!booking?.id || expireAttemptedRef.current || expiringRequest) return;
    expireAttemptedRef.current = true;
    setExpiringRequest(true);

    try {
      log.debug('Expiring booking request', { bookingId: booking.id });
      const { data, error } = await supabase.functions.invoke('expire-booking-request', {
        body: { booking_id: booking.id }
      });

      if (error) {
        log.error('Failed to expire booking request', { error });
      } else {
        log.debug('Booking request expired', { result: data });
        setIsExpired(true);
        // Refetch booking to get updated status
        const { data: updatedBooking } = await supabase
          .from('bookings')
          .select('status, cancellation_reason')
          .eq('id', booking.id)
          .single();
        if (updatedBooking) {
          setBooking((prev: any) => ({ ...prev, ...updatedBooking }));
        }
      }
    } catch (error) {
      log.error('Error expiring booking request', { error });
    } finally {
      setExpiringRequest(false);
    }
  }, [booking?.id, expiringRequest]);

  // Check for expiry on mount and trigger expire function
  useEffect(() => {
    if (hasExpired && !expireAttemptedRef.current) {
      setIsExpired(true);
      expireBookingRequest();
    }
  }, [hasExpired, expireBookingRequest]);

  if (loading) {
    return <div className="flex items-center justify-center py-20">
        <div className="text-muted-foreground">Loading...</div>
      </div>;
  }
  if (!booking || !spot) {
    return null;
  }
  const duration = differenceInHours(new Date(booking.end_at), new Date(booking.start_at));
  const primaryPhoto = spot?.spot_photos?.find((p: any) => p.is_primary)?.url || spot?.spot_photos?.[0]?.url;
  const hostName = host ? `${host.first_name || ''} ${host.last_name || ''}`.trim() : 'Host';
  const hostInitial = hostName.charAt(0).toUpperCase();
  const bookingNumber = `#PK-${new Date(booking.created_at).getFullYear()}-${booking.id.slice(0, 3).toUpperCase()}`;
  const timeUntilExpiry = isPendingApproval && !hasExpired ? formatDistanceToNow(expiryAt, { addSuffix: true }) : null;

  return <div className="bg-background">
      {/* Header */}
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/activity')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-bold">
              {isPendingApproval ? 'Booking Request Sent' : 'Booking Confirmed'}
            </h1>
            {isPendingApproval && (
              <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                Pending Approval
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-2xl space-y-6">
        {/* Request Expired UI */}
        {(isExpired || hasExpired) && isPendingApproval ? (
          <>
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="rounded-full bg-destructive/10 p-6">
                  <AlertCircle className="h-16 w-16 text-destructive" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-destructive">Request Expired</h2>
              <p className="text-muted-foreground">
                The host didn't respond within the 1-hour window. Your card was not charged.
              </p>
            </div>

            <Card className="p-4 border-destructive/30 bg-destructive/5">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
                <div>
                  <h4 className="font-semibold text-sm">What happened?</h4>
                  <ul className="text-sm text-muted-foreground mt-1 space-y-1">
                    <li>• The host had 1 hour to approve your request</li>
                    <li>• They didn't respond in time</li>
                    <li>• The authorization on your card has been released</li>
                    <li>• You can search for another spot</li>
                  </ul>
                </div>
              </div>
            </Card>

            <div className="flex flex-col gap-3">
              <Button onClick={() => navigate('/explore')} className="w-full">
                Search for Another Spot
              </Button>
              <Button variant="outline" onClick={() => navigate('/activity')} className="w-full">
                Back to Activity
              </Button>
            </div>
          </>
        ) : isPendingApproval ? (
          <>
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="rounded-full bg-yellow-100 dark:bg-yellow-900/20 p-6">
                  <Clock className="h-16 w-16 text-yellow-600 dark:text-yellow-500" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-yellow-700 dark:text-yellow-500">Request Sent!</h2>
              <p className="text-muted-foreground">
                Your booking request has been sent to the host. They have 1 hour to respond.
              </p>
              <p className="text-sm text-muted-foreground">
                Request expires {timeUntilExpiry}
              </p>
            </div>

            <Card className="p-4 border-yellow-200 dark:border-yellow-800 bg-yellow-50/50 dark:bg-yellow-900/10">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-sm">What happens next?</h4>
                  <ul className="text-sm text-muted-foreground mt-1 space-y-1">
                    <li>• Your card has been authorized (not charged)</li>
                    <li>• If approved, you'll be charged and receive confirmation</li>
                    <li>• If declined or no response in 1 hour, authorization is released</li>
                    <li>• You'll be notified either way</li>
                  </ul>
                </div>
              </div>
            </Card>
          </>
        ) : (
          <>
            {/* Compact Success Header for Confirmed Bookings */}
            <div className="flex items-center justify-center gap-3 py-2">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-full">
                <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div className="text-center">
                <h2 className="text-lg font-semibold text-green-700 dark:text-green-400">Booking Confirmed!</h2>
                <p className="text-sm text-muted-foreground">Confirmation sent to your email</p>
              </div>
            </div>

          </>
        )}

        {/* Parking Spot Card - Combined with navigation for confirmed bookings */}
        <Card className={`p-4 ${!isPendingApproval ? 'border-primary/30 bg-primary/5' : ''}`}>
          <h3 className="font-bold mb-4">Parking Spot</h3>
          
          {/* Spot photo and title */}
          <div className="flex gap-4">
            {primaryPhoto && <img src={primaryPhoto} alt={spot.title} className="w-20 h-20 rounded-lg object-cover" />}
            <div className="flex-1">
              <div className="font-semibold">{spot.title}</div>
              {/* Address with copy button for confirmed bookings */}
              {!isPendingApproval && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                  <MapPin className="h-3 w-3 flex-shrink-0" />
                  <span className="flex-1">{spot.address}</span>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(spot.address);
                      toast({ title: "Address copied", description: "Ready to paste in your navigation app" });
                    }}
                    className="p-1 hover:bg-muted rounded"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
              )}
              {/* Address for pending bookings */}
              {isPendingApproval && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                  <MapPin className="h-3 w-3 flex-shrink-0" />
                  <span>{spot.address}</span>
                </div>
              )}
              {/* Booking time */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                <Calendar className="h-3 w-3" />
                <span>{format(new Date(booking.start_at), 'MMM d, h:mm a')} - {format(new Date(booking.end_at), 'h:mm a')}</span>
              </div>
            </div>
          </div>

          {/* Get Directions button - prominent for confirmed bookings */}
          {!isPendingApproval && (
            <Button size="lg" className="w-full mt-4" onClick={handleDirections}>
              <Navigation className="mr-2 h-5 w-5" />
              Get Directions
            </Button>
          )}
          
          {/* Spot Description */}
          {spot.description && (
            <div className="mt-4 pt-4 border-t">
              <h4 className="text-sm font-semibold mb-2">About This Spot</h4>
              <p className="text-sm text-muted-foreground">{spot.description}</p>
            </div>
          )}

          {/* Access Instructions - inside Parking Spot card for confirmed bookings */}
          {!isPendingApproval && spot.access_notes && (
            <div className="mt-4 pt-4 border-t">
              <div className="flex items-center gap-2 mb-2">
                <Key className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300">Access Instructions</h4>
              </div>
              <p className="text-sm text-amber-900 dark:text-amber-100">{spot.access_notes}</p>
            </div>
          )}

          {/* EV Charging Instructions - inside Parking Spot card for confirmed bookings */}
          {!isPendingApproval && booking.will_use_ev_charging && spot?.ev_charging_instructions && (
            <div className="mt-4 pt-4 border-t">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-4 w-4 text-green-600 dark:text-green-400" />
                <h4 className="text-sm font-semibold text-green-800 dark:text-green-300">EV Charging Instructions</h4>
              </div>
              <p className="text-sm text-green-700 dark:text-green-400">{spot.ev_charging_instructions}</p>
            </div>
          )}
        </Card>

        {/* Booking Summary Card */}
        <Card className="p-6">
          <h3 className="font-bold mb-4">Payment Details</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Booking ID</span>
              <span className="font-medium">{bookingNumber}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Duration</span>
              <span className="font-medium">{duration} hours</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Parking ({duration} hrs × ${calculateDriverPrice(booking.hourly_rate || 0).toFixed(2)}/hr)</span>
              <span className="font-medium">${booking.subtotal?.toFixed(2) || '0.00'}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Service fee</span>
              <span className="font-medium">${booking.platform_fee?.toFixed(2) || '0.00'}</span>
            </div>
            {booking.will_use_ev_charging && (booking.ev_charging_fee ?? 0) > 0 && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Zap className="h-3 w-3 text-green-600" />
                  EV Charging
                </span>
                <span className="font-medium">${(booking.ev_charging_fee ?? 0).toFixed(2)}</span>
              </div>
            )}
            {(booking.extension_charges ?? 0) > 0 && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Extensions</span>
                <span className="font-medium">${(booking.extension_charges ?? 0).toFixed(2)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between items-center text-lg">
              <span className="font-bold">Total Paid</span>
              <span className="font-bold text-primary">${booking.total_amount.toFixed(2)}</span>
            </div>
            {booking.will_use_ev_charging && (
              <div className="flex items-center gap-2 pt-2 text-sm text-green-700 dark:text-green-400">
                <Zap className="h-4 w-4" />
                <span>EV Charging included in this booking</span>
              </div>
            )}
          </div>
        </Card>

        {/* Directions Dialog */}
        <AlertDialog open={directionsDialogOpen} onOpenChange={setDirectionsDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Choose Your Map App</AlertDialogTitle>
              <AlertDialogDescription>
                Select which map application you'd like to use for directions to:
                <div className="mt-2 p-2 bg-muted rounded text-foreground font-medium">
                  {spot?.address}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2 py-4">
              <Button variant="outline" className="w-full justify-start h-auto py-3" onClick={() => openMapApp('google')}>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded bg-blue-500 flex items-center justify-center text-white text-xl">
                    🗺️
                  </div>
                  <div className="text-left">
                    <div className="font-semibold">Google Maps</div>
                    <div className="text-xs text-muted-foreground">Navigate with Google Maps</div>
                  </div>
                </div>
              </Button>
              <Button variant="outline" className="w-full justify-start h-auto py-3" onClick={() => openMapApp('apple')}>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xl">
                    🍎
                  </div>
                  <div className="text-left">
                    <div className="font-semibold">Apple Maps</div>
                    <div className="text-xs text-muted-foreground">Navigate with Apple Maps</div>
                  </div>
                </div>
              </Button>
              <Button variant="outline" className="w-full justify-start h-auto py-3" onClick={() => openMapApp('waze')}>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded bg-sky-400 flex items-center justify-center text-white text-xl">
                    🚗
                  </div>
                  <div className="text-left">
                    <div className="font-semibold">Waze</div>
                    <div className="text-xs text-muted-foreground">Navigate with Waze</div>
                  </div>
                </div>
              </Button>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Vehicle Info Card */}
        {vehicle && <Card className="p-4">
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
          </Card>}

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
                {host?.rating ? (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    <span>{Number(host.rating).toFixed(1)}</span>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">New host</span>
                )}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleContactHost}>
              <MessageCircle className="h-4 w-4 mr-2" />
              Message
            </Button>
          </div>
        </Card>

        {/* Ad Placeholder - Future geolocation-based ads */}
        

        {/* Action Buttons */}
        <div className="space-y-3 pt-2">
          <Button className="w-full" size="lg" onClick={() => navigate('/activity')}>
            View My Bookings
          </Button>
          <Button variant="outline" className="w-full" size="lg" onClick={() => navigate(`/book/${spot.id}`)}>
            <CalendarPlus className="h-4 w-4 mr-2" />
            Book This Spot Again
          </Button>
          <Button variant="ghost" className="w-full" size="lg" onClick={() => navigate('/')}>
            Find Other Parking
          </Button>
          
          {/* Cancel Booking Button - Only show if not cancelled and not past */}
          {booking.status !== 'canceled' && new Date(booking.end_at) > new Date() && <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full" size="lg">
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
                  <AlertDialogAction onClick={handleCancelBooking} disabled={cancelling} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    {cancelling ? 'Cancelling...' : 'Cancel Booking'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>}
        </div>
      </div>
    </div>;
};

const BookingConfirmation = () => {
  return (
    <RequireAuth feature="booking">
      <BookingConfirmationContent />
    </RequireAuth>
  );
};

export default BookingConfirmation;