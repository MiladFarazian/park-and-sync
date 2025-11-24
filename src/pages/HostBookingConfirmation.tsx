import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, DollarSign, MapPin, Star, MessageCircle, Car, Calendar, Navigation, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { differenceInHours, format } from 'date-fns';
import { Alert, AlertDescription } from '@/components/ui/alert';

const HostBookingConfirmation = () => {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [booking, setBooking] = useState<any>(null);
  const [spot, setSpot] = useState<any>(null);
  const [driver, setDriver] = useState<any>(null);
  const [vehicle, setVehicle] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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

    fetchBookingDetails();
  }, [bookingId, navigate, toast]);

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

  const handleGetDirections = () => {
    if (!spot?.address) return;
    
    const encodedAddress = encodeURIComponent(spot.address);
    const coords = spot.latitude && spot.longitude ? `${spot.latitude},${spot.longitude}` : '';
    const url = coords 
      ? `https://www.google.com/maps/dir/?api=1&destination=${coords}`
      : `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
    
    window.open(url, '_blank');
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
  const driverName = driver ? `${driver.first_name || ''} ${driver.last_name || ''}`.trim() : 'Driver';
  const driverInitial = driverName.charAt(0).toUpperCase();
  const bookingNumber = `#PK-${new Date(booking.created_at).getFullYear()}-${booking.id.slice(0, 3).toUpperCase()}`;
  const hostEarnings = booking.host_earnings || (booking.subtotal - booking.platform_fee);

  return (
    <div className="bg-background">
      {/* Header */}
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/host-home')}>
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
          <h2 className="text-2xl font-bold text-green-700 dark:text-green-500">
            New Booking Received! 🎉
          </h2>
          <p className="text-muted-foreground">
            You've earned ${hostEarnings.toFixed(2)} from this booking
          </p>
        </div>

        {/* Earnings Breakdown Card */}
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
              <h4 className="font-semibold mb-1">{spot.title}</h4>
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
          <Button 
            variant="outline" 
            className="w-full mt-4" 
            onClick={handleGetDirections}
          >
            <Navigation className="h-4 w-4 mr-2" />
            Get Directions to Spot
          </Button>
        </Card>

        {/* Driver Info Card */}
        <Card className="p-4">
          <h3 className="font-bold mb-4">Driver Information</h3>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12">
                <AvatarImage src={driver?.avatar_url} />
                <AvatarFallback>{driverInitial}</AvatarFallback>
              </Avatar>
              <div>
                <div className="font-semibold">{driverName}</div>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                  <span>{driver?.rating || 'New'}</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Vehicle Info */}
          {vehicle && (
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Car className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="font-medium text-sm">
                    {vehicle.make} {vehicle.model} {vehicle.year ? `(${vehicle.year})` : ''}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Plate: {vehicle.license_plate} • {vehicle.color || 'Unknown color'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Overstay Management Notice */}
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Overstay Management:</strong> If the driver stays beyond their booking time, 
            you can send warnings or request towing through the booking details page. A 15-minute 
            grace period applies before actions can be taken.
          </AlertDescription>
        </Alert>

        {/* Action Buttons */}
        <div className="space-y-3 pt-2">
          <Button 
            className="w-full" 
            size="lg"
            onClick={handleMessageDriver}
          >
            <MessageCircle className="h-4 w-4 mr-2" />
            Message Driver
          </Button>
          
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
