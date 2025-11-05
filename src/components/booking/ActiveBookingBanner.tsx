import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { MessageCircle, Clock, AlertTriangle, CarFront, DollarSign, Plus } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, addHours, format } from "date-fns";

interface ActiveBooking {
  id: string;
  spot_id: string;
  renter_id: string;
  start_at: string;
  end_at: string;
  status: string;
  total_amount: number;
  overstay_detected_at: string | null;
  overstay_action: 'charging' | 'towing' | null;
  overstay_grace_end: string | null;
  overstay_charge_amount: number;
  spots: {
    title: string;
    address: string;
    host_id: string;
    hourly_rate: number;
  };
  profiles: {
    first_name: string;
    last_name: string;
    avatar_url: string;
  };
}

export const ActiveBookingBanner = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [activeBooking, setActiveBooking] = useState<ActiveBooking | null>(null);
  const [showOverstayDialog, setShowOverstayDialog] = useState(false);
  const [showExtendDialog, setShowExtendDialog] = useState(false);
  const [extensionHours, setExtensionHours] = useState(1);
  const [loading, setLoading] = useState(false);
  const isHost = activeBooking && profile?.user_id === activeBooking.spots.host_id;

  useEffect(() => {
    if (!user) return;
    
    loadActiveBooking();
    
    // Set up real-time subscription
    const channel = supabase
      .channel('active-bookings')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: isHost 
            ? `spots.host_id=eq.${user.id}`
            : `renter_id=eq.${user.id}`
        },
        () => {
          loadActiveBooking();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, isHost]);

  const loadActiveBooking = async () => {
    if (!user) return;

    const now = new Date().toISOString();
    
    // Check for active bookings (currently happening) - look for active or paid status
    const query = supabase
      .from('bookings')
      .select(`
        id,
        spot_id,
        renter_id,
        start_at,
        end_at,
        status,
        total_amount,
        overstay_detected_at,
        overstay_action,
        overstay_grace_end,
        overstay_charge_amount,
        spots!inner(title, address, host_id, hourly_rate),
        profiles!bookings_renter_id_fkey(first_name, last_name, avatar_url)
      `)
      .in('status', ['active', 'paid'])
      .lte('start_at', now)
      .gte('end_at', now)
      .or(`renter_id.eq.${user.id},spots.host_id.eq.${user.id}`)
      .order('start_at', { ascending: false })
      .limit(1);

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error('Error loading active booking:', error);
      return;
    }

    setActiveBooking(data as ActiveBooking);
  };

  const handleMessage = () => {
    if (!activeBooking) return;
    
    const recipientId = isHost ? activeBooking.renter_id : activeBooking.spots.host_id;
    navigate(`/messages?userId=${recipientId}`);
  };

  const handleMarkOverstay = () => {
    setShowOverstayDialog(true);
  };

  const handleOverstayAction = async (action: 'charging' | 'towing') => {
    if (!activeBooking) return;
    
    setLoading(true);
    
    const now = new Date();
    const graceEnd = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes from now

    const { error } = await supabase
      .from('bookings')
      .update({
        overstay_detected_at: now.toISOString(),
        overstay_action: action,
        overstay_grace_end: graceEnd.toISOString(),
      })
      .eq('id', activeBooking.id);

    if (error) {
      console.error('Error updating overstay:', error);
      toast.error('Failed to update overstay status');
    } else {
      toast.success(
        action === 'charging' 
          ? 'Overstay charging activated. $25/hour will apply after 10-minute grace period.' 
          : 'Towing process initiated. Driver will be notified.'
      );
      setShowOverstayDialog(false);
      loadActiveBooking();
    }
    
    setLoading(false);
  };

  const handleExtendBooking = async () => {
    if (!activeBooking) return;
    
    setLoading(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('extend-booking', {
        body: { 
          bookingId: activeBooking.id, 
          extensionHours 
        }
      });

      if (error) throw error;

      if (data.success) {
        toast.success(data.message || 'Booking extended successfully!');
        setShowExtendDialog(false);
        setExtensionHours(1);
        loadActiveBooking(); // Reload to show updated end time
      } else {
        throw new Error(data.error || 'Failed to extend booking');
      }
    } catch (error) {
      console.error('Error extending booking:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to extend booking');
    }
    
    setLoading(false);
  };

  const getNewEndTime = () => {
    if (!activeBooking) return '';
    return format(addHours(new Date(activeBooking.end_at), extensionHours), 'MMM d, h:mm a');
  };

  const getExtensionCost = () => {
    if (!activeBooking) return 0;
    return activeBooking.spots.hourly_rate * extensionHours;
  };

  if (!activeBooking) return null;

  const endTime = format(new Date(activeBooking.end_at), 'h:mm a');
  const isOverstayed = new Date() > new Date(activeBooking.end_at);
  const hasOverstayCharges = activeBooking.overstay_charge_amount > 0;

  return (
    <>
      <Card className="border-l-4 border-l-primary shadow-md bg-card animate-fade-in">
        <div className="p-3">
          <div className="flex items-center justify-between gap-4">
            {/* Left: Info */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <CarFront className="h-5 w-5 text-primary" />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="font-semibold text-sm truncate">
                    {activeBooking.spots.title}
                  </h3>
                  {isOverstayed && !activeBooking.overstay_action && (
                    <Badge variant="destructive" className="text-xs flex-shrink-0">Overstayed</Badge>
                  )}
                  {activeBooking.overstay_action === 'charging' && (
                    <Badge variant="destructive" className="text-xs flex-shrink-0">Charging</Badge>
                  )}
                </div>
                
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Clock className="h-3 w-3" />
                    <span className="font-medium whitespace-nowrap">
                      {isOverstayed ? `Ended at ${endTime}` : `Ends at ${endTime}`}
                    </span>
                  </div>
                  {isHost && (
                    <>
                      <span className="opacity-60 flex-shrink-0">•</span>
                      <span className="truncate min-w-0">Driver: {activeBooking.profiles.first_name} {activeBooking.profiles.last_name}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {hasOverstayCharges && (
                <div className="px-3 py-1 bg-destructive/10 rounded-md">
                  <p className="text-sm font-semibold text-destructive">
                    +${activeBooking.overstay_charge_amount.toFixed(2)}
                  </p>
                </div>
              )}
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleMessage}
              >
                <MessageCircle className="h-4 w-4" />
              </Button>

              {isHost && !activeBooking.overstay_action && isOverstayed && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleMarkOverstay}
                >
                  <AlertTriangle className="h-4 w-4 mr-1" />
                  Mark Overstay
                </Button>
              )}

              {!isHost && !isOverstayed && (
                <Button
                  size="sm"
                  onClick={() => setShowExtendDialog(true)}
                  disabled={loading}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Extend
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Extend Booking Dialog */}
      <Dialog open={showExtendDialog} onOpenChange={setShowExtendDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Extend Your Parking</DialogTitle>
            <DialogDescription>
              Choose how much time to add to your booking
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((hours) => (
                <Button
                  key={hours}
                  variant={extensionHours === hours ? "default" : "outline"}
                  onClick={() => setExtensionHours(hours)}
                  className="h-20 flex flex-col gap-1"
                >
                  <span className="text-3xl font-bold">{hours}</span>
                  <span className="text-xs opacity-80">hr{hours > 1 ? 's' : ''}</span>
                </Button>
              ))}
            </div>

            <div className="space-y-2 p-4 bg-muted/50 rounded-lg border">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Current end</span>
                <span className="text-sm font-medium">
                  {format(new Date(activeBooking?.end_at || ''), 'h:mm a')}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">New end</span>
                <span className="text-sm font-semibold text-primary">
                  {getNewEndTime()}
                </span>
              </div>
              <div className="pt-2 mt-2 border-t flex justify-between items-center">
                <span className="font-semibold">Total cost</span>
                <span className="text-2xl font-bold text-primary">
                  ${getExtensionCost().toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExtendDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleExtendBooking} disabled={loading}>
              {loading ? 'Processing...' : 'Confirm Extension'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showOverstayDialog} onOpenChange={setShowOverstayDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Driver Overstayed Booking</AlertDialogTitle>
            <AlertDialogDescription>
              The driver has exceeded their booking time. Choose how you'd like to proceed:
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-4 my-4">
            <div className="p-4 border rounded-lg">
              <h4 className="font-semibold mb-2">Charge Premium Rate</h4>
              <p className="text-sm text-muted-foreground">
                Charge $25/hour for overstay time after a 10-minute grace period. 
                The driver will be automatically charged.
              </p>
            </div>
            
            <div className="p-4 border rounded-lg">
              <h4 className="font-semibold mb-2">Request Towing</h4>
              <p className="text-sm text-muted-foreground">
                Initiate towing process. The driver will be notified and 
                premium charging will not apply.
              </p>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="default"
              onClick={() => handleOverstayAction('charging')}
              disabled={loading}
            >
              Charge Premium
            </Button>
            <AlertDialogAction
              onClick={() => handleOverstayAction('towing')}
              disabled={loading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Request Towing
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
