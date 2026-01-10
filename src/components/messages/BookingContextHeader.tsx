import { useState } from 'react';
import { MapPin, Calendar, ExternalLink, ChevronUp, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format, isPast, isFuture, isWithinInterval } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { BookingContext } from '@/contexts/MessagesContext';
import { getStreetAddress } from '@/lib/addressUtils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface BookingContextHeaderProps {
  bookings: BookingContext[];
  selectedBookingId: string | null;
  onSelectBooking: (bookingId: string) => void;
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

const BookingContextHeader = ({ 
  bookings, 
  selectedBookingId, 
  onSelectBooking, 
  partnerName, 
  partnerRole 
}: BookingContextHeaderProps) => {
  const navigate = useNavigate();
  const [isCollapsed, setIsCollapsed] = useState(false);
  
  // Find the selected booking or default to the first one
  const selectedBooking = bookings.find(b => b.id === selectedBookingId) || bookings[0];
  
  if (!selectedBooking) return null;
  
  const status = getBookingStatus(selectedBooking);
  const hasMultipleBookings = bookings.length > 1;
  
  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return format(date, 'MMM d, h:mm a');
  };
  
  const formatBookingLabel = (booking: BookingContext) => {
    const date = format(new Date(booking.start_at), 'MMM d');
    const bookingStatus = getBookingStatus(booking);
    return `${date} - ${getStreetAddress(booking.spot_address)} (${bookingStatus.label})`;
  };
  
  const handleViewBooking = () => {
    navigate(`/booking/${selectedBooking.id}`);
  };
  
  return (
    <div className="bg-muted/50 border-b">
      {/* Collapsible header bar */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full px-4 py-2 flex items-center justify-between hover:bg-muted/70 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 text-primary" />
          <span className="truncate max-w-[200px] sm:max-w-none">
            {getStreetAddress(selectedBooking.spot_address)}
          </span>
          <Badge variant={status.variant} className="text-xs">
            {status.label}
          </Badge>
          {hasMultipleBookings && (
            <Badge variant="outline" className="text-xs">
              +{bookings.length - 1} more
            </Badge>
          )}
        </div>
        {isCollapsed ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      
      {/* Expandable details */}
      {!isCollapsed && (
        <div className="px-4 pb-3 space-y-3">
          {/* Booking selector for multiple bookings */}
          {hasMultipleBookings && (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Select Reservation:</label>
              <Select value={selectedBooking.id} onValueChange={onSelectBooking}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {bookings.map((booking) => {
                    const bookingStatus = getBookingStatus(booking);
                    return (
                      <SelectItem key={booking.id} value={booking.id}>
                        <div className="flex items-center gap-2">
                          <span>{format(new Date(booking.start_at), 'MMM d')}</span>
                          <span className="text-muted-foreground">-</span>
                          <span className="truncate max-w-[150px]">
                            {getStreetAddress(booking.spot_address)}
                          </span>
                          <Badge variant={bookingStatus.variant} className="text-xs ml-1">
                            {bookingStatus.label}
                          </Badge>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}
          
          {/* Spot Title & Address */}
          <div className="flex items-start gap-2">
            <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">{selectedBooking.spot_title}</p>
              <p className="text-xs text-muted-foreground truncate">
                {getStreetAddress(selectedBooking.spot_address)}
              </p>
            </div>
          </div>
          
          {/* Date/Time */}
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span>{formatDateTime(selectedBooking.start_at)}</span>
              <span>→</span>
              <span>{formatDateTime(selectedBooking.end_at)}</span>
            </div>
          </div>
          
          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            {/* Partner role label */}
            {partnerRole && (
              <p className="text-xs text-muted-foreground">
                Messaging with <span className="font-medium">{partnerName}</span>
                {partnerRole === 'host' ? ' (Host)' : ' (Driver)'}
              </p>
            )}
            
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-7 text-xs px-2 ml-auto"
              onClick={handleViewBooking}
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              View Booking
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BookingContextHeader;
