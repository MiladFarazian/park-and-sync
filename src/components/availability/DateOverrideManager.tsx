import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Calendar as CalendarIcon, Trash2, X, ChevronLeft, ChevronRight, DollarSign, MousePointer, ArrowLeftRight, Ban, CalendarRange, Sparkles } from 'lucide-react';
import { format, isBefore, startOfDay, addMonths, startOfMonth, endOfMonth, getDay, addDays, eachDayOfInterval, parseISO, isWeekend, isSaturday, isSunday } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { AvailabilityTimePicker } from './AvailabilityTimePicker';

export interface DateOverride {
  id?: string;
  override_date: string;
  start_time?: string;
  end_time?: string;
  is_available: boolean;
  custom_rate?: number | null;
}

interface DateOverrideManagerProps {
  initialOverrides?: DateOverride[];
  onChange?: (overrides: DateOverride[]) => void;
  baseRate?: number;
}

type SelectionMode = 'click' | 'range';

export const DateOverrideManager = ({ 
  initialOverrides = [], 
  onChange,
  baseRate = 0
}: DateOverrideManagerProps) => {
  // Group by date for internal management
  const groupByDate = (overrides: DateOverride[]) => {
    const grouped: Record<string, {
      is_available: boolean;
      start_time?: string;
      end_time?: string;
      custom_rate?: number | null;
    }> = {};
    overrides.forEach(override => {
      grouped[override.override_date] = {
        is_available: override.is_available,
        start_time: override.start_time,
        end_time: override.end_time,
        custom_rate: override.custom_rate
      };
    });
    return grouped;
  };

  const [overrides, setOverrides] = useState(groupByDate(initialOverrides));
  const [previewMonth, setPreviewMonth] = useState<Date>(new Date());
  
  // Selection mode: click (toggle individual) or range (start → end)
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('click');
  
  // Multi-select: selected dates for batch editing
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  
  // Range selection state
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  
  // Form state for the selected date(s)
  const [isAvailable, setIsAvailable] = useState(true);
  const [useCustomHours, setUseCustomHours] = useState(false);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [customRate, setCustomRate] = useState<number | null>(null);

  // Get blocked and available date sets for calendar display
  const { blockedDateSet, availableDateSet } = useMemo(() => {
    const blocked = new Set<string>();
    const available = new Set<string>();
    
    Object.entries(overrides).forEach(([date, data]) => {
      if (data.is_available) {
        available.add(date);
      } else {
        blocked.add(date);
      }
    });
    
    return { blockedDateSet: blocked, availableDateSet: available };
  }, [overrides]);

  // Generate calendar grid
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(previewMonth);
    const monthEnd = endOfMonth(previewMonth);
    const startDay = getDay(monthStart);
    
    const days: { date: Date; isCurrentMonth: boolean }[] = [];
    
    for (let i = startDay - 1; i >= 0; i--) {
      days.push({
        date: addDays(monthStart, -i - 1),
        isCurrentMonth: false
      });
    }
    days.reverse();
    
    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
    daysInMonth.forEach(date => {
      days.push({ date, isCurrentMonth: true });
    });
    
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        date: addDays(monthEnd, i),
        isCurrentMonth: false
      });
    }
    
    return days;
  }, [previewMonth]);

  // Sync overrides to parent
  useEffect(() => {
    const result: DateOverride[] = [];
    Object.entries(overrides).forEach(([date, data]) => {
      result.push({
        override_date: date,
        start_time: data.start_time,
        end_time: data.end_time,
        is_available: data.is_available,
        custom_rate: data.custom_rate
      });
    });
    onChange?.(result);
  }, [overrides, onChange]);

  // Handle date click based on selection mode
  const handleDateClick = (dateStr: string) => {
    if (selectionMode === 'click') {
      // Toggle individual date selection
      setSelectedDates(prev => {
        const newSet = new Set(prev);
        if (newSet.has(dateStr)) {
          newSet.delete(dateStr);
        } else {
          newSet.add(dateStr);
        }
        return newSet;
      });
    } else {
      // Range mode
      if (!rangeStart) {
        // First click: set range start
        setRangeStart(dateStr);
        setSelectedDates(new Set([dateStr]));
      } else {
        // Second click: complete the range
        const start = parseISO(rangeStart);
        const end = parseISO(dateStr);
        
        // Ensure start is before end
        const [rangeStartDate, rangeEndDate] = isBefore(start, end) ? [start, end] : [end, start];
        
        // Get all dates in range (excluding past dates)
        const today = startOfDay(new Date());
        const datesInRange = eachDayOfInterval({ start: rangeStartDate, end: rangeEndDate })
          .filter(date => !isBefore(date, today))
          .map(date => format(date, 'yyyy-MM-dd'));
        
        setSelectedDates(new Set(datesInRange));
        setRangeStart(null);
        
        if (datesInRange.length > 0) {
          toast.success(`Selected ${datesInRange.length} dates`);
        }
      }
    }
  };

  // Clear all selections
  const clearSelection = () => {
    setSelectedDates(new Set());
    setRangeStart(null);
    setIsAvailable(true);
    setUseCustomHours(false);
    setStartTime('09:00');
    setEndTime('17:00');
    setCustomRate(null);
  };

  // Switch selection mode
  const switchMode = (mode: SelectionMode) => {
    setSelectionMode(mode);
    clearSelection();
  };

  // Preset quick actions
  const applyPreset = (preset: 'next7' | 'weekendsMonth' | 'weekdaysMonth') => {
    const today = startOfDay(new Date());
    let dates: Date[] = [];
    
    switch (preset) {
      case 'next7':
        // Next 7 days starting from today
        dates = eachDayOfInterval({ 
          start: today, 
          end: addDays(today, 6) 
        });
        break;
      case 'weekendsMonth':
        // All weekends in the current preview month
        const monthStart = startOfMonth(previewMonth);
        const monthEnd = endOfMonth(previewMonth);
        dates = eachDayOfInterval({ start: monthStart, end: monthEnd })
          .filter(date => isWeekend(date) && !isBefore(date, today));
        break;
      case 'weekdaysMonth':
        // All weekdays (Mon-Fri) in the current preview month
        const mStart = startOfMonth(previewMonth);
        const mEnd = endOfMonth(previewMonth);
        dates = eachDayOfInterval({ start: mStart, end: mEnd })
          .filter(date => !isWeekend(date) && !isBefore(date, today));
        break;
    }
    
    if (dates.length === 0) {
      toast.error('No applicable dates found');
      return;
    }
    
    const dateStrings = dates.map(d => format(d, 'yyyy-MM-dd'));
    setSelectedDates(new Set(dateStrings));
    setIsAvailable(false); // Default to blocking for presets
    setUseCustomHours(false);
    toast.success(`Selected ${dateStrings.length} dates`);
  };

  // Save the current form state for all selected dates
  const saveOverrides = () => {
    if (selectedDates.size === 0) return;
    
    setOverrides(prev => {
      const newOverrides = { ...prev };
      selectedDates.forEach(dateStr => {
        newOverrides[dateStr] = {
          is_available: isAvailable,
          start_time: useCustomHours ? startTime : undefined,
          end_time: useCustomHours ? endTime : undefined,
          custom_rate: isAvailable ? customRate : null
        };
      });
      return newOverrides;
    });
    
    const count = selectedDates.size;
    toast.success(`${count} date${count > 1 ? 's' : ''} ${isAvailable ? 'marked as available' : 'blocked'}`);
    clearSelection();
  };

  // Remove overrides for all selected dates
  const removeSelectedOverrides = () => {
    if (selectedDates.size === 0) return;
    
    setOverrides(prev => {
      const newOverrides = { ...prev };
      selectedDates.forEach(dateStr => {
        delete newOverrides[dateStr];
      });
      return newOverrides;
    });
    
    const count = selectedDates.size;
    toast.success(`${count} override${count > 1 ? 's' : ''} removed`);
    clearSelection();
  };

  // Remove a single override
  const removeOverride = (dateStr: string) => {
    const newOverrides = { ...overrides };
    delete newOverrides[dateStr];
    setOverrides(newOverrides);
    toast.success('Override removed');
    setSelectedDates(prev => {
      const newSet = new Set(prev);
      newSet.delete(dateStr);
      return newSet;
    });
  };

  const sortedDates = Object.keys(overrides).sort();
  const selectedDatesArray = Array.from(selectedDates).sort();
  const hasSelection = selectedDates.size > 0;

  // Check if any selected dates have existing overrides
  const selectedHaveOverrides = selectedDatesArray.some(date => overrides[date]);

  // Check if a date is in the pending range (between rangeStart and hovered date)
  const isInPendingRange = (dateStr: string) => {
    if (!rangeStart || selectionMode !== 'range') return false;
    return selectedDates.has(dateStr);
  };

  return (
    <div className="space-y-4">
      {/* Selection Mode Toggle */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant={selectionMode === 'click' ? 'default' : 'outline'}
          size="sm"
          onClick={() => switchMode('click')}
          className="flex-1"
        >
          <MousePointer className="h-4 w-4 mr-1.5" />
          Click to Select
        </Button>
        <Button
          type="button"
          variant={selectionMode === 'range' ? 'default' : 'outline'}
          size="sm"
          onClick={() => switchMode('range')}
          className="flex-1"
        >
          <ArrowLeftRight className="h-4 w-4 mr-1.5" />
          Select Range
        </Button>
      </div>

      {/* Quick Presets */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground shrink-0">Quick:</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => applyPreset('next7')}
          className="h-7 text-xs px-2 flex-1"
        >
          <Ban className="h-3 w-3 sm:mr-1 shrink-0" />
          <span className="hidden sm:inline">Next </span>7 Days
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => applyPreset('weekendsMonth')}
          className="h-7 text-xs px-2 flex-1"
        >
          <CalendarRange className="h-3 w-3 sm:mr-1 shrink-0" />
          <span className="hidden sm:inline">Weekends</span>
          <span className="sm:hidden">Wknd</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => applyPreset('weekdaysMonth')}
          className="h-7 text-xs px-2 flex-1"
        >
          <Sparkles className="h-3 w-3 sm:mr-1 shrink-0" />
          <span className="hidden sm:inline">Weekdays</span>
          <span className="sm:hidden">M-F</span>
        </Button>
      </div>

      {/* Calendar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPreviewMonth(addMonths(previewMonth, -1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-[120px] text-center">
                {format(previewMonth, 'MMMM yyyy')}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPreviewMonth(addMonths(previewMonth, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              {rangeStart && selectionMode === 'range' && (
                <Badge variant="outline" className="text-xs">
                  Start: {format(parseISO(rangeStart), 'MMM d')}
                </Badge>
              )}
              {hasSelection && (
                <Badge variant="secondary" className="text-xs">
                  {selectedDates.size} selected
                </Badge>
              )}
            </div>
          </div>
          
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
              <div key={i} className="text-xs text-muted-foreground text-center font-medium py-1">
                {day}
              </div>
            ))}
          </div>
          
          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map(({ date, isCurrentMonth }, index) => {
              const dateStr = format(date, 'yyyy-MM-dd');
              const isBlocked = blockedDateSet.has(dateStr);
              const isAvailableOverride = availableDateSet.has(dateStr);
              const isPast = isBefore(date, startOfDay(new Date()));
              const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
              const isSelected = selectedDates.has(dateStr);
              const isRangeStart = rangeStart === dateStr;
              const isClickable = isCurrentMonth && !isPast;
              
              return (
                <button
                  key={index}
                  type="button"
                  disabled={!isClickable}
                  onClick={() => isClickable && handleDateClick(dateStr)}
                  className={cn(
                    "aspect-square flex items-center justify-center text-sm rounded-md transition-all",
                    !isCurrentMonth && "opacity-30",
                    isPast && "opacity-40 cursor-not-allowed",
                    isToday && "ring-1 ring-primary ring-offset-1 ring-offset-background",
                    isSelected && "ring-2 ring-primary bg-primary/10",
                    isRangeStart && "ring-2 ring-primary",
                    !isSelected && isBlocked && "bg-destructive/20",
                    !isSelected && isAvailableOverride && "bg-green-500/20",
                    isClickable && !isBlocked && !isAvailableOverride && !isSelected && "hover:bg-muted cursor-pointer"
                  )}
                >
                  <span className={cn(
                    "w-7 h-7 flex items-center justify-center rounded-full text-xs",
                    !isSelected && isBlocked && "bg-destructive text-destructive-foreground font-medium",
                    !isSelected && isAvailableOverride && "bg-green-500 text-white font-medium",
                    isSelected && "bg-primary text-primary-foreground font-medium",
                    isRangeStart && !isSelected && "bg-primary/50 text-primary-foreground font-medium"
                  )}>
                    {format(date, 'd')}
                  </span>
                </button>
              );
            })}
          </div>
          
          {/* Legend */}
          <div className="flex items-center justify-end gap-4 pt-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-primary" />
              Selected
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
              Available
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-destructive" />
              Unavailable
            </div>
          </div>
          
          {/* Selection hint */}
          {!hasSelection && !rangeStart && (
            <p className="text-xs text-muted-foreground text-center pt-2">
              {selectionMode === 'click' 
                ? 'Click dates to toggle selection'
                : 'Click a start date, then click an end date'
              }
            </p>
          )}
          {selectionMode === 'range' && rangeStart && (
            <p className="text-xs text-primary text-center pt-2 font-medium">
              Now click an end date to complete the range
            </p>
          )}
        </CardContent>
      </Card>

      {/* Selected Dates Editor */}
      {hasSelection && !rangeStart && (
        <Card className="border-primary/50">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">
                  {selectedDates.size === 1 
                    ? format(new Date(selectedDatesArray[0] + 'T00:00:00'), 'MMM d, yyyy')
                    : `${selectedDates.size} dates selected`
                  }
                </h3>
                {selectedDates.size > 1 && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {selectedDatesArray.slice(0, 3).map(d => format(new Date(d + 'T00:00:00'), 'MMM d')).join(', ')}
                    {selectedDates.size > 3 && ` +${selectedDates.size - 3} more`}
                  </p>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearSelection}
              >
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            </div>

            {/* Entire Day Toggle */}
            <div className="space-y-3">
              <Label className="text-sm text-muted-foreground">Entire Day</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={isAvailable && !useCustomHours ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    setIsAvailable(true);
                    setUseCustomHours(false);
                  }}
                >
                  Available
                </Button>
                <Button
                  type="button"
                  variant={!isAvailable && !useCustomHours ? "destructive" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    setIsAvailable(false);
                    setUseCustomHours(false);
                  }}
                >
                  Unavailable
                </Button>
              </div>
            </div>

            <div className="text-center text-xs text-muted-foreground">OR</div>

            {/* Custom Hours */}
            <div className="space-y-3 p-3 rounded-lg border border-dashed">
              <Label className="text-sm text-muted-foreground">Custom Hours</Label>
              <div className="flex items-center gap-2">
                <AvailabilityTimePicker
                  value={startTime}
                  onChange={(value) => {
                    setStartTime(value);
                    setUseCustomHours(true);
                  }}
                  label="Start"
                />
                <span className="text-muted-foreground text-sm">→</span>
                <AvailabilityTimePicker
                  value={endTime}
                  onChange={(value) => {
                    setEndTime(value);
                    setUseCustomHours(true);
                  }}
                  label="End"
                />
              </div>
              {useCustomHours && (
                <div className="flex items-center justify-between pt-2">
                  <Label className="text-sm">Available during these hours</Label>
                  <Switch
                    checked={isAvailable}
                    onCheckedChange={setIsAvailable}
                  />
                </div>
              )}
            </div>

            {/* Custom Rate */}
            <div className={cn(
              "space-y-2 p-3 rounded-lg border transition-opacity",
              !isAvailable && "opacity-50 pointer-events-none bg-muted/30"
            )}>
              <Label className="text-sm text-muted-foreground">Price</Label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    value={customRate ?? ''}
                    onChange={(e) => setCustomRate(e.target.value ? parseFloat(e.target.value) : null)}
                    placeholder={baseRate ? String(baseRate) : '0'}
                    className="pl-7"
                    disabled={!isAvailable}
                  />
                </div>
                <span className="text-sm text-muted-foreground">/hr</span>
              </div>
              {!isAvailable && (
                <p className="text-xs text-muted-foreground">Rate not applicable when unavailable</p>
              )}
              {isAvailable && customRate === null && baseRate > 0 && (
                <p className="text-xs text-muted-foreground">Using base rate: ${baseRate}/hr</p>
              )}
            </div>

            {/* Save / Remove buttons */}
            <div className="flex gap-2 pt-2">
              <Button onClick={saveOverrides} className="flex-1">
                Apply to {selectedDates.size} Date{selectedDates.size > 1 ? 's' : ''}
              </Button>
              {selectedHaveOverrides && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={removeSelectedOverrides}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* List of existing overrides */}
      {sortedDates.length > 0 && !hasSelection && (
        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground">Existing Overrides</Label>
          <div className="flex flex-wrap gap-2">
            {sortedDates.map((dateStr) => {
              const data = overrides[dateStr];
              return (
                <Badge
                  key={dateStr}
                  variant={data.is_available ? "secondary" : "destructive"}
                  className={cn(
                    "px-3 py-1.5 text-sm flex items-center gap-2 cursor-pointer hover:opacity-80",
                    data.is_available && "bg-green-500/20 text-green-700 dark:text-green-400 hover:bg-green-500/30"
                  )}
                  onClick={() => handleDateClick(dateStr)}
                >
                  {format(new Date(dateStr + 'T00:00:00'), 'MMM d')}
                  {data.is_available ? ' ✓' : ' ✕'}
                  {data.custom_rate && (
                    <span className="font-medium">${data.custom_rate}/hr</span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeOverride(dateStr);
                    }}
                    className="hover:text-destructive transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state hint */}
      {sortedDates.length === 0 && !hasSelection && !rangeStart && (
        <div className="text-center text-sm text-muted-foreground py-4">
          <CalendarIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Select dates above to add overrides</p>
        </div>
      )}
    </div>
  );
};