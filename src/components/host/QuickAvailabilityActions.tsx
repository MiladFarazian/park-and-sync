import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarOff, CalendarCheck, Clock, Loader2, Check, ChevronRight, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format, startOfDay, endOfDay } from 'date-fns';
import { getStreetAddress } from '@/lib/addressUtils';

interface Spot {
  id: string;
  title: string;
  address: string;
  hourly_rate: number;
}

interface ConflictingBooking {
  id: string;
  renter_name: string;
  spot_address: string;
  spot_id: string;
  total_amount: number;
  start_at: string;
  end_at: string;
  isLive: boolean; // Currently in progress
}

type ActionType = 'block' | 'available' | 'manage' | null;

export const QuickAvailabilityActions = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [spots, setSpots] = useState<Spot[]>([]);
  const [loadingSpots, setLoadingSpots] = useState(false);
  const [selectedSpots, setSelectedSpots] = useState<string[]>([]);
  const [actionType, setActionType] = useState<ActionType>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Conflict handling state
  const [conflictingBookings, setConflictingBookings] = useState<ConflictingBooking[]>([]);
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [cancellingBookings, setCancellingBookings] = useState(false);

  const today = format(new Date(), 'yyyy-MM-dd');
  const todayDisplay = format(new Date(), 'EEEE, MMMM d');

  useEffect(() => {
    if (dialogOpen && user) {
      fetchSpots();
    }
  }, [dialogOpen, user]);

  const fetchSpots = async () => {
    if (!user) return;
    setLoadingSpots(true);
    try {
      const { data, error } = await supabase
        .from('spots')
        .select('id, title, address, hourly_rate')
        .eq('host_id', user.id)
        .eq('status', 'active');

      if (error) throw error;
      setSpots(data || []);
      // Auto-select all by default
      if (data && data.length > 0) {
        setSelectedSpots(data.map(s => s.id));
      }
    } catch (error) {
      console.error('Error fetching spots:', error);
      toast.error('Failed to load spots');
    } finally {
      setLoadingSpots(false);
    }
  };

  const openDialog = (type: ActionType) => {
    setActionType(type);
    setDialogOpen(true);
    setSelectedSpots([]);
  };

  const toggleSpot = (spotId: string) => {
    setSelectedSpots(prev =>
      prev.includes(spotId)
        ? prev.filter(id => id !== spotId)
        : [...prev, spotId]
    );
  };

  const toggleAll = () => {
    if (selectedSpots.length === spots.length) {
      setSelectedSpots([]);
    } else {
      setSelectedSpots(spots.map(s => s.id));
    }
  };

  const checkForConflictingBookings = async (): Promise<ConflictingBooking[]> => {
    if (selectedSpots.length === 0) return [];

    const now = new Date();
    const todayEnd = endOfDay(now).toISOString();

    // Fetch bookings that overlap with today and haven't ended yet
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select(`
        id,
        total_amount,
        start_at,
        end_at,
        spot_id,
        is_guest,
        guest_full_name,
        renter:profiles!bookings_renter_id_fkey (first_name, last_name),
        spot:spots!bookings_spot_id_fkey (address)
      `)
      .in('spot_id', selectedSpots)
      .in('status', ['pending', 'paid', 'active', 'held'])
      .lte('start_at', todayEnd)
      .gte('end_at', now.toISOString()); // Only bookings that haven't ended yet

    if (error) {
      console.error('Error checking for conflicts:', error);
      return [];
    }

    return (bookings || []).map(b => {
      const startAt = new Date(b.start_at);
      const endAt = new Date(b.end_at);
      const isLive = startAt <= now && now < endAt;

      return {
        id: b.id,
        renter_name: b.is_guest 
          ? (b.guest_full_name || 'Guest') 
          : `${(b.renter as any)?.first_name || ''} ${(b.renter as any)?.last_name || ''}`.trim() || 'Driver',
        spot_address: getStreetAddress((b.spot as any)?.address),
        spot_id: b.spot_id,
        total_amount: b.total_amount,
        start_at: b.start_at,
        end_at: b.end_at,
        isLive,
      };
    });
  };

  const handleBlockToday = async () => {
    if (selectedSpots.length === 0) return;
    setSaving(true);

    try {
      // Check for conflicting bookings first
      const conflicts = await checkForConflictingBookings();
      
      // Separate live bookings from upcoming bookings
      const liveBookings = conflicts.filter(b => b.isLive);
      const upcomingBookings = conflicts.filter(b => !b.isLive);
      
      if (liveBookings.length > 0 || upcomingBookings.length > 0) {
        setConflictingBookings(conflicts);
        setShowConflictDialog(true);
        setSaving(false);
        return;
      }

      // No conflicts, proceed with blocking
      await blockTodayWithoutConflicts();
    } catch (error) {
      console.error('Error blocking today:', error);
      toast.error('Failed to update availability');
      setSaving(false);
    }
  };

  const blockTodayWithoutConflicts = async (liveBookingsEndTimes?: Map<string, Date>) => {
    try {
      for (const spotId of selectedSpots) {
        await supabase
          .from('calendar_overrides')
          .delete()
          .eq('spot_id', spotId)
          .eq('override_date', today);

        // Check if this spot has a live booking - if so, only block from after it ends
        const liveEndTime = liveBookingsEndTimes?.get(spotId);
        
        if (liveEndTime) {
          // Block from when the live booking ends until end of day
          const endTimeStr = format(liveEndTime, 'HH:mm');
          const { error } = await supabase
            .from('calendar_overrides')
            .insert({
              spot_id: spotId,
              override_date: today,
              is_available: false,
              start_time: endTimeStr,
              end_time: '23:59',
              reason: 'Blocked after live booking ends',
            });
          if (error) throw error;
        } else {
          // Block the entire day
          const { error } = await supabase
            .from('calendar_overrides')
            .insert({
              spot_id: spotId,
              override_date: today,
              is_available: false,
              start_time: null,
              end_time: null,
            });
          if (error) throw error;
        }
      }

      toast.success(`Marked ${selectedSpots.length} spot${selectedSpots.length > 1 ? 's' : ''} as unavailable for today`);
      setDialogOpen(false);
      navigate('/host-calendar');
    } catch (error) {
      console.error('Error blocking today:', error);
      toast.error('Failed to update availability');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmCancelBookings = async () => {
    setCancellingBookings(true);

    try {
      const liveBookings = conflictingBookings.filter(b => b.isLive);
      const upcomingBookings = conflictingBookings.filter(b => !b.isLive);

      // Cancel and refund only upcoming bookings (not live ones)
      for (const booking of upcomingBookings) {
        const { error } = await supabase.functions.invoke('host-cancel-booking', {
          body: { 
            bookingId: booking.id,
            reason: 'Host marked spot as unavailable for today'
          },
        });

        if (error) {
          console.error(`Error cancelling booking ${booking.id}:`, error);
          toast.error(`Failed to cancel booking for ${booking.renter_name}`);
        }
      }

      // Build a map of spot IDs to their live booking end times
      const liveBookingsEndTimes = new Map<string, Date>();
      for (const booking of liveBookings) {
        const endTime = new Date(booking.end_at);
        const existingEnd = liveBookingsEndTimes.get(booking.spot_id);
        // Use the latest end time if there are multiple live bookings for a spot
        if (!existingEnd || endTime > existingEnd) {
          liveBookingsEndTimes.set(booking.spot_id, endTime);
        }
      }

      // Now block the day (with adjustments for live bookings)
      await blockTodayWithoutConflicts(liveBookingsEndTimes);
      
      const cancelledCount = upcomingBookings.length;
      const liveCount = liveBookings.length;
      
      if (cancelledCount > 0 && liveCount > 0) {
        toast.success(`Cancelled ${cancelledCount} booking${cancelledCount > 1 ? 's' : ''} and will block after ${liveCount} live session${liveCount > 1 ? 's end' : ' ends'}`);
      } else if (cancelledCount > 0) {
        toast.success(`Cancelled ${cancelledCount} booking${cancelledCount > 1 ? 's' : ''} and marked spots as unavailable`);
      } else if (liveCount > 0) {
        toast.success(`Will block spots after ${liveCount} live session${liveCount > 1 ? 's end' : ' ends'}`);
      }
      
      setShowConflictDialog(false);
      setConflictingBookings([]);
    } catch (error) {
      console.error('Error cancelling bookings:', error);
      toast.error('Failed to cancel bookings');
    } finally {
      setCancellingBookings(false);
    }
  };

  const handleMakeAvailable = async () => {
    if (selectedSpots.length === 0) return;

    setSaving(true);

    try {
      for (const spotId of selectedSpots) {
        await supabase
          .from('calendar_overrides')
          .delete()
          .eq('spot_id', spotId)
          .eq('override_date', today);

        const { error } = await supabase
          .from('calendar_overrides')
          .insert({
            spot_id: spotId,
            override_date: today,
            is_available: true,
            start_time: null,
            end_time: null,
          });

        if (error) throw error;
      }

      toast.success(`Marked ${selectedSpots.length} spot${selectedSpots.length > 1 ? 's' : ''} as available all day`);
      setDialogOpen(false);
      navigate('/host-calendar');
    } catch (error) {
      console.error('Error setting availability:', error);
      toast.error('Failed to update availability');
    } finally {
      setSaving(false);
    }
  };

  const handleManageAvailability = () => {
    if (selectedSpots.length === 0) return;

    if (selectedSpots.length === 1) {
      navigate(`/edit-spot/${selectedSpots[0]}/availability`);
    } else {
      const spotIdsParam = selectedSpots.join(',');
      navigate(`/manage-availability/bulk?spots=${spotIdsParam}`);
    }
    setDialogOpen(false);
  };

  const getDialogTitle = () => {
    switch (actionType) {
      case 'block':
        return 'Mark Today as Unavailable';
      case 'available':
        return 'Mark Today as Available';
      case 'manage':
        return 'Manage Availability';
      default:
        return '';
    }
  };

  const getDialogDescription = () => {
    switch (actionType) {
      case 'block':
        return `Block all bookings for ${todayDisplay}`;
      case 'available':
        return `Make spots available all day on ${todayDisplay}`;
      case 'manage':
        return 'Edit weekly schedules and date overrides';
      default:
        return '';
    }
  };

  const liveBookings = conflictingBookings.filter(b => b.isLive);
  const upcomingBookings = conflictingBookings.filter(b => !b.isLive);
  const totalRefundAmount = upcomingBookings.reduce((sum, b) => sum + b.total_amount, 0);

  return (
    <>
      <Card className="p-4 space-y-2">
        <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">
          Quick Availability
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="w-full h-auto py-3 px-3 flex flex-col items-center gap-1"
            onClick={() => openDialog('block')}
          >
            <CalendarOff className="h-5 w-5 text-destructive" />
            <span className="text-xs font-medium">Unavailable Today</span>
          </Button>

          <Button
            variant="outline"
            className="w-full h-auto py-3 px-3 flex flex-col items-center gap-1"
            onClick={() => openDialog('available')}
          >
            <CalendarCheck className="h-5 w-5 text-green-600" />
            <span className="text-xs font-medium">Available Today</span>
          </Button>
        </div>
        
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-center text-xs text-muted-foreground h-8"
          onClick={() => openDialog('manage')}
        >
          <Clock className="h-3 w-3 mr-1.5" />
          Manage Availability
          <ChevronRight className="h-3 w-3 ml-1" />
        </Button>
      </Card>

      {/* Spot Selection Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{getDialogTitle()}</DialogTitle>
            <DialogDescription>{getDialogDescription()}</DialogDescription>
          </DialogHeader>

          {loadingSpots ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : spots.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-muted-foreground mb-4">You don't have any active spots.</p>
              <Button onClick={() => { setDialogOpen(false); navigate('/list-spot'); }}>
                List a Spot
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">Select spots to apply:</p>
              </div>

              {/* Select All */}
              {spots.length > 1 && (
                <div
                  className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={toggleAll}
                >
                  <Checkbox
                    checked={selectedSpots.length === spots.length}
                    onCheckedChange={toggleAll}
                  />
                  <span className="font-medium text-sm">
                    {selectedSpots.length === spots.length ? 'Deselect All' : 'Select All Spots'}
                  </span>
                </div>
              )}

              {/* Spots List */}
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {spots.map(spot => (
                  <div
                    key={spot.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedSpots.includes(spot.id)
                        ? 'bg-primary/5 border-primary/30'
                        : 'hover:bg-accent/50'
                    }`}
                    onClick={() => toggleSpot(spot.id)}
                  >
                    <Checkbox
                      checked={selectedSpots.includes(spot.id)}
                      onCheckedChange={() => toggleSpot(spot.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{spot.title}</div>
                      <div className="text-xs text-muted-foreground truncate">{getStreetAddress(spot.address)}</div>
                    </div>
                    {selectedSpots.includes(spot.id) && (
                      <Check className="h-4 w-4 text-primary flex-shrink-0" />
                    )}
                  </div>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancel
                </Button>
                {actionType === 'block' && (
                  <Button
                    className="flex-1"
                    disabled={selectedSpots.length === 0 || saving}
                    onClick={handleBlockToday}
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Block Today
                  </Button>
                )}
                {actionType === 'available' && (
                  <Button
                    className="flex-1"
                    disabled={selectedSpots.length === 0 || saving}
                    onClick={handleMakeAvailable}
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Set Available
                  </Button>
                )}
                {actionType === 'manage' && (
                  <Button
                    className="flex-1"
                    disabled={selectedSpots.length === 0}
                    onClick={handleManageAvailability}
                  >
                    Continue
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={showConflictDialog} onOpenChange={setShowConflictDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {liveBookings.length > 0 && upcomingBookings.length === 0 
                ? 'Live Session in Progress'
                : 'Bookings Found'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {/* Live Bookings Section */}
                {liveBookings.length > 0 && (
                  <div className="space-y-2">
                    <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
                      <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                        {liveBookings.length} parking session{liveBookings.length > 1 ? 's are' : ' is'} currently in progress. 
                        These cannot be cancelled. The spot will be blocked after the session{liveBookings.length > 1 ? 's end' : ' ends'}.
                      </p>
                    </div>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {liveBookings.map(booking => (
                        <div key={booking.id} className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-sm border border-amber-200 dark:border-amber-800">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                            <span className="font-medium">{booking.renter_name}</span>
                            <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">LIVE</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {getStreetAddress(booking.spot_address)} • Ends {format(new Date(booking.end_at), 'h:mm a')}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Upcoming Bookings Section */}
                {upcomingBookings.length > 0 && (
                  <div className="space-y-2">
                    {liveBookings.length > 0 && (
                      <p className="text-sm text-muted-foreground">
                        {upcomingBookings.length} upcoming booking{upcomingBookings.length > 1 ? 's' : ''} will be cancelled and refunded:
                      </p>
                    )}
                    {liveBookings.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        You have {upcomingBookings.length} upcoming booking{upcomingBookings.length > 1 ? 's' : ''} for today. 
                        Marking your spot{selectedSpots.length > 1 ? 's' : ''} as unavailable will cancel and fully refund {upcomingBookings.length > 1 ? 'these bookings' : 'this booking'}.
                      </p>
                    )}
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {upcomingBookings.map(booking => (
                        <div key={booking.id} className="p-2 bg-muted rounded-lg text-sm">
                          <div className="font-medium">{booking.renter_name}</div>
                          <div className="text-xs text-muted-foreground">
                            {getStreetAddress(booking.spot_address)} • ${booking.total_amount.toFixed(2)} refund
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(booking.start_at), 'h:mm a')} – {format(new Date(booking.end_at), 'h:mm a')}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                      <p className="text-sm font-medium text-destructive">
                        Total refund amount: ${totalRefundAmount.toFixed(2)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancellingBookings}>
              {liveBookings.length > 0 && upcomingBookings.length === 0 ? 'Cancel' : 'Keep Bookings'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmCancelBookings}
              disabled={cancellingBookings}
              className={upcomingBookings.length > 0 
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
              }
            >
              {cancellingBookings ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Processing...
                </>
              ) : upcomingBookings.length > 0 ? (
                liveBookings.length > 0 
                  ? 'Cancel Upcoming & Block After Live'
                  : 'Cancel & Refund Bookings'
              ) : (
                'Block After Session Ends'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default QuickAvailabilityActions;
