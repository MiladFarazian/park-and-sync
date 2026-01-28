import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, DollarSign, MapPin, Star, MessageCircle, Car, Calendar, AlertTriangle, Clock, XCircle, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { differenceInHours, format, formatDistanceToNow, isPast, addHours } from 'date-fns';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { getHostNetEarnings } from '@/lib/hostEarnings';
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
} from "@/components/ui/alert-dialog";
import { logger } from '@/lib/logger';

const log = logger.scope('HostBookingConfirmation');

const HostBookingConfirmation = () => {
  const { bookingId } = useParams<{ bookingId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile, loading: authLoading } = useAuth();
  
  const [booking, setBooking] = useState<any>(null);
  const [spot, setSpot] = useState<any>(null);
  const [driver, setDriver] = useState<any>(null);
  const [vehicle, setVehicle] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
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

  const fetchBookingDetails = async () => {
    if (authLoading) return;
    if (!bookingId) return;
    
    try {
      const { data: bookingData, error: bookingError } = await supabase
        .from('bookings')
        .select(`
          *,
          spots (
            *,
            spot_photos(url, is_primary)
          ),
          profiles!bookings_renter_id_fkey(
            id,
            user_id,
            first_name,
            last_name,
            avatar_url,
            rating,
            phone
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
      setDriver(bookingData.profiles);
      setVehicle(bookingData.vehicles);
    } catch (error) {
      log.error('Error fetching booking:', error);
      toast({
        title: "Error",
        description: "Failed to load booking details",
        variant: "destructive",
      });
      navigate('/host-home');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookingDetails();
  }, [bookingId, navigate, toast, authLoading]);

  const handleApproveBooking = async () => {
    setApproving(true);
    try {
      const { data, error } = await supabase.functions.invoke('approve-booking', {
        body: { booking_id: bookingId }
      });

      if (error) throw error;

      toast({
        title: "Booking Approved!",
        description: "The driver has been notified and charged.",
      });

      // Refresh booking data
      fetchBookingDetails();
    } catch (error: any) {
      log.error('Error approving booking:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to approve booking",
        variant: "destructive",
      });
    } finally {
      setApproving(false);
    }
  };

  const handleRejectBooking = async () => {
    setRejecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('reject-booking', {
        body: { booking_id: bookingId }
      });

      if (error) throw error;

      toast({
        title: "Booking Declined",
        description: "The driver has been notified. No charge was made.",
      });

      navigate('/host-home');
    } catch (error: any) {
      log.error('Error rejecting booking:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to decline booking",
        variant: "destructive",
      });
    } finally {
      setRejecting(false);
    }
  };

  const handleMessageDriver = async () => {
    if (!driver) return;
    
    try {
      navigate(`/messages?userId=${driver.user_id || driver.id}`);
    } catch (error) {
      log.error('Error navigating to messages:', error);
      toast({
        title: "Error",
        description: "Failed to open messages",
        variant: "destructive",
      });
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
        fetchBookingDetails();
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
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!booking || !spot) {
    return null;
  }

  const duration = differenceInHours(new Date(booking.end_at), new Date(booking.start_at));
  const primaryPhoto = spot?.spot_photos?.find((p: any) => p.is_primary)?.url || spot?.spot_photos?.[0]?.url;
  
  // For guest bookings, use guest_full_name; for registered users, use profile
  const isGuestBooking = booking.is_guest === true;
  const driverName = isGuestBooking 
    ? (booking.guest_full_name || 'Guest')
    : (driver ? `${driver.first_name || ''} ${driver.last_name || ''}`.trim() : 'Driver');
  const driverInitial = driverName.charAt(0).toUpperCase();
  const bookingNumber = `#PK-${new Date(booking.created_at).getFullYear()}-${booking.id.slice(0, 3).toUpperCase()}`;
  const hostEarnings = getHostNetEarnings(booking);
  const timeUntilExpiry = isPendingApproval && !hasExpired ? formatDistanceToNow(expiryAt, { addSuffix: true }) : null;

  return (
    <div className="bg-background min-h-screen">
      {/* Header */}
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/host-home')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-lg font-bold">
                {isPendingApproval ? 'Booking Request' : 'Booking Confirmed'}
              </h1>
              <p className="text-xs text-muted-foreground">{bookingNumber}</p>
            </div>
            {isPendingApproval && (
              <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                Pending
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-lg space-y-5">
        {/* Request Expired UI */}
        {(isExpired || hasExpired) && isPendingApproval ? (
          <>
            <div className="text-center space-y-3">
              <div className="flex justify-center">
                <div className="rounded-full bg-destructive/10 p-5">
                  <AlertCircle className="h-12 w-12 text-destructive" />
                </div>
              </div>
              <h2 className="text-xl font-bold text-destructive">Request Expired</h2>
              <p className="text-sm text-muted-foreground">
                This booking request expired because you didn't respond within 1 hour.
              </p>
            </div>

            <Card className="p-4 border-destructive/30 bg-destructive/5">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
                <div>
                  <h4 className="font-semibold text-sm">What happened?</h4>
                  <ul className="text-sm text-muted-foreground mt-1 space-y-1">
                    <li>• You had 1 hour to approve or decline</li>
                    <li>• The driver's card was not charged</li>
                    <li>• They have been notified</li>
                  </ul>
                </div>
              </div>
            </Card>

            <Button onClick={() => navigate('/host-home')} className="w-full">
              Back to Dashboard
            </Button>
          </>
        ) : isPendingApproval ? (
          <>
            {/* Pending Approval UI */}
            <div className="text-center space-y-3">
              <div className="flex justify-center">
                <div className="rounded-full bg-amber-100 dark:bg-amber-900/20 p-5">
                  <Clock className="h-12 w-12 text-amber-600 dark:text-amber-500" />
                </div>
              </div>
              <h2 className="text-xl font-bold">New Booking Request</h2>
              <p className="text-sm text-muted-foreground">
                A driver wants to book your spot. Review and respond within 1 hour.
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                Expires {timeUntilExpiry}
              </p>
            </div>

            {/* Approval Actions */}
            <Card className="p-5 border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-amber-700 dark:text-amber-400">Action Required</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Approve to earn <span className="font-semibold">${hostEarnings.toFixed(2)}</span> from this booking. 
                      If declined, the driver will be notified and <span className="font-medium text-green-600 dark:text-green-400">no charge will be made</span>.
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button 
                    className="flex-1" 
                    onClick={handleApproveBooking}
                    disabled={approving || rejecting}
                  >
                    {approving ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Approving...</>
                    ) : (
                      <><CheckCircle2 className="h-4 w-4 mr-2" /> Approve</>
                    )}
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button 
                        variant="outline" 
                        className="flex-1 border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                        disabled={approving || rejecting}
                      >
                        {rejecting ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Declining...</>
                        ) : (
                          <><XCircle className="h-4 w-4 mr-2" /> Decline</>
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Decline this booking?</AlertDialogTitle>
                        <AlertDialogDescription className="space-y-2">
                          <span className="block">The driver will be notified that their request was declined.</span>
                          <span className="block font-medium text-green-600">Their card will not be charged.</span>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={handleRejectBooking}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Decline Booking
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </Card>
          </>
        ) : (
          <>
            {/* Confirmed Booking UI */}
            <div className="text-center space-y-3">
              <div className="flex justify-center">
                <div className="rounded-full bg-green-100 dark:bg-green-900/20 p-5">
                  <CheckCircle2 className="h-12 w-12 text-green-600 dark:text-green-500" />
                </div>
              </div>
              <h2 className="text-xl font-bold text-green-700 dark:text-green-500">
                Booking Confirmed! 🎉
              </h2>
              <p className="text-muted-foreground">
                You've earned <span className="font-bold text-foreground">${hostEarnings.toFixed(2)}</span> from this booking
              </p>
            </div>
          </>
        )}

        {/* Earnings Breakdown Card - Only show for confirmed bookings */}
        {!isPendingApproval && (
          <Card className="p-5 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-primary">
                <DollarSign className="h-5 w-5" />
                <h3 className="font-semibold">Earnings Breakdown</h3>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Booking Subtotal</span>
                <span className="font-medium">${booking.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Platform Fee (15%)</span>
                <span className="font-medium text-destructive">-${booking.platform_fee.toFixed(2)}</span>
              </div>
              <Separator />
              <div className="flex justify-between items-center">
                <span className="font-semibold">Your Earnings</span>
                <span className="font-bold text-xl text-primary">${hostEarnings.toFixed(2)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Funds available after booking completion
              </p>
            </div>
          </Card>
        )}

        {/* Potential Earnings Card - Show for pending bookings */}
        {isPendingApproval && (
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-muted-foreground">
                <DollarSign className="h-5 w-5" />
                <span className="font-medium">Potential Earnings</span>
              </div>
              <span className="font-bold text-lg">${hostEarnings.toFixed(2)}</span>
            </div>
          </Card>
        )}

        {/* Spot Details Card */}
        <Card className="p-4">
          <h3 className="font-semibold mb-3 text-sm text-muted-foreground uppercase tracking-wide">Spot</h3>
          <div className="flex gap-4">
            {primaryPhoto && (
              <img 
                src={primaryPhoto} 
                alt={spot.title} 
                className="w-16 h-16 rounded-lg object-cover shrink-0" 
              />
            )}
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-start gap-1.5 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <span className="truncate">{spot.address}</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>
                  {format(new Date(booking.start_at), 'EEE, MMM d • h:mm a')} – {format(new Date(booking.end_at), 'h:mm a')}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {duration} hour{duration !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </Card>

        {/* Driver Info Card */}
        <Card className="p-4">
          <h3 className="font-bold mb-4">
            {isGuestBooking ? 'Guest Information' : 'Driver Information'}
          </h3>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12">
                {!isGuestBooking && <AvatarImage src={driver?.avatar_url} />}
                <AvatarFallback>{driverInitial}</AvatarFallback>
              </Avatar>
              <div>
                <div className="font-semibold flex items-center gap-2">
                  {driverName}
                  {isGuestBooking && (
                    <Badge variant="outline" className="text-xs">Guest</Badge>
                  )}
                </div>
                {!isGuestBooking && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    <span>{driver?.rating || 'New'}</span>
                  </div>
                )}
                {isGuestBooking && booking.guest_email && (
                  <div className="text-sm text-muted-foreground">{booking.guest_email}</div>
                )}
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                if (isGuestBooking) {
                  navigate(`/messages?userId=guest:${booking.id}`);
                } else {
                  handleMessageDriver();
                }
              }}
            >
              <MessageCircle className="h-4 w-4 mr-2" />
              Message
            </Button>
          </div>
          
          {/* Vehicle Info */}
          {(vehicle || isGuestBooking) && (
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Car className="h-5 w-5 text-primary" />
                </div>
                <div>
                  {isGuestBooking ? (
                    <>
                      <div className="font-medium text-sm">
                        {booking.guest_car_model || 'Vehicle not specified'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Plate: {booking.guest_license_plate || 'Not provided'}
                      </div>
                    </>
                  ) : vehicle ? (
                    <>
                      <div className="font-medium text-sm">
                        {vehicle.make} {vehicle.model} {vehicle.year ? `(${vehicle.year})` : ''}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Plate: {vehicle.license_plate} • {vehicle.color || 'Unknown color'}
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Departure Confirmation Info */}
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Departure Confirmation:</strong> The driver can confirm their departure when the booking 
            is ending or has just ended. You'll be notified when they confirm. If they don't confirm departure 
            and overstay their time, you can send warnings or request towing through the booking details page.
          </AlertDescription>
        </Alert>

        {/* Action Buttons */}
        <div className="space-y-3 pt-2">
          <Button
            variant="outline" 
            className="w-full" 
            size="lg"
            onClick={() => navigate(`/booking/${bookingId}`)}
          >
            View Full Booking Details
          </Button>
          
          <Button 
            variant="outline" 
            className="w-full" 
            size="lg"
            onClick={() => navigate('/dashboard')}
          >
            View All Bookings
          </Button>
        </div>
      </div>
    </div>
  );
};

export default HostBookingConfirmation;
