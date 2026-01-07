import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, DollarSign, MapPin, Star, MessageCircle, Car, Calendar, AlertTriangle, Clock, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { differenceInHours, format, formatDistanceToNow } from 'date-fns';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
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
      console.error('Error fetching booking:', error);
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
      console.error('Error approving booking:', error);
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
      console.error('Error rejecting booking:', error);
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
      console.error('Error navigating to messages:', error);
      toast({
        title: "Error",
        description: "Failed to open messages",
        variant: "destructive",
      });
    }
  };

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
  const hostEarnings = booking.host_earnings || (booking.subtotal - booking.platform_fee);
  const isPendingApproval = booking.status === 'held';
  const timeUntilExpiry = isPendingApproval ? formatDistanceToNow(new Date(new Date(booking.created_at).getTime() + 60 * 60 * 1000), { addSuffix: true }) : null;

  return (
    <div className="bg-background">
      {/* Header */}
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/host-home')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-bold">
              {isPendingApproval ? 'Booking Request' : 'Booking Confirmed'}
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
        {/* Status Message */}
        {isPendingApproval ? (
          <>
            {/* Pending Approval UI */}
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="rounded-full bg-yellow-100 dark:bg-yellow-900/20 p-6">
                  <Clock className="h-16 w-16 text-yellow-600 dark:text-yellow-500" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-yellow-700 dark:text-yellow-500">
                New Booking Request
              </h2>
              <p className="text-muted-foreground">
                A driver wants to book your spot. Approve or decline within 1 hour.
              </p>
              <p className="text-sm text-muted-foreground">
                Request expires {timeUntilExpiry}
              </p>
            </div>

            {/* Approval Actions */}
            <Card className="p-6 border-yellow-200 dark:border-yellow-800 bg-yellow-50/50 dark:bg-yellow-900/10">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400 mb-2">
                  <AlertTriangle className="h-5 w-5" />
                  <h3 className="font-bold">Action Required</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  The driver's card has been authorized for ${booking.total_amount.toFixed(2)}. 
                  If you approve, the charge will be processed. If you decline or don't respond within 1 hour, 
                  the authorization will be released and they won't be charged.
                </p>
                <div className="flex gap-3 pt-2">
                  <Button 
                    className="flex-1" 
                    onClick={handleApproveBooking}
                    disabled={approving || rejecting}
                  >
                    {approving ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Approving...</>
                    ) : (
                      <><CheckCircle2 className="h-4 w-4 mr-2" /> Approve Booking</>
                    )}
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button 
                        variant="outline" 
                        className="flex-1 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
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
                        <AlertDialogTitle>Decline Booking Request?</AlertDialogTitle>
                        <AlertDialogDescription>
                          The driver will be notified and their card will not be charged. 
                          This action cannot be undone.
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
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="rounded-full bg-green-100 dark:bg-green-900/20 p-6">
                  <CheckCircle2 className="h-16 w-16 text-green-600 dark:text-green-500" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-green-700 dark:text-green-500">
                New Booking Received! 🎉
              </h2>
              <p className="text-muted-foreground">
                You've earned ${hostEarnings.toFixed(2)} from this booking
              </p>
            </div>
          </>
        )}

        {/* Earnings Breakdown Card - Only show for confirmed bookings */}
        {!isPendingApproval && (
          <Card className="p-6 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-primary mb-2">
                <DollarSign className="h-5 w-5" />
                <h3 className="font-bold text-lg">Your Earnings</h3>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Booking Total</span>
                <span className="font-semibold">${booking.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Platform Fee (15%)</span>
                <span className="font-semibold text-red-500">-${booking.platform_fee.toFixed(2)}</span>
              </div>
              <Separator />
              <div className="flex justify-between items-center">
                <span className="font-bold text-base">You Receive</span>
                <span className="font-bold text-2xl text-primary">${hostEarnings.toFixed(2)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Earnings will be available after the booking is completed
              </p>
            </div>
          </Card>
        )}

        {/* Potential Earnings Card - Show for pending bookings */}
        {isPendingApproval && (
          <Card className="p-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <DollarSign className="h-5 w-5" />
                <h3 className="font-bold text-lg">Potential Earnings</h3>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">If approved, you'll earn</span>
                <span className="font-bold text-xl">${hostEarnings.toFixed(2)}</span>
              </div>
            </div>
          </Card>
        )}

        {/* Booking Summary */}
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
          </div>
        </Card>

        {/* Spot Details Card */}
        <Card className="p-4">
          <h3 className="font-bold mb-4">Your Spot</h3>
          <div className="flex gap-4">
            {primaryPhoto && (
              <img 
                src={primaryPhoto} 
                alt={spot.title} 
                className="w-20 h-20 rounded-lg object-cover" 
              />
            )}
            <div className="flex-1">
              <div className="flex items-center gap-1 text-sm text-muted-foreground mb-2">
                <MapPin className="h-3 w-3" />
                <span>{spot.address}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>
                  {format(new Date(booking.start_at), 'MMM d, h:mm a')} - {format(new Date(booking.end_at), 'h:mm a')}
                </span>
              </div>
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
