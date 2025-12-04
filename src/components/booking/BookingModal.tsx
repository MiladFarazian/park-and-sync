import React, { useState, useEffect } from 'react';
import { Calendar, Clock, CreditCard, X, ChevronRight, AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { format, addHours, differenceInHours } from 'date-fns';
import { useMode } from '@/contexts/ModeContext';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface BookingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spot: {
    id: string;
    title: string;
    hourlyRate: number;
    dailyRate?: number;
    address: string;
    host_id?: string;
  };
}

const BookingModal = ({ open, onOpenChange, spot }: BookingModalProps) => {
  const { toast } = useToast();
  const { mode } = useMode();
  const today = new Date().toISOString().split('T')[0];
  const [startDateTime, setStartDateTime] = useState<string>('');
  const [endDateTime, setEndDateTime] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [isOwnSpot, setIsOwnSpot] = useState(false);

  useEffect(() => {
    const checkOwnership = async () => {
      if (open) {
        const { data: { user } } = await supabase.auth.getUser();
        // Check both spot.host_id and fetch from database as backup
        if (spot.host_id) {
          setIsOwnSpot(user?.id === spot.host_id);
        } else {
          // Fallback: fetch host_id from database
          const { data: spotData } = await supabase
            .from('spots')
            .select('host_id')
            .eq('id', spot.id)
            .single();
          setIsOwnSpot(user?.id === spotData?.host_id);
        }
      }
    };
    checkOwnership();
  }, [open, spot.id, spot.host_id]);

  const calculateTotal = () => {
    if (!startDateTime || !endDateTime) {
      console.log('Missing dates:', { startDateTime, endDateTime });
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

    const subtotal = hours * spot.hourlyRate;
    const platformFee = subtotal * 0.15; // 15% platform fee
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
    if (mode === 'host') {
      toast({
        title: "Switch to Driver Mode",
        description: "Please switch to Driver Mode to book parking spots",
        variant: "destructive",
      });
      return;
    }

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

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast({
          title: "Authentication required",
          description: "Please sign in to book this spot",
          variant: "destructive",
        });
        return;
      }

      // Check for self-booking
      if (user.id === spot.host_id) {
        toast({
          title: "Cannot book own spot",
          description: "You're the host of this spot",
          variant: "destructive",
        });
        return;
      }

      const startAt = new Date(startDateTime);
      const endAt = new Date(endDateTime);

      // Create booking hold first
      const { data: holdData, error: holdError } = await supabase.functions.invoke('create-booking-hold', {
        body: {
          spot_id: spot.id,
          start_at: startAt.toISOString(),
          end_at: endAt.toISOString(),
        },
      });

      if (holdError) throw holdError;

      // Create the booking
      const { data: bookingData, error: bookingError } = await supabase.functions.invoke('create-booking', {
        body: {
          spot_id: spot.id,
          start_at: startAt.toISOString(),
          end_at: endAt.toISOString(),
          total_amount: parseFloat(pricing.total),
          idempotency_key: Date.now().toString(),
        },
      });

      if (bookingError) throw bookingError;

      // Redirect to Stripe Checkout
      if (bookingData?.checkout_url) {
        window.location.href = bookingData.checkout_url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (error) {
      console.error('Booking error:', error);
      toast({
        title: "Booking failed",
        description: error instanceof Error ? error.message : "Failed to create booking",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const pricing = calculateTotal();
  
  console.log('Current state:', { startDateTime, endDateTime, pricing });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Book Parking</DialogTitle>
          <p className="text-sm text-muted-foreground">{spot.address}</p>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Self-booking warning */}
          {isOwnSpot && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                You're the host of this spot. You cannot book your own listing.
              </AlertDescription>
            </Alert>
          )}

          {/* Mode warning */}
          {mode === 'host' && !isOwnSpot && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Switch to Driver Mode to book this spot.
              </AlertDescription>
            </Alert>
          )}

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

          {/* Pricing Breakdown */}
          {pricing && (
            <>
              <Separator />
              <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                <h3 className="font-semibold">Pricing Summary</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      ${spot.hourlyRate}/hr × {pricing.hours} hours
                    </span>
                    <span className="font-medium">${pricing.subtotal}</span>
                  </div>
                  <div className="flex justify-between">
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
            </>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col gap-3 pt-2">
            <Button
              className="w-full"
              size="lg"
              onClick={handleBooking}
              disabled={!startDateTime || !endDateTime || !pricing || loading || isOwnSpot || mode === 'host'}
            >
              {loading ? (
                'Processing...'
              ) : (
                <>
                  Confirm & Pay ${pricing?.total || '0.00'}
                  <ChevronRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BookingModal;