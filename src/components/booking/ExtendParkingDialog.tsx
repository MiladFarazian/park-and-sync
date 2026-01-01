import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, ChevronLeft, Clock, DollarSign, CreditCard, ChevronDown, Check } from 'lucide-react';
import { format, addDays, startOfDay, setHours, setMinutes, differenceInMinutes } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { loadStripe } from '@stripe/stripe-js';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

const QUICK_EXTEND_OPTIONS = [
  { label: '30 min', hours: 0.5 },
  { label: '1 hour', hours: 1 },
  { label: '2 hours', hours: 2 },
];

interface ExtendParkingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: any;
  onExtendSuccess: () => void;
}

export const ExtendParkingDialog = ({ 
  open, 
  onOpenChange, 
  booking, 
  onExtendSuccess 
}: ExtendParkingDialogProps) => {
  const navigate = useNavigate();
  const [view, setView] = useState<'quick' | 'custom'>('quick');
  const [extending, setExtending] = useState(false);
  const [selectedExtendHours, setSelectedExtendHours] = useState<number | null>(null);
  
  // Payment method state
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null);
  const [loadingPaymentMethods, setLoadingPaymentMethods] = useState(false);
  
  // Custom time picker state
  const now = new Date();
  const bookingEndTime = booking ? new Date(booking.end_at) : now;
  
  const generateDays = () => {
    const days = [];
    const baseDate = bookingEndTime > now ? bookingEndTime : now;
    for (let i = 0; i < 7; i++) {
      const date = addDays(startOfDay(baseDate), i);
      const label = format(date, 'yyyy-MM-dd') === format(now, 'yyyy-MM-dd') 
        ? 'Today' 
        : format(date, 'yyyy-MM-dd') === format(addDays(now, 1), 'yyyy-MM-dd')
        ? 'Tomorrow' 
        : format(date, 'EEE MMM d');
      days.push({ date, label });
    }
    return days;
  };

  const days = generateDays();
  const hours = Array.from({ length: 12 }, (_, i) => i + 1);
  const minutes = Array.from({ length: 60 }, (_, i) => i); // All 60 minutes
  const periods = ['AM', 'PM'];

  const getInitialValues = () => {
    const baseTime = bookingEndTime;
    const dayIndex = days.findIndex(d => 
      format(d.date, 'yyyy-MM-dd') === format(baseTime, 'yyyy-MM-dd')
    );
    
    let hour = baseTime.getHours();
    const period = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 || 12;
    const minute = baseTime.getMinutes(); // Use exact minute, not rounded
    
    return {
      dayIndex: dayIndex >= 0 ? dayIndex : 0,
      hour,
      minute,
      period
    };
  };

  const initial = getInitialValues();
  const [selectedDay, setSelectedDay] = useState(initial.dayIndex);
  const [selectedHour, setSelectedHour] = useState(initial.hour);
  const [selectedMinute, setSelectedMinute] = useState(initial.minute);
  const [selectedPeriod, setSelectedPeriod] = useState(initial.period);
  const [error, setError] = useState('');

  const dayRef = useRef<HTMLDivElement>(null);
  const hourRef = useRef<HTMLDivElement>(null);
  const minuteRef = useRef<HTMLDivElement>(null);
  const periodRef = useRef<HTMLDivElement>(null);

  // Fetch payment methods when dialog opens
  const fetchPaymentMethods = async () => {
    setLoadingPaymentMethods(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-payment-methods');
      if (error) throw error;
      
      const methods = data.paymentMethods || [];
      setPaymentMethods(methods);
      
      // Select first method by default
      if (methods.length > 0 && !selectedPaymentMethod) {
        setSelectedPaymentMethod(methods[0]);
      }
    } catch (err) {
      console.error('Error fetching payment methods:', err);
    } finally {
      setLoadingPaymentMethods(false);
    }
  };

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setView('quick');
      setError('');
      const init = getInitialValues();
      setSelectedDay(init.dayIndex);
      setSelectedHour(init.hour);
      setSelectedMinute(init.minute);
      setSelectedPeriod(init.period);
      fetchPaymentMethods();
    }
  }, [open, booking]);

  // Scroll to selected items when custom view opens
  useEffect(() => {
    if (view === 'custom') {
      setTimeout(() => {
        scrollToIndex(dayRef, selectedDay);
        scrollToIndex(hourRef, hours.indexOf(selectedHour));
        scrollToIndex(minuteRef, minutes.indexOf(selectedMinute));
        scrollToIndex(periodRef, periods.indexOf(selectedPeriod));
      }, 100);
    }
  }, [view]);

  const scrollToIndex = (ref: React.RefObject<HTMLDivElement>, index: number) => {
    if (ref.current) {
      const itemHeight = 48;
      ref.current.scrollTop = index * itemHeight;
    }
  };

  const createScrollHandler = (
    ref: React.RefObject<HTMLDivElement>,
    items: any[],
    setter: (value: any) => void
  ) => {
    let scrollTimeout: NodeJS.Timeout;
    let lastIndex = -1;
    
    return () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        if (!ref.current) return;
        
        const itemHeight = 48;
        const scrollTop = ref.current.scrollTop;
        const index = Math.round(scrollTop / itemHeight);
        const clampedIndex = Math.max(0, Math.min(items.length - 1, index));
        
        if (clampedIndex !== lastIndex && 'vibrate' in navigator) {
          navigator.vibrate(10);
          lastIndex = clampedIndex;
        }
        
        ref.current.scrollTo({
          top: clampedIndex * itemHeight,
          behavior: 'smooth'
        });
        
        setter(items[clampedIndex]);
      }, 150);
    };
  };

  const getSelectedDate = () => {
    const baseDate = days[selectedDay]?.date || now;
    let hour = selectedHour;
    if (selectedPeriod === 'PM' && hour !== 12) hour += 12;
    if (selectedPeriod === 'AM' && hour === 12) hour = 0;
    
    return setMinutes(setHours(baseDate, hour), selectedMinute);
  };

  const getExtensionCost = (hrs: number) => {
    if (!booking) return 0;
    // Simple proportional pricing: hourly_rate * hours
    return Math.round((booking.hourly_rate || 5) * hrs * 100) / 100;
  };

  const calculateCustomExtensionCost = () => {
    if (!booking) return { hours: 0, cost: 0 };
    const selectedDate = getSelectedDate();
    const extensionMinutes = differenceInMinutes(selectedDate, bookingEndTime);
    const hrs = extensionMinutes / 60;
    
    if (hrs <= 0) return { hours: 0, cost: 0 };
    
    // Simple proportional pricing: hourly_rate * hours
    const cost = Math.round((booking.hourly_rate || 5) * hrs * 100) / 100;
    return { hours: hrs, cost };
  };

  const validateCustomTime = () => {
    const selectedDate = getSelectedDate();
    const extensionMinutes = differenceInMinutes(selectedDate, bookingEndTime);
    
    if (extensionMinutes < 15) {
      setError('Extension must be at least 15 minutes');
      return false;
    }
    
    if (extensionMinutes > 1440) {
      setError('Extension cannot exceed 24 hours');
      return false;
    }
    
    setError('');
    return true;
  };

  const getCardBrandIcon = (brand: string) => {
    const brandLower = brand.toLowerCase();
    if (brandLower === 'visa') return 'Visa';
    if (brandLower === 'mastercard') return 'MC';
    if (brandLower === 'amex') return 'Amex';
    if (brandLower === 'discover') return 'Disc';
    return brand.charAt(0).toUpperCase() + brand.slice(1);
  };

  const handleQuickExtend = async (hrs: number) => {
    if (!booking) return;
    
    // Check if user has a payment method
    if (paymentMethods.length === 0) {
      toast.error('No payment method on file. Please add a card first.');
      onOpenChange(false);
      navigate('/payment-methods?add=1&returnTo=' + encodeURIComponent(window.location.pathname));
      return;
    }
    
    setSelectedExtendHours(hrs);
    setExtending(true);
    
    try {
      const { data: keyData, error: keyError } = await supabase.functions.invoke('get-stripe-publishable-key');
      if (keyError) throw keyError;

      const stripe = await loadStripe(keyData.publishableKey);
      if (!stripe) throw new Error('Failed to load Stripe');

      const { data, error } = await supabase.functions.invoke('extend-booking', {
        body: {
          bookingId: booking.id,
          extensionHours: hrs,
          paymentMethodId: selectedPaymentMethod?.id
        }
      });

      if (error) throw error;

      if (data.requiresAction && data.clientSecret) {
        const { error: confirmError } = await stripe.confirmCardPayment(data.clientSecret);
        if (confirmError) throw confirmError;

        const { error: finalizeError } = await supabase.functions.invoke('extend-booking', {
          body: {
            bookingId: booking.id,
            extensionHours: hrs,
            paymentIntentId: data.paymentIntentId,
            finalize: true
          }
        });

        if (finalizeError) throw finalizeError;
      }

      toast.success(`Parking extended by ${hrs >= 1 ? `${hrs} hour${hrs > 1 ? 's' : ''}` : '30 minutes'}!`);
      onOpenChange(false);
      onExtendSuccess();
    } catch (err: any) {
      console.error('Error extending booking:', err);
      toast.error(err.message || 'Failed to extend booking');
    } finally {
      setExtending(false);
      setSelectedExtendHours(null);
    }
  };

  const handleCustomExtend = async () => {
    if (!booking || !validateCustomTime()) return;
    
    // Check if user has a payment method
    if (paymentMethods.length === 0) {
      toast.error('No payment method on file. Please add a card first.');
      onOpenChange(false);
      navigate('/payment-methods?add=1&returnTo=' + encodeURIComponent(window.location.pathname));
      return;
    }
    
    const selectedDate = getSelectedDate();
    const extensionMinutes = differenceInMinutes(selectedDate, bookingEndTime);
    const hrs = extensionMinutes / 60;
    
    setExtending(true);
    
    try {
      const { data: keyData, error: keyError } = await supabase.functions.invoke('get-stripe-publishable-key');
      if (keyError) throw keyError;

      const stripe = await loadStripe(keyData.publishableKey);
      if (!stripe) throw new Error('Failed to load Stripe');

      const { data, error } = await supabase.functions.invoke('extend-booking', {
        body: {
          bookingId: booking.id,
          extensionHours: hrs,
          paymentMethodId: selectedPaymentMethod?.id
        }
      });

      if (error) throw error;

      if (data.requiresAction && data.clientSecret) {
        const { error: confirmError } = await stripe.confirmCardPayment(data.clientSecret);
        if (confirmError) throw confirmError;

        const { error: finalizeError } = await supabase.functions.invoke('extend-booking', {
          body: {
            bookingId: booking.id,
            extensionHours: hrs,
            paymentIntentId: data.paymentIntentId,
            finalize: true
          }
        });

        if (finalizeError) throw finalizeError;
      }

      const hoursText = hrs >= 1 ? `${hrs.toFixed(1)} hour${hrs > 1 ? 's' : ''}` : `${Math.round(hrs * 60)} minutes`;
      toast.success(`Parking extended by ${hoursText}!`);
      onOpenChange(false);
      onExtendSuccess();
    } catch (err: any) {
      console.error('Error extending booking:', err);
      toast.error(err.message || 'Failed to extend booking');
    } finally {
      setExtending(false);
    }
  };

  const customCost = calculateCustomExtensionCost();

  return (
    <Dialog open={open} onOpenChange={(o) => {
      if (!extending) onOpenChange(o);
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {view === 'custom' && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 -ml-2"
                onClick={() => setView('quick')}
                disabled={extending}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            <div>
              <DialogTitle>
                {view === 'quick' ? 'Extend Your Parking' : 'Choose End Time'}
              </DialogTitle>
              <DialogDescription>
                {booking?.spots?.title || 'Parking Spot'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        
        {view === 'quick' ? (
          <div className="space-y-3 py-4">
            {/* Payment Method Selector */}
            {loadingPaymentMethods ? (
              <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Loading payment methods...</span>
              </div>
            ) : paymentMethods.length === 0 ? (
              <div 
                className="flex items-center gap-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg cursor-pointer hover:bg-destructive/15 transition-colors"
                onClick={() => {
                  onOpenChange(false);
                  navigate('/payment-methods?add=1&returnTo=' + encodeURIComponent(window.location.pathname));
                }}
              >
                <CreditCard className="h-5 w-5 text-destructive" />
                <div className="flex-1">
                  <p className="text-sm font-medium">No payment method</p>
                  <p className="text-xs text-muted-foreground">Tap to add a card</p>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </div>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="w-full flex items-center gap-3 p-3 bg-muted/50 rounded-lg hover:bg-muted/70 transition-colors text-left">
                    <CreditCard className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground">Pay with</p>
                      {selectedPaymentMethod && (
                        <p className="text-sm font-medium truncate">
                          {getCardBrandIcon(selectedPaymentMethod.brand)} •••• {selectedPaymentMethod.last4}
                        </p>
                      )}
                    </div>
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[calc(100vw-3rem)] max-w-[384px]">
                  {paymentMethods.map((pm) => (
                    <DropdownMenuItem
                      key={pm.id}
                      onClick={() => setSelectedPaymentMethod(pm)}
                      className="flex items-center gap-3 py-3"
                    >
                      <CreditCard className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1">
                        {getCardBrandIcon(pm.brand)} •••• {pm.last4}
                      </span>
                      {selectedPaymentMethod?.id === pm.id && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem
                    onClick={() => {
                      onOpenChange(false);
                      navigate('/payment-methods?add=1&returnTo=' + encodeURIComponent(window.location.pathname));
                    }}
                    className="flex items-center gap-3 py-3 text-primary"
                  >
                    <span className="flex-1">Add new card</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <p className="text-sm text-muted-foreground">
              Select how long you'd like to extend:
            </p>
            
            {QUICK_EXTEND_OPTIONS.map((option) => (
              <Button
                key={option.hours}
                variant="outline"
                className="w-full justify-between h-auto py-3 px-4 hover:bg-primary/5 hover:border-primary/30"
                onClick={() => handleQuickExtend(option.hours)}
                disabled={extending || paymentMethods.length === 0}
              >
                <span className="font-medium">{option.label}</span>
                <span className="flex items-center gap-2">
                  {extending && selectedExtendHours === option.hours ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <span className="text-primary font-semibold">
                      +${getExtensionCost(option.hours).toFixed(2)}
                    </span>
                  )}
                </span>
              </Button>
            ))}
            
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">or</span>
              </div>
            </div>
            
            <Button
              variant="ghost"
              className="w-full text-muted-foreground hover:text-foreground"
              onClick={() => setView('custom')}
              disabled={extending}
            >
              Choose custom time
            </Button>
          </div>
        ) : (
          <div className="py-4 space-y-4">
            {/* Current end time info */}
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Current end time</p>
                <p className="font-medium">{format(bookingEndTime, 'EEE, MMM d • h:mm a')}</p>
              </div>
            </div>

            {/* Time Picker */}
            <div className="relative bg-muted/30 rounded-xl p-3">
              {/* Selection highlight */}
              <div className="absolute inset-x-3 top-1/2 -translate-y-1/2 h-12 bg-background rounded-lg pointer-events-none border border-primary/20 shadow-sm" />
              
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-1 relative">
                {/* Day Column */}
                <div className="overflow-hidden">
                  <div 
                    ref={dayRef}
                    className="overflow-y-scroll scrollbar-hide h-[144px] snap-y snap-mandatory scroll-smooth"
                    onScroll={createScrollHandler(dayRef, days.map((_, i) => i), setSelectedDay)}
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                  >
                    <div className="h-12" />
                    {days.map((day, index) => (
                      <div
                        key={index}
                        className="h-12 flex items-center justify-center snap-center cursor-pointer transition-all px-1"
                        style={{
                          opacity: selectedDay === index ? 1 : 0.3,
                          transform: selectedDay === index ? 'scale(1)' : 'scale(0.9)'
                        }}
                        onClick={() => {
                          setSelectedDay(index);
                          scrollToIndex(dayRef, index);
                        }}
                      >
                        <span className="text-sm font-medium whitespace-nowrap truncate">
                          {day.label}
                        </span>
                      </div>
                    ))}
                    <div className="h-12" />
                  </div>
                </div>

                {/* Hour Column */}
                <div className="overflow-hidden">
                  <div 
                    ref={hourRef}
                    className="overflow-y-scroll scrollbar-hide h-[144px] snap-y snap-mandatory scroll-smooth"
                    onScroll={createScrollHandler(hourRef, hours, setSelectedHour)}
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                  >
                    <div className="h-12" />
                    {hours.map((hour) => (
                      <div
                        key={hour}
                        className="h-12 flex items-center justify-center snap-center cursor-pointer transition-all"
                        style={{
                          opacity: selectedHour === hour ? 1 : 0.3,
                          transform: selectedHour === hour ? 'scale(1)' : 'scale(0.9)'
                        }}
                        onClick={() => {
                          setSelectedHour(hour);
                          scrollToIndex(hourRef, hours.indexOf(hour));
                        }}
                      >
                        <span className="text-xl font-bold">{hour}</span>
                      </div>
                    ))}
                    <div className="h-12" />
                  </div>
                </div>

                {/* Minute Column */}
                <div className="overflow-hidden">
                  <div 
                    ref={minuteRef}
                    className="overflow-y-scroll scrollbar-hide h-[144px] snap-y snap-mandatory scroll-smooth"
                    onScroll={createScrollHandler(minuteRef, minutes, setSelectedMinute)}
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                  >
                    <div className="h-12" />
                    {minutes.map((minute) => (
                      <div
                        key={minute}
                        className="h-12 flex items-center justify-center snap-center cursor-pointer transition-all"
                        style={{
                          opacity: selectedMinute === minute ? 1 : 0.3,
                          transform: selectedMinute === minute ? 'scale(1)' : 'scale(0.9)'
                        }}
                        onClick={() => {
                          setSelectedMinute(minute);
                          scrollToIndex(minuteRef, minutes.indexOf(minute));
                        }}
                      >
                        <span className="text-xl font-bold">{minute.toString().padStart(2, '0')}</span>
                      </div>
                    ))}
                    <div className="h-12" />
                  </div>
                </div>

                {/* Period Column */}
                <div className="overflow-hidden">
                  <div 
                    ref={periodRef}
                    className="overflow-y-scroll scrollbar-hide h-[144px] snap-y snap-mandatory scroll-smooth"
                    onScroll={createScrollHandler(periodRef, periods, setSelectedPeriod)}
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                  >
                    <div className="h-12" />
                    {periods.map((period) => (
                      <div
                        key={period}
                        className="h-12 flex items-center justify-center snap-center cursor-pointer transition-all"
                        style={{
                          opacity: selectedPeriod === period ? 1 : 0.3,
                          transform: selectedPeriod === period ? 'scale(1)' : 'scale(0.9)'
                        }}
                        onClick={() => {
                          setSelectedPeriod(period);
                          scrollToIndex(periodRef, periods.indexOf(period));
                        }}
                      >
                        <span className="text-lg font-semibold">{period}</span>
                      </div>
                    ))}
                    <div className="h-12" />
                  </div>
                </div>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <p className="text-sm text-destructive text-center animate-fade-in">
                {error}
              </p>
            )}

            {/* Cost Summary */}
            {customCost.hours > 0 && (
              <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg border border-primary/20">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Extension cost</span>
                </div>
                <span className="text-lg font-bold text-primary">
                  +${customCost.cost.toFixed(2)}
                </span>
              </div>
            )}

            {/* Payment Method Display */}
            {selectedPaymentMethod && (
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    {getCardBrandIcon(selectedPaymentMethod.brand)} •••• {selectedPaymentMethod.last4}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-auto py-1 px-2"
                  onClick={() => setView('quick')}
                >
                  Change
                </Button>
              </div>
            )}

            {/* Confirm Button */}
            <Button 
              className="w-full"
              onClick={handleCustomExtend}
              disabled={extending || customCost.hours <= 0 || paymentMethods.length === 0}
            >
              {extending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Processing...
                </>
              ) : (
                `Extend Parking${customCost.hours > 0 ? ` • $${customCost.cost.toFixed(2)}` : ''}`
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
