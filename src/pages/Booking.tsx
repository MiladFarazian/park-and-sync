import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, Clock, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { differenceInHours } from 'date-fns';

const Booking = () => {
  const { spotId } = useParams<{ spotId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [spot, setSpot] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [startDateTime, setStartDateTime] = useState<string>('');
  const [endDateTime, setEndDateTime] = useState<string>('');

  useEffect(() => {
    const fetchSpot = async () => {
      if (!spotId) return;
      
      const { data, error } = await supabase
        .from('spots')
        .select('*')
        .eq('id', spotId)
        .single();

      if (error) {
        toast({
          title: "Error",
          description: "Failed to load parking spot",
          variant: "destructive",
        });
        navigate('/');
        return;
      }

      setSpot(data);
      setLoading(false);
    };

    fetchSpot();
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <Button
            variant="ghost"
            onClick={() => navigate(`/spot/${spotId}`)}
            className="mb-2"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to spot
          </Button>
          <h1 className="text-2xl font-bold">Book Parking Spot</h1>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="grid md:grid-cols-2 gap-8">
          {/* Spot Details */}
          <div className="space-y-4">
            <div className="bg-card border rounded-lg p-6">
              <h2 className="text-xl font-bold mb-4">{spot.title}</h2>
              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <span className="text-muted-foreground">{spot.address}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Hourly Rate</span>
                  <span className="font-semibold">${spot.hourly_rate}/hr</span>
                </div>
              </div>
            </div>
          </div>

          {/* Booking Form */}
          <div className="space-y-6">
            <div className="bg-card border rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">Select Time</h3>
              
              <div className="space-y-4">
                {/* Start Date & Time */}
                <div className="space-y-2">
                  <Label htmlFor="start" className="text-base font-semibold flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Start
                  </Label>
                  <Input
                    id="start"
                    type="datetime-local"
                    value={startDateTime}
                    onChange={(e) => setStartDateTime(e.target.value)}
                    min={new Date().toISOString().slice(0, 16)}
                    className="text-base"
                  />
                </div>

                {/* End Date & Time */}
                <div className="space-y-2">
                  <Label htmlFor="end" className="text-base font-semibold flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    End
                  </Label>
                  <Input
                    id="end"
                    type="datetime-local"
                    value={endDateTime}
                    onChange={(e) => setEndDateTime(e.target.value)}
                    min={startDateTime || new Date().toISOString().slice(0, 16)}
                    className="text-base"
                  />
                </div>
              </div>
            </div>

            {/* Pricing Breakdown */}
            {pricing && (
              <div className="bg-card border rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4">Pricing Summary</h3>
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
                    <span className="font-bold text-primary">${pricing.total}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-3">
              <Button
                className="w-full"
                size="lg"
                onClick={handleBooking}
                disabled={!startDateTime || !endDateTime || !pricing || bookingLoading}
              >
                {bookingLoading ? 'Processing...' : `Confirm & Pay $${pricing?.total || '0.00'}`}
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate(`/spot/${spotId}`)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Booking;
