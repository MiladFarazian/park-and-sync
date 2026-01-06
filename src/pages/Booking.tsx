import { MobileTimePicker } from '@/components/booking/MobileTimePicker';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { ArrowLeft, CalendarIcon, Clock, MapPin, Star, Edit2, CreditCard, Car, Plus, Check, AlertCircle, Loader2, Info, Zap } from 'lucide-react';
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Calendar } from '@/components/ui/calendar';
import { TimePicker } from '@/components/ui/time-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { differenceInHours, differenceInMinutes, addHours, format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { calculateDriverPrice, calculateBookingTotal } from '@/lib/pricing';
import RequireAuth from '@/components/auth/RequireAuth';
import RequireVerifiedAuth from '@/components/auth/RequireVerifiedAuth';
import GuestBookingForm from '@/components/booking/GuestBookingForm';
import CompleteProfileStep from '@/components/auth/CompleteProfileStep';
import { useAuth } from '@/contexts/AuthContext';
import { isProfileComplete } from '@/lib/profileUtils';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

const BookingContent = () => {
  const { spotId } = useParams<{ spotId: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile, refreshProfile, user, isEmailVerified } = useAuth();

  const paymentMethodsReturnTo = `${location.pathname}${location.search}`;
  const goToPaymentMethods = (options?: { add?: boolean }) => {
    const params = new URLSearchParams();
    params.set('returnTo', paymentMethodsReturnTo);
    if (options?.add) params.set('add', '1');
    navigate(`/payment-methods?${params.toString()}`);
  };

  const [spot, setSpot] = useState<any>(null);
  const [host, setHost] = useState<any>(null);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<any>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null);
  const [loading, setLoading] = useState(true);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [isOwnSpot, setIsOwnSpot] = useState(false);
  const [existingBooking, setExistingBooking] = useState<{ id: string } | null>(null);
  const [availabilityRules, setAvailabilityRules] = useState<any[]>([]);
  const [availabilityDisplay, setAvailabilityDisplay] = useState<string>('');
  const [serverAvailable, setServerAvailable] = useState<{ ok: boolean; reason?: string }>({ ok: true });
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [showProfileComplete, setShowProfileComplete] = useState(false);
  
  // EV Charging state
  const [useEvCharging, setUseEvCharging] = useState(false);
  
  // Check if profile is incomplete using centralized check (first_name + email required)
  const isProfileIncomplete = !isProfileComplete(profile);
  
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
  const [mobileStartPickerOpen, setMobileStartPickerOpen] = useState(false);
  const [mobileEndPickerOpen, setMobileEndPickerOpen] = useState(false);
  const [editVehicleOpen, setEditVehicleOpen] = useState(false);
  const [editPaymentOpen, setEditPaymentOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!spotId) return;
      
      try {
        console.log('[Booking] Fetching spot:', spotId);
        
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

        console.log('[Booking] Fetch result:', { 
          spotId, 
          hasData: !!spotData, 
          hasError: !!spotError,
          errorCode: spotError?.code,
          errorMessage: spotError?.message,
          spotStatus: spotData?.status
        });

        if (spotError) {
          console.error('[Booking] RLS/Permission error:', spotError);
          if (spotError.code === 'PGRST116' || spotError.message?.includes('not found')) {
            toast({
              title: "Spot not available",
              description: "This parking spot is not available for booking",
              variant: "destructive",
            });
          } else if (spotError.code === 'PGRST301' || spotError.message?.includes('permission')) {
            toast({
              title: "Access denied",
              description: "You do not have permission to book this spot",
              variant: "destructive",
            });
          }
          navigate('/explore');
          return;
        }

        if (!spotData) {
          console.error('[Booking] No spot data returned');
          toast({
            title: "Error",
            description: "Spot not found",
            variant: "destructive",
          });
          navigate('/explore');
          return;
        }

        // Check if spot is active
        if (spotData.status !== 'active') {
          console.warn('[Booking] Spot is not active:', { spotId, status: spotData.status });
          toast({
            title: "Spot not active",
            description: "This spot is not currently active and cannot be booked",
            variant: "destructive",
          });
          navigate('/explore');
          return;
        }

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

          // Check if user already has an active/paid booking for this spot
          // that OVERLAPS with the requested time range
          const requestedStart = searchParams.get('start');
          const requestedEnd = searchParams.get('end');
          
          let existingQuery = supabase
            .from('bookings')
            .select('id')
            .eq('spot_id', spotId)
            .eq('renter_id', user.id)
            .in('status', ['paid', 'active']);
          
          if (requestedStart && requestedEnd) {
            // Check for overlapping bookings: existing.start < requested.end AND existing.end > requested.start
            existingQuery = existingQuery
              .lt('start_at', requestedEnd)
              .gt('end_at', requestedStart);
          } else {
            // No specific time, check for any current/future booking
            const now = new Date().toISOString();
            existingQuery = existingQuery.gte('end_at', now);
          }
          
          const { data: existingBookingData } = await existingQuery
            .limit(1)
            .maybeSingle();

          if (existingBookingData) {
            toast({
              title: "You already have a booking",
              description: "Redirecting to your existing booking...",
            });
            navigate(`/booking/${existingBookingData.id}`);
            return;
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
    
    // Calculate exact hours including minutes (e.g., 2.75 hours for 2h 45m)
    const minutes = differenceInMinutes(endDateTime, startDateTime);
    const hours = minutes / 60;
    console.log('Time calculated:', { minutes, hours });
    
    if (hours <= 0) {
      console.log('Hours less than or equal to 0');
      return null;
    }

    // Use new pricing: driver sees upcharged rate + service fee + optional EV fee
    const evPremium = spot.ev_charging_premium_per_hour || 0;
    const { driverHourlyRate, driverSubtotal, serviceFee, evChargingFee, driverTotal } = calculateBookingTotal(
      spot.hourly_rate, 
      hours,
      evPremium,
      useEvCharging
    );

    console.log('Pricing:', { hours, driverHourlyRate, driverSubtotal, serviceFee, evChargingFee, driverTotal });

    return {
      hours: hours.toFixed(2),
      driverHourlyRate: driverHourlyRate.toFixed(2),
      subtotal: driverSubtotal.toFixed(2),
      serviceFee: serviceFee.toFixed(2),
      evChargingFee: evChargingFee.toFixed(2),
      total: driverTotal.toFixed(2),
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

    // Validate availability - client side (warning only)
    const availabilityCheck = validateAvailability(startDateTime, endDateTime);
    console.log('[Booking] Client availability check:', { 
      valid: availabilityCheck.valid, 
      message: availabilityCheck.message,
      start: startDateTime.toISOString(),
      end: endDateTime.toISOString()
    });
    
    // Log server availability state
    console.log('[Booking] Server availability state:', { 
      ok: serverAvailable.ok, 
      reason: serverAvailable.reason 
    });
    
    if (!availabilityCheck.valid) {
      // Don't block booking purely on client estimate; trust server below
      console.warn('[Booking] Client-side availability warning (not blocking):', availabilityCheck);
    }
    
    // Prioritize server-side availability check
    if (!serverAvailable.ok) {
      toast({
        title: "Time slot unavailable",
        description: serverAvailable.reason || "This time is not available",
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

      // Double-check user doesn't already have a booking for this spot
      const now = new Date().toISOString();
      const { data: existingBookingData } = await supabase
        .from('bookings')
        .select('id')
        .eq('spot_id', spotId)
        .eq('renter_id', user.id)
        .in('status', ['paid', 'active'])
        .gte('end_at', now)
        .limit(1)
        .maybeSingle();

      if (existingBookingData) {
        toast({
          title: "You already have a booking",
          description: "Redirecting to your existing booking...",
        });
        navigate(`/booking/${existingBookingData.id}`);
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
          vehicle_id: selectedVehicle?.id,
          hold_id: holdData?.hold_id,
          will_use_ev_charging: useEvCharging,
        },
      });

      // If the edge function returned a non-2xx status, Supabase puts the response in `bookingError`.
      // We still want to handle known cases like "no_payment_method" gracefully.
      if (bookingError) {
        const msg = (bookingError as any)?.message ? String((bookingError as any).message) : '';
        const jsonStart = msg.indexOf('{');
        const jsonEnd = msg.lastIndexOf('}');
        let payload: any = null;

        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
          try {
            payload = JSON.parse(msg.slice(jsonStart, jsonEnd + 1));
          } catch {
            payload = null;
          }
        }

        if (payload?.error === 'no_payment_method') {
          toast({
            title: "No payment method",
            description: "Please add a payment method before booking",
            variant: "destructive",
          });
          goToPaymentMethods({ add: true });
          return;
        }

        throw bookingError;
      }

      console.log('[Booking] Booking response:', bookingData);

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

      // Handle response based on type
      if (bookingData.error === 'no_payment_method') {
        toast({
          title: "No payment method",
          description: "Please add a payment method before booking",
          variant: "destructive",
        });
        goToPaymentMethods({ add: true });
        return;
      }

      if (bookingData.success) {
        if (bookingData.pending_approval) {
          // Non-instant book - waiting for host approval
          toast({
            title: "Request Sent!",
            description: "The host has 1 hour to approve your booking. You'll be notified when they respond.",
          });
          navigate(`/booking-confirmation/${bookingData.booking_id}`);
        } else {
          // Instant book - payment successful, booking is active
          toast({
            title: "Booking confirmed!",
            description: "Your payment was processed successfully",
          });
          navigate(`/booking-confirmation/${bookingData.booking_id}`);
        }
      } else if (bookingData.requires_action) {
        // Fallback to embedded checkout for 3DS or declined card
        toast({
          title: bookingData.message || "Additional verification needed",
          description: "Please complete the payment verification",
        });
        sessionStorage.setItem(`checkout_${bookingData.booking_id}`, bookingData.client_secret);
        navigate(`/embedded-checkout/${bookingData.booking_id}`);
      } else {
        throw new Error('Unexpected booking response');
      }
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
      <div className="flex items-center justify-center py-20">
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
                // If there's history, go back; otherwise navigate to spot detail
                if (window.history.length > 1) {
                  navigate(-1);
                } else {
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
              <div className="flex items-center gap-1 text-sm text-muted-foreground mb-2">
                <MapPin className="h-3 w-3" />
                <span>{spot.address}</span>
              </div>
              <div className="flex items-center gap-3 text-sm mb-3">
                <span className="font-bold">${calculateDriverPrice(spot.hourly_rate).toFixed(2)}/hr</span>
              </div>
              <Separator className="my-3" />
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={host?.avatar_url} />
                  <AvatarFallback>{hostInitial}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="text-sm font-medium">Hosted by {hostName}</div>
                  {host?.rating ? (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                      <span>{Number(host.rating).toFixed(1)}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">New host</span>
                  )}
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
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setMobileStartPickerOpen(true)}
            >
              <Edit2 className="h-4 w-4" />
            </Button>
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
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setSelectedVehicle(vehicle);
                        setEditVehicleOpen(false);
                      }}
                      className={`touch-scroll-safe w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
                        selectedVehicle?.id === vehicle.id ? 'border-primary bg-primary/5' : ''
                      }`}
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
                    onClick={() => navigate('/add-vehicle', { state: { returnTo: `${location.pathname}${location.search}` } })}
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

        {/* Complete Profile Step - shown if profile is incomplete */}
        {isProfileIncomplete && (
          <Card className="p-4 border-primary/50 bg-primary/5">
            <div className="space-y-4">
              <div className="text-center">
                <h3 className="font-bold text-lg">One more step</h3>
                <p className="text-sm text-muted-foreground">
                  We'll email your receipt and booking details.
                </p>
              </div>
              <CompleteProfileStep 
                phone={user?.phone || profile?.phone || ''} 
                onComplete={async () => {
                  await refreshProfile();
                  toast({
                    title: 'Profile updated',
                    description: 'You can now proceed with payment.'
                  });
                }}
              />
            </div>
          </Card>
        )}

        {/* Payment Method Card */}
        <Card className={`p-4 ${isProfileIncomplete ? 'opacity-50 pointer-events-none' : ''}`}>
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
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setSelectedPaymentMethod(method);
                        setEditPaymentOpen(false);
                      }}
                      className={`touch-scroll-safe w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
                        selectedPaymentMethod?.id === method.id ? 'border-primary bg-primary/5' : ''
                      }`}
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
                    onClick={() => goToPaymentMethods({ add: true })}
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
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-muted-foreground">
                <CreditCard className="h-5 w-5" />
                <div>
                  <div className="font-medium">No payment method</div>
                  <Button
                    variant="link"
                    className="h-auto p-0 text-xs text-primary"
                    onClick={() => goToPaymentMethods({ add: true })}
                  >
                    Add payment method
                  </Button>
                </div>
              </div>
              <Alert variant="destructive" className="mt-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  You must add a payment method before booking
                </AlertDescription>
              </Alert>
            </div>
          )}
          {selectedPaymentMethod && (
            <p className="text-xs text-muted-foreground mt-2">
              This card will be charged automatically when you book
            </p>
          )}
        </Card>

        {/* EV Charging Option (only if spot supports it) */}
        {spot?.has_ev_charging && (
          <Card className="p-4 border-green-200 dark:border-green-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                  <Zap className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="font-medium">Add EV Charging</p>
                  <p className="text-sm text-muted-foreground">
                    +${(spot.ev_charging_premium_per_hour || 0).toFixed(2)}/hour
                  </p>
                </div>
              </div>
              <Switch 
                checked={useEvCharging} 
                onCheckedChange={setUseEvCharging}
              />
            </div>
          </Card>
        )}

        {/* Price Breakdown Card */}
        {pricing && (
          <Card className="p-4">
            <h3 className="font-bold text-lg mb-4">Price Breakdown</h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  ${pricing.driverHourlyRate}/hr × {pricing.hours} hours
                </span>
                <span className="font-medium">${pricing.subtotal}</span>
              </div>
              <div className="flex justify-between text-sm">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-muted-foreground flex items-center gap-1 cursor-help">
                        Service fee
                        <Info className="h-3 w-3" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs max-w-[200px]">This fee helps cover platform costs and ensures secure payments.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <span className="font-medium">${pricing.serviceFee}</span>
              </div>
              {useEvCharging && parseFloat(pricing.evChargingFee) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Zap className="h-3 w-3 text-green-600" />
                    EV charging
                  </span>
                  <span className="font-medium">${pricing.evChargingFee}</span>
                </div>
              )}
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
            disabled={!startDateTime || !endDateTime || !pricing || !selectedVehicle || !selectedPaymentMethod || bookingLoading || isOwnSpot || !isTimeValid || !serverAvailable.ok || checkingAvailability || isProfileIncomplete}
          >
            {bookingLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing payment...
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
          {isProfileIncomplete && (
            <p className="text-center text-xs text-destructive">
              Please complete your profile details above to continue
            </p>
          )}
          {!isProfileIncomplete && (!selectedVehicle || !selectedPaymentMethod) && (
            <p className="text-center text-xs text-muted-foreground">
              Please add a vehicle and payment method to continue
            </p>
          )}
          {!(!isTimeValid && startDateTime && endDateTime && availabilityRules.length > 0) && (!selectedVehicle || !selectedPaymentMethod) === false && (
            <p className="text-center text-xs text-muted-foreground">
              Your card will be charged immediately upon booking
            </p>
          )}
        </div>
      </div>

      {/* Mobile Time Pickers */}
      <MobileTimePicker
        isOpen={mobileStartPickerOpen}
        onClose={() => setMobileStartPickerOpen(false)}
        onConfirm={(date) => {
          handleStartDateTimeChange(date);
          setMobileStartPickerOpen(false);
          setMobileEndPickerOpen(true);
        }}
        mode="start"
        initialValue={startDateTime}
        availabilityRules={availabilityRules}
      />
      
      <MobileTimePicker
        isOpen={mobileEndPickerOpen}
        onClose={() => setMobileEndPickerOpen(false)}
        onConfirm={(date) => {
          handleEndDateTimeChange(date);
          setMobileEndPickerOpen(false);
        }}
        mode="end"
        startTime={startDateTime}
        initialValue={endDateTime}
        availabilityRules={availabilityRules}
      />
    </div>
  );
};

// Stripe promise for guest checkout
const getStripePromise = async () => {
  const { data } = await supabase.functions.invoke('get-stripe-publishable-key');
  if (data?.publishableKey) {
    return loadStripe(data.publishableKey);
  }
  return null;
};

// Guest Booking Page Component
const GuestBookingPage = () => {
  const { spotId } = useParams<{ spotId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [spot, setSpot] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [stripePromise, setStripePromise] = useState<Promise<any> | null>(null);
  const [availabilityRules, setAvailabilityRules] = useState<any[]>([]);
  
  // Mobile time picker states
  const [mobileStartPickerOpen, setMobileStartPickerOpen] = useState(false);
  const [mobileEndPickerOpen, setMobileEndPickerOpen] = useState(false);
  
  // Get times from URL params or use defaults
  const getInitialTimes = () => {
    const start = searchParams.get('start');
    const end = searchParams.get('end');
    
    if (start && end) {
      return { start: new Date(start), end: new Date(end) };
    }
    
    const defaultStart = addHours(new Date(), 1);
    const defaultEnd = addHours(defaultStart, 2);
    return { start: defaultStart, end: defaultEnd };
  };
  
  const initialTimes = getInitialTimes();
  const [startDateTime, setStartDateTime] = useState<Date>(initialTimes.start);
  const [endDateTime, setEndDateTime] = useState<Date>(initialTimes.end);

  // Build return URL for sign-in redirect
  const returnUrl = `${location.pathname}${location.search}`;

  // Helper to check if a specific time is within availability rules
  const isTimeWithinAvailability = (date: Date) => {
    if (availabilityRules.length === 0) return true;
    
    const dayOfWeek = date.getDay();
    const timeString = format(date, 'HH:mm:ss');
    
    const rulesForDay = availabilityRules.filter(
      (rule) => rule.day_of_week === dayOfWeek && rule.is_available !== false
    );
    
    if (rulesForDay.length === 0) return false;
    
    return rulesForDay.some((rule) => {
      return timeString >= rule.start_time && timeString <= rule.end_time;
    });
  };

  // Check if the selected time range is valid
  const isTimeRangeValid = useMemo(() => {
    if (!startDateTime || !endDateTime || availabilityRules.length === 0) return true;
    return isTimeWithinAvailability(startDateTime) && isTimeWithinAvailability(endDateTime);
  }, [startDateTime, endDateTime, availabilityRules]);

  // Update URL params when times change
  const handleStartDateTimeChange = (date: Date) => {
    setStartDateTime(date);
    // If end is before or equal to new start, adjust end
    if (endDateTime <= date) {
      const newEnd = addHours(date, 2);
      setEndDateTime(newEnd);
      setSearchParams({ start: date.toISOString(), end: newEnd.toISOString() });
    } else {
      setSearchParams({ start: date.toISOString(), end: endDateTime.toISOString() });
    }
  };

  const handleEndDateTimeChange = (date: Date) => {
    setEndDateTime(date);
    setSearchParams({ start: startDateTime.toISOString(), end: date.toISOString() });
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!spotId) return;
      
      try {
        // Fetch spot and availability rules in parallel
        const [spotResponse, rulesResponse] = await Promise.all([
          supabase
            .from('spots')
            .select(`*, spot_photos(url, is_primary)`)
            .eq('id', spotId)
            .eq('status', 'active')
            .single(),
          supabase
            .from('availability_rules')
            .select('*')
            .eq('spot_id', spotId)
        ]);

        if (spotResponse.error || !spotResponse.data) {
          toast({ title: "Spot not available", description: "This spot is not available for booking", variant: "destructive" });
          navigate('/explore');
          return;
        }

        setSpot(spotResponse.data);
        setAvailabilityRules(rulesResponse.data || []);
        
        // Initialize Stripe
        const promise = getStripePromise();
        setStripePromise(promise);
      } catch (err) {
        console.error('Error:', err);
        navigate('/explore');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [spotId, navigate, toast]);

  const calculateTotal = () => {
    if (!startDateTime || !endDateTime || !spot) return null;
    
    const minutes = differenceInMinutes(endDateTime, startDateTime);
    const hours = minutes / 60;
    if (hours <= 0) return null;

    const { driverHourlyRate, driverSubtotal, serviceFee, driverTotal } = calculateBookingTotal(
      spot.hourly_rate, 
      hours,
      0, // EV premium
      false // Use EV charging
    );

    return {
      hours,
      driverHourlyRate,
      subtotal: driverSubtotal,
      serviceFee,
      total: driverTotal,
    };
  };

  const pricing = calculateTotal();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!spot || !pricing || !stripePromise) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Unable to load booking information</p>
      </div>
    );
  }

  const primaryPhoto = spot.spot_photos?.find((p: any) => p.is_primary)?.url || spot.spot_photos?.[0]?.url;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="flex items-center gap-4 p-4">
          <Button variant="ghost" size="icon" onClick={() => {
            if (window.history.length > 1) {
              navigate(-1);
            } else {
              navigate(`/spot/${spotId}`);
            }
          }}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">Guest Checkout</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-6 pb-8">
        {/* Sign in for faster checkout option */}
        <Card className="p-4 bg-muted/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Have an account?</span>
            </div>
            <Button 
              variant="link" 
              className="p-0 h-auto text-sm"
              onClick={() => navigate(`/auth?returnTo=${encodeURIComponent(returnUrl)}`)}
            >
              Sign in for faster checkout
            </Button>
          </div>
        </Card>

        {/* Spot Summary */}
        <Card className="p-4">
          <div className="flex gap-4">
            {primaryPhoto && (
              <img 
                src={primaryPhoto} 
                alt={spot.title} 
                className="w-20 h-20 object-cover rounded-lg"
              />
            )}
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold truncate">{spot.title}</h2>
              <p className="text-sm text-muted-foreground truncate flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {spot.address}
              </p>
            </div>
          </div>
        </Card>

        {/* Time Selection */}
        <Card className="p-4">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Booking Time
          </h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Start</Label>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !isTimeRangeValid && "border-destructive text-destructive"
                )}
                onClick={() => setMobileStartPickerOpen(true)}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                <span className="truncate">{format(startDateTime, 'MMM d, h:mm a')}</span>
              </Button>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">End</Label>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !isTimeRangeValid && "border-destructive text-destructive"
                )}
                onClick={() => setMobileEndPickerOpen(true)}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                <span className="truncate">{format(endDateTime, 'h:mm a')}</span>
              </Button>
            </div>
          </div>
          
          {!isTimeRangeValid && (
            <p className="text-xs text-destructive mt-2 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Selected times are outside available hours
            </p>
          )}
          
          <p className="text-sm text-muted-foreground mt-3">
            Duration: {pricing.hours.toFixed(1)} hours
          </p>
        </Card>

        {/* Guest Booking Form with Stripe Elements */}
        <Elements stripe={stripePromise}>
          <GuestBookingForm
            spot={spot}
            startDateTime={startDateTime}
            endDateTime={endDateTime}
            totalHours={pricing.hours}
            subtotal={pricing.subtotal}
            serviceFee={pricing.serviceFee}
            totalAmount={pricing.total}
            isTimeValid={isTimeRangeValid}
          />
        </Elements>
      </div>

      {/* Mobile Time Pickers */}
      <MobileTimePicker
        isOpen={mobileStartPickerOpen}
        onClose={() => setMobileStartPickerOpen(false)}
        onConfirm={(date) => {
          handleStartDateTimeChange(date);
          setMobileStartPickerOpen(false);
          setMobileEndPickerOpen(true);
        }}
        mode="start"
        initialValue={startDateTime}
        availabilityRules={availabilityRules}
      />
      
      <MobileTimePicker
        isOpen={mobileEndPickerOpen}
        onClose={() => setMobileEndPickerOpen(false)}
        onConfirm={(date) => {
          handleEndDateTimeChange(date);
          setMobileEndPickerOpen(false);
        }}
        mode="end"
        startTime={startDateTime}
        initialValue={endDateTime}
        availabilityRules={availabilityRules}
      />
    </div>
  );
};

const Booking = () => {
  const { user, loading } = useAuth();

  // Show loading spinner while checking auth state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // If no user is logged in, show guest booking page
  if (!user) {
    return <GuestBookingPage />;
  }

  // User is logged in - require email verification for authenticated booking flow
  return (
    <RequireVerifiedAuth feature="booking">
      <BookingContent />
    </RequireVerifiedAuth>
  );
};

export default Booking;
