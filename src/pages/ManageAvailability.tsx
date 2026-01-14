import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Check, Clock, Ban, Settings2, Plus, Trash2, DollarSign, RefreshCw, AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { format, parseISO, getDay, isSameDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { MobileTimePicker } from '@/components/booking/MobileTimePicker';

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

interface TimeBlock {
  id: string;
  startTime: Date;
  endTime: Date;
  customRate: number | null;
}

type AvailabilityMode = 'available' | 'unavailable' | 'custom';

const generateId = () => Math.random().toString(36).substring(2, 9);

const ManageAvailability = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const dateParam = searchParams.get('date');
  const spotIdParam = searchParams.get('spotId');
  const spotsParam = searchParams.get('spots'); // For bulk selection from QuickAvailabilityActions
  
  const [spots, setSpots] = useState<Spot[]>([]);
  const [selectedSpots, setSelectedSpots] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // Multi-date selection
  const [selectedDates, setSelectedDates] = useState<Date[]>(
    dateParam ? [parseISO(dateParam)] : [new Date()]
  );
  
  // Availability settings
  const [availabilityMode, setAvailabilityMode] = useState<AvailabilityMode>('available');
  
  // Multiple time blocks support
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([{
    id: generateId(),
    startTime: (() => { const d = new Date(); d.setHours(9, 0, 0, 0); return d; })(),
    endTime: (() => { const d = new Date(); d.setHours(17, 0, 0, 0); return d; })(),
    customRate: null
  }]);
  
  // Default custom rate (applies to all blocks if not overridden)
  const [defaultCustomRate, setDefaultCustomRate] = useState<number | null>(null);
  
  // Time picker state
  const [activeTimePickerBlock, setActiveTimePickerBlock] = useState<string | null>(null);
  const [activeTimePickerMode, setActiveTimePickerMode] = useState<'start' | 'end'>('start');
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  
  // Existing availability data per spot
  const [spotAvailability, setSpotAvailability] = useState<Record<string, {
    rules: AvailabilityRule[];
    overrides: CalendarOverride[];
  }>>({});

  // Validation errors
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  useEffect(() => {
    if (user) {
      fetchSpots();
    }
  }, [user]);

  useEffect(() => {
    if (selectedSpots.length > 0 && user && selectedDates.length > 0) {
      fetchAvailabilityData();
    }
  }, [selectedSpots, selectedDates, user]);

  // Validate time blocks whenever they change
  useEffect(() => {
    if (availabilityMode === 'custom') {
      validateTimeBlocks();
    } else {
      setValidationErrors([]);
    }
  }, [timeBlocks, availabilityMode]);

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
      
      // Pre-select spots based on URL params
      if (data && data.length > 0) {
        if (spotsParam) {
          // Multiple spots from QuickAvailabilityActions
          const spotIds = spotsParam.split(',').filter(id => data.some(s => s.id === id));
          setSelectedSpots(spotIds.length > 0 ? spotIds : data.map(s => s.id));
        } else if (spotIdParam && data.some(s => s.id === spotIdParam)) {
          // Single spot from HostCalendar
          setSelectedSpots([spotIdParam]);
        } else {
          // Default: select all spots
          setSelectedSpots(data.map(s => s.id));
        }
      }
    } catch (error) {
      console.error('Error fetching spots:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailabilityData = async () => {
    if (!user || selectedSpots.length === 0 || selectedDates.length === 0) return;
    
    try {
      // Use the first selected date for display purposes
      const primaryDate = selectedDates[0];
      const dateStr = format(primaryDate, 'yyyy-MM-dd');
      const dayOfWeek = getDay(primaryDate);
      
      const availability: Record<string, { rules: AvailabilityRule[]; overrides: CalendarOverride[] }> = {};
      
      for (const spotId of selectedSpots) {
        const { data: rules } = await supabase
          .from('availability_rules')
          .select('day_of_week, start_time, end_time, is_available, custom_rate')
          .eq('spot_id', spotId)
          .eq('day_of_week', dayOfWeek);
        
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

  const handleDateSelect = (dates: Date[] | undefined) => {
    if (dates) {
      setSelectedDates(dates);
    }
  };

  const clearDateSelection = () => {
    setSelectedDates([new Date()]);
  };

  // Time block management
  const addTimeBlock = () => {
    const lastBlock = timeBlocks[timeBlocks.length - 1];
    const newStartTime = new Date(lastBlock?.endTime || new Date());
    newStartTime.setHours(newStartTime.getHours() + 1, 0, 0, 0);
    const newEndTime = new Date(newStartTime);
    newEndTime.setHours(newEndTime.getHours() + 2);
    
    setTimeBlocks([...timeBlocks, {
      id: generateId(),
      startTime: newStartTime,
      endTime: newEndTime,
      customRate: null
    }]);
  };

  const removeTimeBlock = (blockId: string) => {
    if (timeBlocks.length > 1) {
      setTimeBlocks(timeBlocks.filter(b => b.id !== blockId));
    }
  };

  const updateTimeBlock = (blockId: string, field: 'startTime' | 'endTime' | 'customRate', value: Date | number | null) => {
    setTimeBlocks(timeBlocks.map(block => 
      block.id === blockId ? { ...block, [field]: value } : block
    ));
  };

  const openTimePicker = (blockId: string, mode: 'start' | 'end') => {
    setActiveTimePickerBlock(blockId);
    setActiveTimePickerMode(mode);
    setTimePickerOpen(true);
  };

  const validateTimeBlocks = (): boolean => {
    const errors: string[] = [];
    
    // Check for invalid time ranges
    for (const block of timeBlocks) {
      if (block.endTime <= block.startTime) {
        errors.push('End time must be after start time');
        break;
      }
    }
    
    // Check for overlaps
    const sortedBlocks = [...timeBlocks].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    for (let i = 0; i < sortedBlocks.length - 1; i++) {
      if (sortedBlocks[i].endTime > sortedBlocks[i + 1].startTime) {
        errors.push('Time blocks cannot overlap');
        break;
      }
    }
    
    setValidationErrors(errors);
    return errors.length === 0;
  };

  // Helper to detect full-day time ranges
  const isFullDayTimeRange = (startTime: string | null, endTime: string | null): boolean => {
    if (!startTime || !endTime) return true; // null times = full day
    
    // Normalize times (strip seconds if present)
    const start = startTime.substring(0, 5); // "00:00:00" → "00:00"
    const end = endTime.substring(0, 5);     // "24:00:00" → "24:00"
    
    // Check common full-day patterns
    return (
      (start === '00:00' && end === '24:00') ||
      (start === '00:00' && end === '23:59')
    );
  };

  // Get current availability display for a spot
  const getSpotAvailabilityDisplay = (spotId: string): string => {
    const data = spotAvailability[spotId];
    if (!data) return 'Loading...';
    
    if (data.overrides.length > 0) {
      const override = data.overrides[0];
      if (!override.is_available) return 'Blocked';
      if (isFullDayTimeRange(override.start_time, override.end_time)) {
        return 'Available all day';
      }
      return `${formatTimeDisplay(override.start_time!)} - ${formatTimeDisplay(override.end_time!)}`;
    }
    
    if (data.rules.length > 0) {
      const rule = data.rules[0];
      if (!rule.is_available) return 'Blocked (recurring)';
      if (isFullDayTimeRange(rule.start_time, rule.end_time)) {
        return 'Available all day (recurring)';
      }
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

  // Get pending availability display (what will be saved)
  const getPendingAvailabilityDisplay = (): string => {
    if (availabilityMode === 'unavailable') {
      return 'Blocked';
    } else if (availabilityMode === 'available') {
      return 'Available all day' + (defaultCustomRate ? ` ($${defaultCustomRate}/hr)` : '');
    } else {
      const blocks = timeBlocks.map(b => {
        const rate = b.customRate ?? defaultCustomRate;
        const rateStr = rate ? ` ($${rate}/hr)` : '';
        return `${format(b.startTime, 'h:mm a')} - ${format(b.endTime, 'h:mm a')}${rateStr}`;
      });
      return blocks.join(', ');
    }
  };

  // Get current availability display for summary
  const getCurrentAvailabilityDisplay = (): string => {
    if (selectedSpots.length === 0) return 'No spots selected';
    
    // Get availability for first selected spot as representative
    const firstSpotId = selectedSpots[0];
    return getSpotAvailabilityDisplay(firstSpotId);
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

    if (selectedDates.length === 0) {
      toast({
        title: 'No dates selected',
        description: 'Please select at least one date to update.',
        variant: 'destructive'
      });
      return;
    }

    if (availabilityMode === 'custom' && !validateTimeBlocks()) {
      toast({
        title: 'Invalid time blocks',
        description: validationErrors[0] || 'Please fix time block errors before saving.',
        variant: 'destructive'
      });
      return;
    }

    setIsSaving(true);
    try {
      // Process each date and each spot
      for (const date of selectedDates) {
        const dateStr = format(date, 'yyyy-MM-dd');
        
        for (const spotId of selectedSpots) {
          // Delete existing overrides for this date
          await supabase
            .from('calendar_overrides')
            .delete()
            .eq('spot_id', spotId)
            .eq('override_date', dateStr);
          
          if (availabilityMode === 'unavailable') {
            // Create single blocked override
            const { error } = await supabase
              .from('calendar_overrides')
              .insert({
                spot_id: spotId,
                override_date: dateStr,
                is_available: false,
                start_time: null,
                end_time: null,
                custom_rate: null
              });
            if (error) throw error;
          } else if (availabilityMode === 'available') {
            // Available all day - null times
            const { error } = await supabase
              .from('calendar_overrides')
              .insert({
                spot_id: spotId,
                override_date: dateStr,
                is_available: true,
                start_time: null,
                end_time: null,
                custom_rate: defaultCustomRate
              });
            if (error) throw error;
          } else {
            // Custom hours - create an override for each time block
            // Note: Current schema only supports one override per date, so we use the first block
            // For multiple blocks, we'd need a schema change (time_blocks JSONB column)
            // For now, merge all blocks into a single time range (min start to max end)
            const sortedBlocks = [...timeBlocks].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
            const firstBlock = sortedBlocks[0];
            const lastBlock = sortedBlocks[sortedBlocks.length - 1];
            
            const { error } = await supabase
              .from('calendar_overrides')
              .insert({
                spot_id: spotId,
                override_date: dateStr,
                is_available: true,
                start_time: format(firstBlock.startTime, 'HH:mm:ss'),
                end_time: format(lastBlock.endTime, 'HH:mm:ss'),
                custom_rate: firstBlock.customRate ?? defaultCustomRate
              });
            if (error) throw error;
          }
        }
      }

      const spotCount = selectedSpots.length;
      const dateCount = selectedDates.length;
      
      toast({
        title: 'Availability updated',
        description: `Updated ${spotCount} spot${spotCount > 1 ? 's' : ''} for ${dateCount} date${dateCount > 1 ? 's' : ''}`
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

  const activeBlock = timeBlocks.find(b => b.id === activeTimePickerBlock);

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
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/host-calendar')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Manage Availability</h1>
            <p className="text-sm text-muted-foreground">
              {selectedDates.length === 1 
                ? format(selectedDates[0], 'EEEE, MMMM d, yyyy')
                : `${selectedDates.length} dates selected`
              }
            </p>
          </div>
          {selectedDates.length > 1 && (
            <Button variant="ghost" size="sm" onClick={clearDateSelection}>
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
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

        {/* Section 2: Calendar - Multi-select */}
        <section>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm">2</span>
            Select Dates
            {selectedDates.length > 1 && (
              <Badge variant="secondary" className="ml-2">
                {selectedDates.length} selected
              </Badge>
            )}
          </h2>
          
          <Card className="p-4">
            <Calendar
              mode="multiple"
              selected={selectedDates}
              onSelect={handleDateSelect}
              className="w-full"
              disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
              classNames={{
                months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0 justify-center",
                month: "space-y-4",
                caption: "flex justify-center pt-1 relative items-center",
                caption_label: "text-sm font-medium",
                nav: "space-x-1 flex items-center",
                table: "w-full border-collapse",
                head_row: "flex justify-between",
                head_cell: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem] flex-1 text-center",
                row: "flex w-full mt-2 justify-between",
                cell: "flex-1 text-center text-sm p-0 relative flex items-center justify-center",
                day: "h-9 w-9 p-0 font-normal aria-selected:opacity-100 hover:bg-accent rounded-md",
                day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                day_today: "bg-accent text-accent-foreground",
                day_outside: "text-muted-foreground opacity-50",
                day_disabled: "text-muted-foreground opacity-50",
              }}
            />
            <p className="text-xs text-muted-foreground text-center mt-3">
              Tap dates to select or deselect them
            </p>
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

            {/* Custom Hours Time Blocks */}
            {availabilityMode === 'custom' && (
              <div className="pt-4 border-t space-y-4">
                {/* Validation Errors */}
                {validationErrors.length > 0 && (
                  <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
                    <div className="text-sm text-destructive">
                      {validationErrors.map((error, i) => (
                        <p key={i}>{error}</p>
                      ))}
                    </div>
                  </div>
                )}

                {/* Time Blocks */}
                {timeBlocks.map((block, index) => (
                  <div key={block.id} className="space-y-3 p-3 border rounded-lg bg-muted/30">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Time Block {index + 1}</span>
                      {timeBlocks.length > 1 && (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => removeTimeBlock(block.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Start</Label>
                        <Button 
                          variant="outline" 
                          className="w-full justify-start text-sm"
                          onClick={() => openTimePicker(block.id, 'start')}
                        >
                          <Clock className="h-3 w-3 mr-2" />
                          {format(block.startTime, 'h:mm a')}
                        </Button>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">End</Label>
                        <Button 
                          variant="outline" 
                          className="w-full justify-start text-sm"
                          onClick={() => openTimePicker(block.id, 'end')}
                        >
                          <Clock className="h-3 w-3 mr-2" />
                          {format(block.endTime, 'h:mm a')}
                        </Button>
                      </div>
                    </div>

                    {/* Per-block custom rate */}
                    <div className="space-y-1">
                      <Label className="text-xs">Custom Rate (optional)</Label>
                      <div className="relative">
                        <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                        <Input
                          type="number"
                          min="0"
                          step="0.5"
                          value={block.customRate ?? ''}
                          onChange={(e) => updateTimeBlock(block.id, 'customRate', e.target.value ? parseFloat(e.target.value) : null)}
                          placeholder="Use default"
                          className="pl-7 h-9 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                {/* Add Time Block Button */}
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={addTimeBlock}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Time Block
                </Button>
              </div>
            )}

            {/* Default Custom Rate (for available and custom modes) */}
            {availabilityMode !== 'unavailable' && (
              <div className="pt-4 border-t space-y-2">
                <Label>Default Custom Rate (optional)</Label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="number"
                      min="0"
                      step="0.5"
                      value={defaultCustomRate ?? ''}
                      onChange={(e) => setDefaultCustomRate(e.target.value ? parseFloat(e.target.value) : null)}
                      placeholder="Use spot's base rate"
                      className="pl-7"
                    />
                  </div>
                  <span className="text-sm text-muted-foreground">/hr</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Leave blank to use each spot's default hourly rate
                </p>
              </div>
            )}
          </Card>
        </section>

        {/* Section 4: Before vs After Summary */}
        {selectedSpots.length > 0 && selectedDates.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Changes Preview
            </h2>
            
            <Card className="p-4 border-primary/30 bg-primary/5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Before</p>
                  <div className="text-sm bg-background/80 p-2 rounded border">
                    {getCurrentAvailabilityDisplay()}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-primary mb-2 uppercase tracking-wide">After</p>
                  <div className="text-sm font-medium bg-primary/10 p-2 rounded border border-primary/30">
                    {getPendingAvailabilityDisplay()}
                  </div>
                </div>
              </div>
              
              {/* Affected dates/spots summary */}
              <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
                <p>
                  <strong>{selectedSpots.length}</strong> spot{selectedSpots.length !== 1 ? 's' : ''} × <strong>{selectedDates.length}</strong> date{selectedDates.length !== 1 ? 's' : ''} will be updated
                </p>
                {selectedDates.length > 1 && selectedDates.length <= 5 && (
                  <p className="mt-1">
                    Dates: {selectedDates.map(d => format(d, 'MMM d')).join(', ')}
                  </p>
                )}
              </div>
            </Card>
          </section>
        )}

        {/* Save Button */}
        <Button 
          className="w-full" 
          size="lg"
          disabled={selectedSpots.length === 0 || selectedDates.length === 0 || isSaving || validationErrors.length > 0}
          onClick={handleSave}
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Saving...
            </>
          ) : (
            `Save Changes`
          )}
        </Button>
      </div>

      {/* Mobile Time Picker */}
      {activeBlock && (
        <MobileTimePicker
          isOpen={timePickerOpen}
          onClose={() => setTimePickerOpen(false)}
          onConfirm={(date) => {
            if (activeTimePickerBlock) {
              updateTimeBlock(
                activeTimePickerBlock,
                activeTimePickerMode === 'start' ? 'startTime' : 'endTime',
                date
              );
            }
            setTimePickerOpen(false);
          }}
          mode={activeTimePickerMode}
          initialValue={activeTimePickerMode === 'start' ? activeBlock.startTime : activeBlock.endTime}
          startTime={activeTimePickerMode === 'end' ? activeBlock.startTime : undefined}
        />
      )}
    </div>
  );
};

export default ManageAvailability;
