import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Check, Clock, Ban, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { format, parseISO, getDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { TimePicker } from '@/components/ui/time-picker';

interface Spot {
  id: string;
  title: string;
  hourly_rate: number;
  address: string;
}

interface AvailabilityRule {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
  custom_rate: number | null;
}

interface CalendarOverride {
  id?: string;
  override_date: string;
  start_time: string | null;
  end_time: string | null;
  is_available: boolean;
  custom_rate: number | null;
}

type AvailabilityMode = 'available' | 'unavailable' | 'custom';

const ManageAvailability = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const dateParam = searchParams.get('date');
  
  const [spots, setSpots] = useState<Spot[]>([]);
  const [selectedSpots, setSelectedSpots] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // Selected date
  const [selectedDate, setSelectedDate] = useState<Date>(
    dateParam ? parseISO(dateParam) : new Date()
  );
  
  // Availability settings
  const [availabilityMode, setAvailabilityMode] = useState<AvailabilityMode>('available');
  const [customStartTime, setCustomStartTime] = useState<Date>(() => {
    const d = new Date();
    d.setHours(9, 0, 0, 0);
    return d;
  });
  const [customEndTime, setCustomEndTime] = useState<Date>(() => {
    const d = new Date();
    d.setHours(17, 0, 0, 0);
    return d;
  });
  
  // Existing availability data per spot
  const [spotAvailability, setSpotAvailability] = useState<Record<string, {
    rules: AvailabilityRule[];
    overrides: CalendarOverride[];
  }>>({});

  useEffect(() => {
    if (user) {
      fetchSpots();
    }
  }, [user]);

  useEffect(() => {
    if (selectedSpots.length > 0 && user) {
      fetchAvailabilityData();
    }
  }, [selectedSpots, selectedDate, user]);

  const fetchSpots = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('spots')
        .select('id, title, hourly_rate, address')
        .eq('host_id', user.id)
        .eq('status', 'active');

      if (error) throw error;
      setSpots(data || []);
      
      // Auto-select all spots by default
      if (data && data.length > 0) {
        setSelectedSpots(data.map(s => s.id));
      }
    } catch (error) {
      console.error('Error fetching spots:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailabilityData = async () => {
    if (!user || selectedSpots.length === 0) return;
    
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const dayOfWeek = getDay(selectedDate);
      
      // Fetch rules and overrides for selected spots
      const availability: Record<string, { rules: AvailabilityRule[]; overrides: CalendarOverride[] }> = {};
      
      for (const spotId of selectedSpots) {
        // Fetch weekly rules for this day
        const { data: rules } = await supabase
          .from('availability_rules')
          .select('day_of_week, start_time, end_time, is_available, custom_rate')
          .eq('spot_id', spotId)
          .eq('day_of_week', dayOfWeek);
        
        // Fetch date override for this date
        const { data: overrides } = await supabase
          .from('calendar_overrides')
          .select('id, override_date, start_time, end_time, is_available, custom_rate')
          .eq('spot_id', spotId)
          .eq('override_date', dateStr);
        
        availability[spotId] = {
          rules: rules || [],
          overrides: overrides || []
        };
      }
      
      setSpotAvailability(availability);
    } catch (error) {
      console.error('Error fetching availability data:', error);
    }
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

  // Get current availability display for a spot
  const getSpotAvailabilityDisplay = (spotId: string): string => {
    const data = spotAvailability[spotId];
    if (!data) return 'Loading...';
    
    // Check for override first
    if (data.overrides.length > 0) {
      const override = data.overrides[0];
      if (!override.is_available) return 'Blocked';
      if (override.start_time && override.end_time) {
        return `${formatTimeDisplay(override.start_time)} - ${formatTimeDisplay(override.end_time)}`;
      }
      return 'Available all day';
    }
    
    // Fall back to weekly rules
    if (data.rules.length > 0) {
      const rule = data.rules[0];
      if (!rule.is_available) return 'Blocked (recurring)';
      return `${formatTimeDisplay(rule.start_time)} - ${formatTimeDisplay(rule.end_time)} (recurring)`;
    }
    
    return 'No schedule set';
  };

  const formatTimeDisplay = (time: string): string => {
    const [hours, minutes] = time.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const handleSave = async () => {
    if (selectedSpots.length === 0) {
      toast({
        title: 'No spots selected',
        description: 'Please select at least one spot to update.',
        variant: 'destructive'
      });
      return;
    }

    setIsSaving(true);
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      
      for (const spotId of selectedSpots) {
        // Delete existing override for this date
        await supabase
          .from('calendar_overrides')
          .delete()
          .eq('spot_id', spotId)
          .eq('override_date', dateStr);
        
        // Create new override based on mode
        const override: {
          spot_id: string;
          override_date: string;
          is_available: boolean;
          start_time: string | null;
          end_time: string | null;
        } = {
          spot_id: spotId,
          override_date: dateStr,
          is_available: availabilityMode !== 'unavailable',
          start_time: null,
          end_time: null
        };
        
        if (availabilityMode === 'custom') {
          override.start_time = format(customStartTime, 'HH:mm:ss');
          override.end_time = format(customEndTime, 'HH:mm:ss');
        }
        
        const { error } = await supabase
          .from('calendar_overrides')
          .insert(override);
        
        if (error) throw error;
      }

      toast({
        title: 'Availability updated',
        description: `${selectedSpots.length} spot${selectedSpots.length > 1 ? 's' : ''} updated for ${format(selectedDate, 'MMMM d, yyyy')}`
      });
      
      navigate('/host-calendar');
    } catch (error) {
      console.error('Error saving availability:', error);
      toast({
        title: 'Error',
        description: 'Failed to save availability changes',
        variant: 'destructive'
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="p-4">
        <Card className="p-6 text-center">
          <p className="text-muted-foreground">Please sign in to manage availability.</p>
          <Button onClick={() => navigate('/auth')} className="mt-4">Sign In</Button>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/host-calendar')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Manage Availability</h1>
            <p className="text-sm text-muted-foreground">
              {format(selectedDate, 'EEEE, MMMM d, yyyy')}
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Section 1: Spot Selection */}
        <section>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm">1</span>
            Select Spots
          </h2>
          
          {spots.length === 0 ? (
            <Card className="p-6 text-center">
              <p className="text-muted-foreground mb-4">You don't have any active spots.</p>
              <Button onClick={() => navigate('/list-spot')}>List a Spot</Button>
            </Card>
          ) : (
            <div className="space-y-2">
              {/* Select All */}
              {spots.length > 1 && (
                <div 
                  className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer active:bg-accent/50 transition-colors"
                  onClick={toggleAll}
                >
                  <Checkbox 
                    checked={selectedSpots.length === spots.length}
                    onCheckedChange={toggleAll}
                  />
                  <span className="font-medium">
                    {selectedSpots.length === spots.length ? 'Deselect All' : 'Select All Spots'}
                  </span>
                </div>
              )}

              {/* Spots List */}
              {spots.map(spot => (
                <Card 
                  key={spot.id}
                  className={cn(
                    "p-4 cursor-pointer transition-colors",
                    selectedSpots.includes(spot.id) 
                      ? "border-primary bg-primary/5" 
                      : "active:bg-accent/50"
                  )}
                  onClick={() => toggleSpot(spot.id)}
                >
                  <div className="flex items-center gap-3">
                    <Checkbox 
                      checked={selectedSpots.includes(spot.id)}
                      onCheckedChange={() => toggleSpot(spot.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{spot.title}</div>
                      <div className="text-sm text-muted-foreground truncate">
                        ${spot.hourly_rate}/hr
                      </div>
                      {/* Show current availability */}
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {getSpotAvailabilityDisplay(spot.id)}
                      </div>
                    </div>
                    {selectedSpots.includes(spot.id) && (
                      <Check className="h-5 w-5 text-primary" />
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Section 2: Calendar */}
        <section>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm">2</span>
            Select Date
          </h2>
          
          <Card className="p-4">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
              className="rounded-md border-0 mx-auto pointer-events-auto"
              disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
            />
          </Card>
        </section>

        {/* Section 3: Availability Mode */}
        <section>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm">3</span>
            Set Availability
          </h2>
          
          <Card className="p-4 space-y-4">
            <RadioGroup 
              value={availabilityMode} 
              onValueChange={(v) => setAvailabilityMode(v as AvailabilityMode)}
              className="space-y-3"
            >
              {/* Available All Day */}
              <div 
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                  availabilityMode === 'available' && "border-green-500 bg-green-500/10"
                )}
                onClick={() => setAvailabilityMode('available')}
              >
                <RadioGroupItem value="available" id="available" />
                <Label htmlFor="available" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-600" />
                    <span className="font-medium">Available All Day</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    The spot will be available for the entire day
                  </p>
                </Label>
              </div>

              {/* Unavailable */}
              <div 
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                  availabilityMode === 'unavailable' && "border-destructive bg-destructive/10"
                )}
                onClick={() => setAvailabilityMode('unavailable')}
              >
                <RadioGroupItem value="unavailable" id="unavailable" />
                <Label htmlFor="unavailable" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Ban className="h-4 w-4 text-destructive" />
                    <span className="font-medium">Unavailable</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Block this date from bookings
                  </p>
                </Label>
              </div>

              {/* Custom Hours */}
              <div 
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                  availabilityMode === 'custom' && "border-primary bg-primary/10"
                )}
                onClick={() => setAvailabilityMode('custom')}
              >
                <RadioGroupItem value="custom" id="custom" className="mt-1" />
                <Label htmlFor="custom" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Settings2 className="h-4 w-4 text-primary" />
                    <span className="font-medium">Custom Hours</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Set specific hours for this date
                  </p>
                </Label>
              </div>
            </RadioGroup>

            {/* Custom Hours Time Pickers */}
            {availabilityMode === 'custom' && (
              <div className="pt-4 border-t space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start Time</Label>
                    <TimePicker 
                      date={customStartTime} 
                      setDate={setCustomStartTime}
                    >
                      <Button variant="outline" className="w-full justify-start">
                        <Clock className="h-4 w-4 mr-2" />
                        {format(customStartTime, 'h:mm a')}
                      </Button>
                    </TimePicker>
                  </div>
                  <div className="space-y-2">
                    <Label>End Time</Label>
                    <TimePicker 
                      date={customEndTime} 
                      setDate={setCustomEndTime}
                    >
                      <Button variant="outline" className="w-full justify-start">
                        <Clock className="h-4 w-4 mr-2" />
                        {format(customEndTime, 'h:mm a')}
                      </Button>
                    </TimePicker>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  The spot will only be available during these hours on {format(selectedDate, 'MMMM d')}
                </p>
              </div>
            )}
          </Card>
        </section>
      </div>

      {/* Fixed Bottom Save Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t safe-area-inset-bottom">
        <Button 
          className="w-full" 
          size="lg"
          disabled={selectedSpots.length === 0 || isSaving}
          onClick={handleSave}
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Saving...
            </>
          ) : (
            `Save Changes for ${selectedSpots.length} Spot${selectedSpots.length !== 1 ? 's' : ''}`
          )}
        </Button>
      </div>
    </div>
  );
};

export default ManageAvailability;
