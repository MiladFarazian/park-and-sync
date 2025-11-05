import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { MessageCircle, Clock, AlertTriangle, CarFront, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

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
      .gte('end_at', now);

    // Filter by role
    if (profile?.role === 'host') {
      query.eq('spots.host_id', user.id);
    } else {
      query.eq('renter_id', user.id);
    }

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
        body: { bookingId: activeBooking.id, extensionHours: 1 }
      });

      if (error) throw error;

      toast.success('Booking extended by 1 hour');
      loadActiveBooking();
    } catch (error) {
      console.error('Error extending booking:', error);
      toast.error('Failed to extend booking');
    }
    
    setLoading(false);
  };

  if (!activeBooking) return null;

  const timeRemaining = formatDistanceToNow(new Date(activeBooking.end_at), { addSuffix: true });
  const isOverstayed = new Date() > new Date(activeBooking.end_at);
  const hasOverstayCharges = activeBooking.overstay_charge_amount > 0;

  return (
    <>
      <Card className="mb-6 border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10">
        <div className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <CarFront className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-lg">
                  {isHost ? 'Active Booking' : 'Currently Parked'}
                </h3>
                {isOverstayed && !activeBooking.overstay_action && (
                  <Badge variant="destructive" className="ml-2">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Overstayed
                  </Badge>
                )}
                {activeBooking.overstay_action === 'charging' && (
                  <Badge variant="destructive" className="ml-2">
                    <DollarSign className="h-3 w-3 mr-1" />
                    Overstay Charges Active
                  </Badge>
                )}
                {activeBooking.overstay_action === 'towing' && (
                  <Badge variant="destructive" className="ml-2">
                    Towing Requested
                  </Badge>
                )}
              </div>
              
              <p className="text-sm text-muted-foreground mb-1">
                {activeBooking.spots.title}
              </p>
              <p className="text-sm text-muted-foreground mb-3">
                {activeBooking.spots.address}
              </p>

              {isHost && (
                <p className="text-sm font-medium mb-2">
                  Driver: {activeBooking.profiles.first_name} {activeBooking.profiles.last_name}
                </p>
              )}

              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4" />
                <span>
                  {isOverstayed 
                    ? `Ended ${timeRemaining}` 
                    : `Ends ${timeRemaining}`}
                </span>
              </div>

              {hasOverstayCharges && (
                <div className="mt-2 p-2 bg-destructive/10 rounded-md">
                  <p className="text-sm font-semibold text-destructive">
                    Overstay Charges: ${activeBooking.overstay_charge_amount.toFixed(2)}
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleMessage}
              >
                <MessageCircle className="h-4 w-4 mr-1" />
                Message {isHost ? 'Driver' : 'Host'}
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
                  variant="default"
                  size="sm"
                  onClick={handleExtendBooking}
                  disabled={loading}
                >
                  <Clock className="h-4 w-4 mr-1" />
                  Extend 1 Hour
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

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
