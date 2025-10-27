import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, Clock, MapPin, Star, Edit2, CreditCard, Car, Plus, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { differenceInHours, addHours, format } from 'date-fns';

const Booking = () => {
  const { spotId } = useParams<{ spotId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [spot, setSpot] = useState<any>(null);
  const [host, setHost] = useState<any>(null);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [bookingLoading, setBookingLoading] = useState(false);
  
  // Auto-fill start time (1 hour from now) and end time (5 hours from now, so 4 hours duration)
  const defaultStart = addHours(new Date(), 1);
  const defaultEnd = addHours(defaultStart, 4);
  const [startDateTime, setStartDateTime] = useState<string>(format(defaultStart, "yyyy-MM-dd'T'HH:mm"));
  const [endDateTime, setEndDateTime] = useState<string>(format(defaultEnd, "yyyy-MM-dd'T'HH:mm"));
  
  const [editTimeOpen, setEditTimeOpen] = useState(false);
  const [editVehicleOpen, setEditVehicleOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!spotId) return;
      
      try {
        // Fetch spot with host info and first photo
        const { data: spotData, error: spotError } = await supabase
          .from('spots')
          .select(`
            *,
            spot_photos(url, is_primary),
            profiles!spots_host_id_fkey(
              first_name,
              last_name,
              avatar_url,
              rating
            )
          `)
          .eq('id', spotId)
          .single();

        if (spotError) throw spotError;

        setSpot(spotData);
        setHost(spotData.profiles);

        // Fetch user's vehicles
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: vehiclesData } = await supabase
            .from('vehicles')
            .select('*')
            .eq('user_id', user.id)
            .order('is_primary', { ascending: false });
          
          if (vehiclesData && vehiclesData.length > 0) {
            setVehicles(vehiclesData);
            setSelectedVehicle(vehiclesData[0]); // Select first vehicle by default
          }
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        toast({
          title: "Error",
          description: "Failed to load booking information",
          variant: "destructive",
        });
        navigate('/');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [spotId, navigate, toast]);

  const calculateTotal = () => {
    if (!startDateTime || !endDateTime || !spot) {
      console.log('Missing dates:', { startDateTime, endDateTime, spot });
      return null;
    }

    const start = new Date(startDateTime);
    const end = new Date(endDateTime);
    
    console.log('Date objects:', { start, end });
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      console.log('Invalid date objects');
      return null;
    }
    
    const hours = differenceInHours(end, start);
    console.log('Hours calculated:', hours);
    
    if (hours <= 0) {
      console.log('Hours less than or equal to 0');
      return null;
    }

    const subtotal = hours * spot.hourly_rate;
    const platformFee = subtotal * 0.15;
    const total = subtotal + platformFee;

    console.log('Pricing:', { hours, subtotal, platformFee, total });

    return {
      hours: hours.toString(),
      subtotal: subtotal.toFixed(2),
      platformFee: platformFee.toFixed(2),
      total: total.toFixed(2),
    };
  };

  const handleBooking = async () => {
    if (!startDateTime || !endDateTime) {
      toast({
        title: "Missing information",
        description: "Please select start and end times",
        variant: "destructive",
      });
      return;
    }

    const pricing = calculateTotal();
    if (!pricing) {
      toast({
        title: "Invalid time range",
        description: "End time must be after start time",
        variant: "destructive",
      });
      return;
    }

    setBookingLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast({
          title: "Authentication required",
          description: "Please sign in to book this spot",
          variant: "destructive",
        });
        navigate('/auth');
        return;
      }

      const startAt = new Date(startDateTime);
      const endAt = new Date(endDateTime);

      // Create booking hold first
      const { data: holdData, error: holdError } = await supabase.functions.invoke('create-booking-hold', {
        body: {
          spot_id: spotId,
          start_at: startAt.toISOString(),
          end_at: endAt.toISOString(),
        },
      });

      if (holdError) throw holdError;

      // Create the booking
      const { data: bookingData, error: bookingError } = await supabase.functions.invoke('create-booking', {
        body: {
          spot_id: spotId,
          start_at: startAt.toISOString(),
          end_at: endAt.toISOString(),
          total_amount: parseFloat(pricing.total),
        },
      });

      if (bookingError) throw bookingError;

      toast({
        title: "Booking created!",
        description: "Your booking has been confirmed",
      });

      navigate('/bookings');
    } catch (error) {
      console.error('Booking error:', error);
      toast({
        title: "Booking failed",
        description: error instanceof Error ? error.message : "Failed to create booking",
        variant: "destructive",
      });
    } finally {
      setBookingLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!spot) {
    return null;
  }

  const pricing = calculateTotal();

  const primaryPhoto = spot?.spot_photos?.find((p: any) => p.is_primary)?.url || spot?.spot_photos?.[0]?.url;
  const hostName = host ? `${host.first_name || ''} ${host.last_name || ''}`.trim() : 'Host';
  const hostInitial = hostName.charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-bold">Order Summary</h1>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-2xl space-y-4">
        {/* Spot Overview Card */}
        <Card className="p-4">
          <div className="flex gap-4">
            {primaryPhoto && (
              <img 
                src={primaryPhoto} 
                alt={spot.title}
                className="w-24 h-24 rounded-lg object-cover"
              />
            )}
            <div className="flex-1">
              <h2 className="font-bold text-lg mb-1">{spot.title}</h2>
              <div className="flex items-center gap-1 text-sm text-muted-foreground mb-2">
                <MapPin className="h-3 w-3" />
                <span>{spot.address}</span>
              </div>
              <div className="flex items-center gap-3 text-sm mb-3">
                <div className="flex items-center gap-1">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  <span className="font-semibold">4.9</span>
                  <span className="text-muted-foreground">(127)</span>
                </div>
                <span className="font-bold">${spot.hourly_rate}/hr</span>
              </div>
              <Separator className="my-3" />
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={host?.avatar_url} />
                  <AvatarFallback>{hostInitial}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="text-sm font-medium">Hosted by {hostName}</div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    <span>{host?.rating || '4.8'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Parking Time Card */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-lg">Parking Time</h3>
            <Dialog open={editTimeOpen} onOpenChange={setEditTimeOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Edit2 className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit Parking Time</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-start">Start Time</Label>
                    <Input
                      id="edit-start"
                      type="datetime-local"
                      value={startDateTime}
                      onChange={(e) => setStartDateTime(e.target.value)}
                      min={new Date().toISOString().slice(0, 16)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-end">End Time</Label>
                    <Input
                      id="edit-end"
                      type="datetime-local"
                      value={endDateTime}
                      onChange={(e) => setEndDateTime(e.target.value)}
                      min={startDateTime}
                    />
                  </div>
                  <Button className="w-full" onClick={() => setEditTimeOpen(false)}>
                    Save Changes
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>{format(new Date(startDateTime), 'EEEE, MMM d')}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>{format(new Date(startDateTime), 'h:mm a')} - {format(new Date(endDateTime), 'h:mm a')}</span>
              <span className="ml-auto bg-primary/10 text-primary px-2 py-0.5 rounded text-xs font-medium">
                {pricing?.hours}h
              </span>
            </div>
          </div>
        </Card>

        {/* Vehicle Card */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-lg">Vehicle</h3>
            <Dialog open={editVehicleOpen} onOpenChange={setEditVehicleOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Edit2 className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Select Vehicle</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 pt-4">
                  {vehicles.map((vehicle) => (
                    <button
                      key={vehicle.id}
                      onClick={() => {
                        setSelectedVehicle(vehicle);
                        setEditVehicleOpen(false);
                      }}
                      className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-accent transition-colors text-left"
                    >
                      <Car className="h-5 w-5 text-muted-foreground" />
                      <div className="flex-1">
                        <div className="font-medium">
                          {vehicle.color} {vehicle.year} {vehicle.make} {vehicle.model}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          License: {vehicle.license_plate}
                        </div>
                      </div>
                      {selectedVehicle?.id === vehicle.id && (
                        <Check className="h-5 w-5 text-primary" />
                      )}
                    </button>
                  ))}
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => navigate('/add-vehicle')}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add New Vehicle
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          {selectedVehicle ? (
            <div className="flex items-center gap-3">
              <Car className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="font-medium">
                  {selectedVehicle.color} {selectedVehicle.year} {selectedVehicle.make} {selectedVehicle.model}
                </div>
                <div className="text-sm text-muted-foreground">
                  License: {selectedVehicle.license_plate}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-muted-foreground">
              <Car className="h-5 w-5" />
              <span>No vehicle selected</span>
            </div>
          )}
        </Card>

        {/* Payment Method Card */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-lg">Payment Method</h3>
            <Button variant="ghost" size="icon">
              <Edit2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <CreditCard className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1">
              <div className="font-medium">Visa •••• 4242</div>
              <div className="text-sm text-muted-foreground">Expires 12/26</div>
            </div>
            <div className="flex items-center gap-1 text-xs bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 px-2 py-1 rounded">
              <Check className="h-3 w-3" />
              Verified
            </div>
          </div>
        </Card>


        {/* Price Breakdown Card */}
        {pricing && (
          <Card className="p-4">
            <h3 className="font-bold text-lg mb-4">Price Breakdown</h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  ${spot.hourly_rate}/hr × {pricing.hours} hours
                </span>
                <span className="font-medium">${pricing.subtotal}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Service fee</span>
                <span className="font-medium">${pricing.platformFee}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-lg">
                <span className="font-bold">Total</span>
                <span className="font-bold">${pricing.total}</span>
              </div>
            </div>
          </Card>
        )}

        {/* Book Now Button */}
        <div className="space-y-2 pb-6">
          <Button
            className="w-full h-14 text-lg"
            size="lg"
            onClick={handleBooking}
            disabled={!startDateTime || !endDateTime || !pricing || !selectedVehicle || bookingLoading}
          >
            {bookingLoading ? 'Processing...' : `Book Now • $${pricing?.total || '0.00'}`}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            You won't be charged until your booking is confirmed
          </p>
        </div>
      </div>
    </div>
  );
};

export default Booking;
