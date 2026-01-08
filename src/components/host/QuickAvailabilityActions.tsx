import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarOff, CalendarCheck, Clock, Loader2, Check, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface Spot {
  id: string;
  title: string;
  address: string;
  hourly_rate: number;
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

  const handleBlockToday = async () => {
    if (selectedSpots.length === 0) return;
    setSaving(true);

    try {
      // Delete any existing overrides for today, then insert blocking override
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
            is_available: false,
            start_time: null,
            end_time: null,
          });

        if (error) throw error;
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
            start_time: '00:00',
            end_time: '23:59',
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
                      <div className="text-xs text-muted-foreground truncate">{spot.address}</div>
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
    </>
  );
};

export default QuickAvailabilityActions;
