import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarIcon, Clock, MapPin, Star, Edit2, CreditCard, Car, Plus, Check, AlertCircle, Loader2 } from 'lucide-react';
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { TimePicker } from '@/components/ui/time-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { differenceInHours, addHours, format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

const Booking = () => {
  const { spotId } = useParams<{ spotId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [spot, setSpot] = useState<any>(null);
  const [host, setHost] = useState<any>(null);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<any>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null);
  const [loading, setLoading] = useState(true);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [isOwnSpot, setIsOwnSpot] = useState(false);
  const [availabilityRules, setAvailabilityRules] = useState<any[]>([]);
  const [availabilityDisplay, setAvailabilityDisplay] = useState<string>('');
  const [serverAvailable, setServerAvailable] = useState<{ ok: boolean; reason?: string }>({ ok: true });
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  
  // Get times from URL params or use defaults (1 hour from now + 2 hours duration)
  const getInitialTimes = () => {
    const start = searchParams.get('start');
    const end = searchParams.get('end');
    
    if (start && end) {
      return {
        start: new Date(start),
        end: new Date(end)
      };
    }
    
    const defaultStart = addHours(new Date(), 1);
    const defaultEnd = addHours(defaultStart, 2);
    return { start: defaultStart, end: defaultEnd };
  };
  
  const initialTimes = getInitialTimes();
  const [startDateTime, setStartDateTime] = useState<Date>(initialTimes.start);
  const [endDateTime, setEndDateTime] = useState<Date>(initialTimes.end);

  // Ensure end time is always after start time
  const handleStartDateTimeChange = (date: Date) => {
    setStartDateTime(date);
    // If end time is before or equal to new start time, set it to 2 hours after
    if (endDateTime <= date) {
      setEndDateTime(new Date(date.getTime() + 2 * 60 * 60 * 1000));
    }
  };

  const handleEndDateTimeChange = (date: Date) => {
    // Only set if it's after start time
    if (date > startDateTime) {
      setEndDateTime(date);
    } else {
      toast({
        title: "Invalid time",
        description: "End time must be after start time",
        variant: "destructive",
      });
    }
  };
  
  const [editTimeOpen, setEditTimeOpen] = useState(false);
  const [editVehicleOpen, setEditVehicleOpen] = useState(false);
  const [editPaymentOpen, setEditPaymentOpen] = useState(false);

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

        // Fetch availability rules for the spot
        const { data: rulesData } = await supabase
          .from('availability_rules')
          .select('*')
          .eq('spot_id', spotId)
          .eq('is_available', true)
          .order('day_of_week');

        if (rulesData) {
          setAvailabilityRules(rulesData);
          // Format availability display with AM/PM
          const formatTimeToAMPM = (time: string) => {
            const [hours, minutes] = time.split(':').map(Number);
            const period = hours >= 12 ? 'PM' : 'AM';
            const displayHours = hours % 12 || 12;
            return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
          };

          if (rulesData.length === 0) {
            setAvailabilityDisplay('No schedule set');
          } else if (rulesData.length === 7) {
            const is247 = rulesData.every(r => r.start_time === '00:00:00' && r.end_time === '23:59:00');
            if (is247) {
              setAvailabilityDisplay('Available 24/7');
            } else {
              // Show time range in AM/PM format
              const times = [...new Set(rulesData.map(r => 
                `${formatTimeToAMPM(r.start_time)} - ${formatTimeToAMPM(r.end_time)}`
              ))];
              setAvailabilityDisplay(times.length === 1 ? times[0] : 'Varied hours');
            }
          } else {
            const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const availableDays = [...new Set(rulesData.map(r => r.day_of_week))].sort((a, b) => a - b);
            setAvailabilityDisplay(availableDays.map(d => DAYS[d]).join(', '));
          }
        }

        // Fetch user's vehicles and payment methods
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // Check if user is the host of this spot
          if (spotData.host_id === user.id) {
            setIsOwnSpot(true);
          }
          const { data: vehiclesData } = await supabase
            .from('vehicles')
            .select('*')
            .eq('user_id', user.id)
            .order('is_primary', { ascending: false });
          
          if (vehiclesData && vehiclesData.length > 0) {
            setVehicles(vehiclesData);
            setSelectedVehicle(vehiclesData[0]); // Select first vehicle by default
          }

          // Fetch payment methods
          const { data: paymentData } = await supabase.functions.invoke('get-payment-methods');
          if (paymentData?.paymentMethods && paymentData.paymentMethods.length > 0) {
            setPaymentMethods(paymentData.paymentMethods);
            setSelectedPaymentMethod(paymentData.paymentMethods[0]); // Select first payment method
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

  // Check availability only when dates change
  useEffect(() => {
    let cancelled = false;

    async function checkAvailability() {
      if (!spotId || !startDateTime || !endDateTime) {
        setServerAvailable({ ok: true });
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setCheckingAvailability(true);
      console.log('Checking spot availability...', { spotId, start: startDateTime.toISOString(), end: endDateTime.toISOString() });

      try {
        const { data, error } = await supabase.rpc('check_spot_availability', {
          p_spot_id: spotId,
          p_start_at: startDateTime.toISOString(),
          p_end_at: endDateTime.toISOString(),
          p_exclude_user_id: user.id
        });

        if (cancelled) return;

        if (error) {
          console.warn('Availability check error:', error);
          setServerAvailable({ ok: false, reason: 'Unable to verify availability right now' });
        } else {
          const isAvailable = !!data;
          console.log('Availability check result:', isAvailable);
          setServerAvailable({ 
            ok: isAvailable, 
            reason: isAvailable ? undefined : 'Another booking or hold conflicts with your selected time'
          });
        }
      } catch (err) {
        console.error('Availability check exception:', err);
        if (!cancelled) {
          setServerAvailable({ ok: false, reason: 'Error checking availability' });
        }
      } finally {
        if (!cancelled) {
          setCheckingAvailability(false);
        }
      }
    }

    // Check only when dates change
    checkAvailability();

    return () => {
      cancelled = true;
    };
  }, [spotId, startDateTime, endDateTime]);

  // Broadcast channel for instant conflict detection
  useEffect(() => {
    if (!spotId || !startDateTime || !endDateTime) return;

    const setupChannel = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      console.log('Setting up broadcast channel for spot:', spotId);
      const channel = supabase
        .channel(`spot:${spotId}`, { 
          config: { broadcast: { ack: false } } 
        })
        .on('broadcast', { event: 'hold_created' }, (payload) => {
          console.log('Received hold_created broadcast:', payload);
          const { userId, start_at, end_at } = payload.payload;
          
          // Ignore our own broadcasts
          if (userId === user.id) return;

          // Check if the broadcast overlaps with our selection
          const broadcastStart = new Date(start_at);
          const broadcastEnd = new Date(end_at);
          const hasOverlap = startDateTime < broadcastEnd && endDateTime > broadcastStart;

          if (hasOverlap) {
            console.log('Detected overlapping hold from another user');
            setServerAvailable({ 
              ok: false, 
              reason: 'Another user just reserved this time slot'
            });
          }
        })
        .on('broadcast', { event: 'booking_created' }, (payload) => {
          console.log('Received booking_created broadcast:', payload);
          const { userId, start_at, end_at } = payload.payload;
          
          // Ignore our own broadcasts
          if (userId === user.id) return;

          // Check if the broadcast overlaps with our selection
          const broadcastStart = new Date(start_at);
          const broadcastEnd = new Date(end_at);
          const hasOverlap = startDateTime < broadcastEnd && endDateTime > broadcastStart;

          if (hasOverlap) {
            console.log('Detected overlapping booking from another user');
            setServerAvailable({ 
              ok: false, 
              reason: 'Another user just booked this time slot'
            });
          }
        })
        .subscribe();

      channelRef.current = channel;
    };

    setupChannel();

    return () => {
      console.log('Cleaning up broadcast channel');
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [spotId, startDateTime, endDateTime]);

  const calculateTotal = () => {
    if (!startDateTime || !endDateTime || !spot) {
      console.log('Missing dates:', { startDateTime, endDateTime, spot });
      return null;
    }
    
    if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
      console.log('Invalid date objects');
      return null;
    }
    
    const hours = differenceInHours(endDateTime, startDateTime);
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

  const validateAvailability = (start: Date, end: Date): { valid: boolean; message?: string } => {
    if (availabilityRules.length === 0) {
      return { valid: false, message: "This spot has no availability schedule set" };
    }

    // Check each hour of the booking
    const current = new Date(start);
    while (current < end) {
      const dayOfWeek = current.getDay();
      const timeStr = current.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
      
      // Find rules for this day
      const dayRules = availabilityRules.filter(r => r.day_of_week === dayOfWeek);
      
      if (dayRules.length === 0) {
        const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return { 
          valid: false, 
          message: `This spot is not available on ${DAYS[dayOfWeek]}s` 
        };
      }

      // Check if time falls within any available window
      const isWithinWindow = dayRules.some(rule => {
        return timeStr >= rule.start_time.slice(0, 5) && timeStr <= rule.end_time.slice(0, 5);
      });

      if (!isWithinWindow) {
        const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const availableWindows = dayRules.map(r => 
          `${r.start_time.slice(0, 5)} - ${r.end_time.slice(0, 5)}`
        ).join(', ');
        return { 
          valid: false, 
          message: `Selected time on ${DAYS[dayOfWeek]} (${timeStr}) is outside available hours: ${availableWindows}` 
        };
      }

      // Move to next hour
      current.setHours(current.getHours() + 1);
    }

    return { valid: true };
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

    // Validate availability
    const availabilityCheck = validateAvailability(startDateTime, endDateTime);
    if (!availabilityCheck.valid) {
      toast({
        title: "Time not available",
        description: availabilityCheck.message,
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

      // Check for self-booking
      if (isOwnSpot || spot.host_id === user.id) {
        toast({
          title: "Cannot book own spot",
          description: "You're the host of this spot and cannot book it",
          variant: "destructive",
        });
        return;
      }

      const startAt = startDateTime;
      const endAt = endDateTime;

      // Create booking hold first
      const { data: holdData, error: holdError } = await supabase.functions.invoke('create-booking-hold', {
        body: {
          spot_id: spotId,
          start_at: startAt.toISOString(),
          end_at: endAt.toISOString(),
        },
      });

      if (holdError) throw holdError;

      // Broadcast hold creation for instant feedback to other users
      if (holdData?.hold_id && channelRef.current) {
        console.log('Broadcasting hold_created event');
        channelRef.current.send({
          type: 'broadcast',
          event: 'hold_created',
          payload: {
            spotId,
            userId: user.id,
            start_at: startAt.toISOString(),
            end_at: endAt.toISOString()
          }
        });
      }

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

      // Broadcast booking creation for instant feedback to other users
      if (channelRef.current) {
        console.log('Broadcasting booking_created event');
        channelRef.current.send({
          type: 'broadcast',
          event: 'booking_created',
          payload: {
            spotId,
            userId: user.id,
            start_at: startAt.toISOString(),
            end_at: endAt.toISOString()
          }
        });
      }

      toast({
        title: "Booking created!",
        description: "Your booking has been confirmed",
      });

      // Navigate to confirmation page with booking ID
      navigate(`/booking-confirmation/${bookingData.booking_id}`);
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

  // Check if selected times are within available hours - must be before early returns
  const isTimeValid = useMemo(() => {
    if (!startDateTime || !endDateTime || availabilityRules.length === 0) {
      return false;
    }
    const check = validateAvailability(startDateTime, endDateTime);
    return check.valid;
  }, [startDateTime, endDateTime, availabilityRules]);

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
    <div className="bg-background">
      {/* Header */}
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                // Check if there's history to go back to
                if (window.history.length > 1) {
                  navigate(-1);
                } else {
                  // Fallback to spot detail page
                  navigate(`/spot/${spotId}`);
                }
              }}
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

        {/* Self-booking Warning */}
        {isOwnSpot && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              You're the host of this spot. You cannot book your own listing.
            </AlertDescription>
          </Alert>
        )}

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
                  {/* Start Time Section */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Start Time</label>
                    <div className="flex border border-input rounded-lg overflow-hidden h-12">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            className={cn(
                              "flex-1 justify-start text-left font-normal h-full rounded-none border-0 hover:bg-accent",
                              !startDateTime && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
                            <span className="truncate">
                              {startDateTime ? format(startDateTime, "MMM d, yyyy") : "Pick date"}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={startDateTime}
                            onSelect={(date) => {
                              if (date) {
                                const newDate = new Date(date);
                                newDate.setHours(startDateTime.getHours());
                                newDate.setMinutes(startDateTime.getMinutes());
                                handleStartDateTimeChange(newDate);
                              }
                            }}
                            disabled={(date) => date < new Date()}
                            initialFocus
                            className="pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>

                      <span className="flex items-center px-2 text-muted-foreground">·</span>

                      <TimePicker date={startDateTime} setDate={handleStartDateTimeChange}>
                        <Button
                          variant="ghost"
                          className="justify-start text-left font-normal h-full rounded-none border-0 hover:bg-accent flex-shrink-0"
                        >
                          <Clock className="mr-2 h-4 w-4 flex-shrink-0" />
                          <span className="flex-shrink-0">{format(startDateTime, "h:mm a")}</span>
                        </Button>
                      </TimePicker>
                    </div>
                  </div>

                  {/* End Time Section */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">End Time</label>
                    <div className="flex border border-input rounded-lg overflow-hidden h-12">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            className={cn(
                              "flex-1 justify-start text-left font-normal h-full rounded-none border-0 hover:bg-accent",
                              !endDateTime && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
                            <span className="truncate">
                              {endDateTime ? format(endDateTime, "MMM d, yyyy") : "Pick date"}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={endDateTime}
                            onSelect={(date) => {
                              if (date) {
                                const newDate = new Date(date);
                                newDate.setHours(endDateTime.getHours());
                                newDate.setMinutes(endDateTime.getMinutes());
                                handleEndDateTimeChange(newDate);
                              }
                            }}
                            disabled={(date) => {
                              // Disable dates before start date
                              const startDateOnly = new Date(startDateTime);
                              startDateOnly.setHours(0, 0, 0, 0);
                              const checkDate = new Date(date);
                              checkDate.setHours(0, 0, 0, 0);
                              return checkDate < startDateOnly;
                            }}
                            initialFocus
                            className="pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>

                      <span className="flex items-center px-2 text-muted-foreground">·</span>

                      <TimePicker date={endDateTime} setDate={handleEndDateTimeChange}>
                        <Button
                          variant="ghost"
                          className="justify-start text-left font-normal h-full rounded-none border-0 hover:bg-accent flex-shrink-0"
                        >
                          <Clock className="mr-2 h-4 w-4 flex-shrink-0" />
                          <span className="flex-shrink-0">{format(endDateTime, "h:mm a")}</span>
                        </Button>
                      </TimePicker>
                    </div>
                  </div>

                  <Button className="w-full" onClick={() => setEditTimeOpen(false)}>
                    Save Changes
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          
          {/* Availability Hours Display */}
          {availabilityDisplay && (
            <div className="mb-4 p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Available hours:</span>
                <span className="text-muted-foreground">{availabilityDisplay}</span>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-start gap-2 text-sm">
              <CalendarIcon className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div className="flex flex-col gap-1 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Start:</span>
                  <span>{format(startDateTime, 'MMM d, yyyy')}</span>
                  <span className="text-muted-foreground">at</span>
                  <span>{format(startDateTime, 'h:mm a')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">End:</span>
                  <span>{format(endDateTime, 'MMM d, yyyy')}</span>
                  <span className="text-muted-foreground">at</span>
                  <span>{format(endDateTime, 'h:mm a')}</span>
                </div>
              </div>
              <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-xs font-medium">
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
            <Dialog open={editPaymentOpen} onOpenChange={setEditPaymentOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Edit2 className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Select Payment Method</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 pt-4">
                  {paymentMethods.map((method) => (
                    <button
                      key={method.id}
                      onClick={() => {
                        setSelectedPaymentMethod(method);
                        setEditPaymentOpen(false);
                      }}
                      className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-accent transition-colors text-left"
                    >
                      <CreditCard className="h-5 w-5 text-muted-foreground" />
                      <div className="flex-1">
                        <div className="font-medium capitalize">
                          {method.brand} •••• {method.last4}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Expires {method.expMonth}/{method.expYear}
                        </div>
                      </div>
                      {selectedPaymentMethod?.id === method.id && (
                        <Check className="h-5 w-5 text-primary" />
                      )}
                    </button>
                  ))}
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => navigate('/payment-methods')}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add New Payment Method
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          {selectedPaymentMethod ? (
            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                <div className="font-medium capitalize">
                  {selectedPaymentMethod.brand} •••• {selectedPaymentMethod.last4}
                </div>
                <div className="text-sm text-muted-foreground">
                  Expires {selectedPaymentMethod.expMonth}/{selectedPaymentMethod.expYear}
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 px-2 py-1 rounded">
                <Check className="h-3 w-3" />
                Verified
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-muted-foreground">
              <CreditCard className="h-5 w-5" />
              <div>
                <div className="font-medium">No payment method</div>
                <Button
                  variant="link"
                  className="h-auto p-0 text-xs text-primary"
                  onClick={() => navigate('/payment-methods')}
                >
                  Add payment method
                </Button>
              </div>
            </div>
          )}
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
          {!serverAvailable.ok && startDateTime && endDateTime && (
            <div className="mb-3 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <p className="text-sm text-destructive font-medium">
                {serverAvailable.reason || 'This time slot is no longer available'}
              </p>
            </div>
          )}
          
          <Button
            className="w-full h-14 text-lg"
            size="lg"
            onClick={handleBooking}
            disabled={!startDateTime || !endDateTime || !pricing || !selectedVehicle || !selectedPaymentMethod || bookingLoading || isOwnSpot || !isTimeValid || !serverAvailable.ok || checkingAvailability}
          >
            {bookingLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : checkingAvailability ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Checking availability...
              </>
            ) : (
              `Book Now • $${pricing?.total || '0.00'}`
            )}
          </Button>
          
          {!isTimeValid && startDateTime && endDateTime && availabilityRules.length > 0 && (
            <p className="text-center text-xs text-destructive">
              Selected times are outside available hours
            </p>
          )}
          {!serverAvailable.ok && startDateTime && endDateTime && (
            <p className="text-center text-xs text-destructive">
              {serverAvailable.reason}
            </p>
          )}
          {(!selectedVehicle || !selectedPaymentMethod) && (
            <p className="text-center text-xs text-muted-foreground">
              Please add a vehicle and payment method to continue
            </p>
          )}
          {!(!isTimeValid && startDateTime && endDateTime && availabilityRules.length > 0) && (!selectedVehicle || !selectedPaymentMethod) === false && (
            <p className="text-center text-xs text-muted-foreground">
              You won't be charged until your booking is confirmed
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Booking;
