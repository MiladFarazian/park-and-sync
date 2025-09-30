import React, { useState } from 'react';
import { Calendar, Clock, CreditCard, X, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { format, addHours, differenceInHours } from 'date-fns';

interface BookingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spot: {
    id: string;
    title: string;
    hourlyRate: number;
    dailyRate?: number;
    address: string;
  };
}

const BookingModal = ({ open, onOpenChange, spot }: BookingModalProps) => {
  const { toast } = useToast();
  const today = new Date().toISOString().split('T')[0];
  const [startDateTime, setStartDateTime] = useState<string>('');
  const [endDateTime, setEndDateTime] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const calculateTotal = () => {
    if (!startDateTime || !endDateTime) return null;

    const start = new Date(startDateTime);
    const end = new Date(endDateTime);
    
    const hours = differenceInHours(end, start);
    
    if (hours <= 0) return null;

    const subtotal = hours * spot.hourlyRate;
    const platformFee = subtotal * 0.15; // 15% platform fee
    const total = subtotal + platformFee;

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
        },
      });

      if (bookingError) throw bookingError;

      toast({
        title: "Booking created!",
        description: "Your booking has been confirmed",
      });

      onOpenChange(false);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Book Parking</DialogTitle>
          <p className="text-sm text-muted-foreground">{spot.title}</p>
        </DialogHeader>

        <div className="space-y-4 py-4">
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
              disabled={!startDateTime || !endDateTime || !pricing || loading}
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