import React, { useState } from 'react';
import { Calendar, Clock, CreditCard, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

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
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [startTime, setStartTime] = useState<string>('09:00');
  const [endTime, setEndTime] = useState<string>('17:00');
  const [loading, setLoading] = useState(false);

  // Generate time options (24-hour format)
  const timeOptions = Array.from({ length: 24 }, (_, i) => {
    const hour = i.toString().padStart(2, '0');
    return `${hour}:00`;
  });

  const calculateTotal = () => {
    if (!startDate || !endDate) return null;

    const start = new Date(`${format(startDate, 'yyyy-MM-dd')}T${startTime}`);
    const end = new Date(`${format(endDate, 'yyyy-MM-dd')}T${endTime}`);
    
    const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    
    if (hours <= 0) return null;

    const subtotal = hours * spot.hourlyRate;
    const platformFee = subtotal * 0.15; // 15% platform fee
    const total = subtotal + platformFee;

    return {
      hours: hours.toFixed(1),
      subtotal: subtotal.toFixed(2),
      platformFee: platformFee.toFixed(2),
      total: total.toFixed(2),
    };
  };

  const handleBooking = async () => {
    if (!startDate || !endDate) {
      toast({
        title: "Missing dates",
        description: "Please select start and end dates",
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

      const startAt = new Date(`${format(startDate, 'yyyy-MM-dd')}T${startTime}`);
      const endAt = new Date(`${format(endDate, 'yyyy-MM-dd')}T${endTime}`);

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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Book {spot.title}</DialogTitle>
          <p className="text-sm text-muted-foreground">{spot.address}</p>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Date Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <CalendarComponent
                mode="single"
                selected={startDate}
                onSelect={setStartDate}
                disabled={(date) => date < new Date()}
                className="rounded-md border"
              />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <CalendarComponent
                mode="single"
                selected={endDate}
                onSelect={setEndDate}
                disabled={(date) => date < new Date() || (startDate && date < startDate)}
                className="rounded-md border"
              />
            </div>
          </div>

          {/* Time Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Time</Label>
              <Select value={startTime} onValueChange={setStartTime}>
                <SelectTrigger>
                  <Clock className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timeOptions.map((time) => (
                    <SelectItem key={time} value={time}>
                      {time}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>End Time</Label>
              <Select value={endTime} onValueChange={setEndTime}>
                <SelectTrigger>
                  <Clock className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timeOptions.map((time) => (
                    <SelectItem key={time} value={time}>
                      {time}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Pricing Breakdown */}
          {pricing && (
            <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
              <h3 className="font-semibold">Pricing Details</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    ${spot.hourlyRate}/hr × {pricing.hours} hours
                  </span>
                  <span className="font-medium">${pricing.subtotal}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Platform fee (15%)</span>
                  <span className="font-medium">${pricing.platformFee}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-base">
                  <span className="font-semibold">Total</span>
                  <span className="font-bold text-primary">${pricing.total}</span>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleBooking}
              disabled={!startDate || !endDate || !pricing || loading}
            >
              <CreditCard className="h-4 w-4 mr-2" />
              {loading ? 'Processing...' : 'Confirm Booking'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BookingModal;