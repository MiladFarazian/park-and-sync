import { MapPin, Calendar, Clock, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format, isPast, isFuture, isWithinInterval } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { BookingContext } from '@/contexts/MessagesContext';
import { getStreetAddress } from '@/lib/addressUtils';

interface BookingContextHeaderProps {
  booking: BookingContext;
  partnerName: string;
  partnerRole?: 'host' | 'driver';
}

const getBookingStatus = (booking: BookingContext): { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' } => {
  const now = new Date();
  const start = new Date(booking.start_at);
  const end = new Date(booking.end_at);
  
  if (booking.status === 'canceled' || booking.status === 'refunded') {
    return { label: 'Cancelled', variant: 'destructive' };
  }
  
  if (booking.status === 'completed' || isPast(end)) {
    return { label: 'Completed', variant: 'secondary' };
  }
  
  if (isWithinInterval(now, { start, end })) {
    return { label: 'Active', variant: 'default' };
  }
  
  if (isFuture(start)) {
    return { label: 'Upcoming', variant: 'outline' };
  }
  
  // Pending booking
  if (booking.status === 'pending') {
    return { label: 'Pending', variant: 'outline' };
  }
  
  return { label: booking.status, variant: 'secondary' };
};

const BookingContextHeader = ({ booking, partnerName, partnerRole }: BookingContextHeaderProps) => {
  const navigate = useNavigate();
  const status = getBookingStatus(booking);
  
  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return format(date, 'MMM d, h:mm a');
  };
  
  const handleViewBooking = () => {
    navigate(`/booking/${booking.id}`);
  };
  
  return (
    <div className="bg-muted/50 border-b px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-2">
          {/* Spot Title & Address */}
          <div className="flex items-start gap-2">
            <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">{booking.spot_title}</p>
              <p className="text-xs text-muted-foreground truncate">
                {getStreetAddress(booking.spot_address)}
              </p>
            </div>
          </div>
          
          {/* Date/Time */}
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span>{formatDateTime(booking.start_at)}</span>
              <span>→</span>
              <span>{formatDateTime(booking.end_at)}</span>
            </div>
          </div>
        </div>
        
        {/* Status Badge & View Button */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <Badge variant={status.variant} className="text-xs">
            {status.label}
          </Badge>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-7 text-xs px-2"
            onClick={handleViewBooking}
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            View
          </Button>
        </div>
      </div>
      
      {/* Partner role label */}
      {partnerRole && (
        <div className="mt-2 pt-2 border-t border-border/50">
          <p className="text-xs text-muted-foreground">
            Messaging with <span className="font-medium">{partnerName}</span>
            {partnerRole === 'host' ? ' (Host)' : ' (Driver)'}
          </p>
        </div>
      )}
    </div>
  );
};

export default BookingContextHeader;