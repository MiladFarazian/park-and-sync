import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Calendar as CalendarIcon, Plus, Trash2, Clock, X, Ban, CalendarPlus, CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, eachDayOfInterval, isBefore, startOfDay, addMonths, startOfMonth, endOfMonth, getDay, addDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { DateRange } from 'react-day-picker';

type OverrideMode = 'block' | 'make_available' | 'custom_hours';

export interface DateOverride {
  id?: string;
  override_date: string;
  start_time?: string;
  end_time?: string;
  is_available: boolean;
}

interface TimeRange {
  start_time: string;
  end_time: string;
}

interface DateOverrideManagerProps {
  initialOverrides?: DateOverride[];
  onChange?: (overrides: DateOverride[]) => void;
}

export const DateOverrideManager = ({ 
  initialOverrides = [], 
  onChange 
}: DateOverrideManagerProps) => {
  const groupByDate = (overrides: DateOverride[]) => {
    const grouped: Record<string, { is_available: boolean; windows: TimeRange[] }> = {};
    overrides.forEach(override => {
      if (!grouped[override.override_date]) {
        grouped[override.override_date] = {
          is_available: override.is_available,
          windows: []
        };
      }
      if (override.start_time && override.end_time) {
        grouped[override.override_date].windows.push({
          start_time: override.start_time,
          end_time: override.end_time
        });
      }
    });
    return grouped;
  };

  const [overrides, setOverrides] = useState<Record<string, { is_available: boolean; windows: TimeRange[] }>>(
    groupByDate(initialOverrides)
  );
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [overrideMode, setOverrideMode] = useState<OverrideMode>('block');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [previewMonth, setPreviewMonth] = useState<Date>(new Date());
  
  // Drag selection state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<string | null>(null);
  const [dragEnd, setDragEnd] = useState<string | null>(null);

  // Get dates for calendar preview
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

  // Generate calendar grid for preview
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(previewMonth);
    const monthEnd = endOfMonth(previewMonth);
    const startDay = getDay(monthStart);
    
    const days: { date: Date; isCurrentMonth: boolean }[] = [];
    
    // Add days from previous month to fill the first week
    for (let i = startDay - 1; i >= 0; i--) {
      days.push({
        date: addDays(monthStart, -i - 1),
        isCurrentMonth: false
      });
    }
    days.reverse();
    
    // Add all days of current month
    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
    daysInMonth.forEach(date => {
      days.push({ date, isCurrentMonth: true });
    });
    
    // Add days from next month to complete the grid (6 rows = 42 days)
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        date: addDays(monthEnd, i),
        isCurrentMonth: false
      });
    }
    
    return days;
  }, [previewMonth]);

  // Get dates in drag range
  const dragRangeDates = useMemo(() => {
    if (!dragStart || !dragEnd) return new Set<string>();
    
    const start = new Date(dragStart + 'T00:00:00');
    const end = new Date(dragEnd + 'T00:00:00');
    const [from, to] = start <= end ? [start, end] : [end, start];
    
    const dates = eachDayOfInterval({ start: from, end: to });
    return new Set(dates.map(d => format(d, 'yyyy-MM-dd')));
  }, [dragStart, dragEnd]);

  // Handle drag selection completion
  const applyDragSelection = () => {
    if (!dragStart || !dragEnd) return;
    
    const start = new Date(dragStart + 'T00:00:00');
    const end = new Date(dragEnd + 'T00:00:00');
    const [from, to] = start <= end ? [start, end] : [end, start];
    
    const datesToAdd = eachDayOfInterval({ start: from, end: to });
    const isAvailable = overrideMode !== 'block';
    const hasCustomHours = overrideMode === 'custom_hours' || overrideMode === 'make_available';

    const newOverrides = { ...overrides };
    let addedCount = 0;

    datesToAdd.forEach(date => {
      const dateStr = format(date, 'yyyy-MM-dd');
      if (isBefore(date, startOfDay(new Date()))) return; // Skip past dates
      
      if (!overrides[dateStr]) {
        newOverrides[dateStr] = {
          is_available: isAvailable,
          windows: hasCustomHours ? [{ start_time: '09:00', end_time: '17:00' }] : []
        };
        addedCount++;
      }
    });

    if (addedCount > 0) {
      setOverrides(newOverrides);
      const messages: Record<OverrideMode, string> = {
        block: addedCount === 1 ? 'Date blocked' : `${addedCount} dates blocked`,
        make_available: addedCount === 1 ? 'Date marked as available' : `${addedCount} dates marked as available`,
        custom_hours: addedCount === 1 ? 'Custom hours added' : `Custom hours added for ${addedCount} dates`
      };
      toast.success(messages[overrideMode]);
    }
  };

  useEffect(() => {
    const result: DateOverride[] = [];
    Object.entries(overrides).forEach(([date, data]) => {
      if (data.windows.length > 0) {
        data.windows.forEach(window => {
          result.push({
            override_date: date,
            start_time: window.start_time,
            end_time: window.end_time,
            is_available: data.is_available
          });
        });
      } else {
        result.push({
          override_date: date,
          is_available: data.is_available
        });
      }
    });
    onChange?.(result);
  }, [overrides, onChange]);

  const addOverride = () => {
    if (!dateRange?.from) {
      toast.error('Please select a date or date range');
      return;
    }

    const startDate = dateRange.from;
    const endDate = dateRange.to || dateRange.from;
    
    // Get all dates in the range
    const datesToAdd = eachDayOfInterval({ start: startDate, end: endDate });
    
    // Check for existing overrides
    const existingDates = datesToAdd.filter(date => {
      const dateStr = format(date, 'yyyy-MM-dd');
      return overrides[dateStr];
    });

    if (existingDates.length > 0) {
      if (existingDates.length === datesToAdd.length) {
        toast.error('All selected dates already have overrides');
        return;
      }
      toast.warning(`${existingDates.length} date(s) skipped (already have overrides)`);
    }

    const isAvailable = overrideMode !== 'block';
    const hasCustomHours = overrideMode === 'custom_hours' || overrideMode === 'make_available';

    const newOverrides = { ...overrides };
    let addedCount = 0;

    datesToAdd.forEach(date => {
      const dateStr = format(date, 'yyyy-MM-dd');
      if (!overrides[dateStr]) {
        newOverrides[dateStr] = {
          is_available: isAvailable,
          windows: hasCustomHours ? [{ start_time: '09:00', end_time: '17:00' }] : []
        };
        addedCount++;
      }
    });

    setOverrides(newOverrides);
    setDateRange(undefined);
    setCalendarOpen(false);
    
    const messages: Record<OverrideMode, string> = {
      block: addedCount === 1 ? 'Date blocked' : `${addedCount} dates blocked`,
      make_available: addedCount === 1 ? 'Date marked as available' : `${addedCount} dates marked as available`,
      custom_hours: addedCount === 1 ? 'Custom hours added' : `Custom hours added for ${addedCount} dates`
    };
    toast.success(messages[overrideMode]);
  };

  const removeOverride = (dateStr: string) => {
    const newOverrides = { ...overrides };
    delete newOverrides[dateStr];
    setOverrides(newOverrides);
    toast.success('Override removed');
  };

  const updateTime = (dateStr: string, windowIndex: number, field: 'start_time' | 'end_time', value: string) => {
    const override = overrides[dateStr];
    const windows = [...override.windows];
    windows[windowIndex] = { ...windows[windowIndex], [field]: value };
    
    setOverrides({
      ...overrides,
      [dateStr]: {
        ...override,
        windows
      }
    });
  };

  const getDisplayDateRange = () => {
    if (!dateRange?.from) return 'Select date(s)';
    if (!dateRange.to || format(dateRange.from, 'yyyy-MM-dd') === format(dateRange.to, 'yyyy-MM-dd')) {
      return format(dateRange.from, 'EEEE, MMM d, yyyy');
    }
    return `${format(dateRange.from, 'MMM d')} - ${format(dateRange.to, 'MMM d, yyyy')}`;
  };

  const sortedDates = Object.keys(overrides).sort();
  const blockedDates = sortedDates.filter(d => !overrides[d].is_available);
  const specialDates = sortedDates.filter(d => overrides[d].is_available);

  // Group consecutive blocked dates for display
  const groupConsecutiveDates = (dates: string[]) => {
    if (dates.length === 0) return [];
    
    const groups: { start: string; end: string }[] = [];
    let currentGroup = { start: dates[0], end: dates[0] };
    
    for (let i = 1; i < dates.length; i++) {
      const prevDate = new Date(dates[i - 1] + 'T00:00:00');
      const currDate = new Date(dates[i] + 'T00:00:00');
      const diffDays = Math.round((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (diffDays === 1) {
        currentGroup.end = dates[i];
      } else {
        groups.push(currentGroup);
        currentGroup = { start: dates[i], end: dates[i] };
      }
    }
    groups.push(currentGroup);
    
    return groups;
  };

  const blockedGroups = groupConsecutiveDates(blockedDates);

  const removeOverrideRange = (start: string, end: string) => {
    const newOverrides = { ...overrides };
    const startDate = new Date(start + 'T00:00:00');
    const endDate = new Date(end + 'T00:00:00');
    const datesToRemove = eachDayOfInterval({ start: startDate, end: endDate });
    
    datesToRemove.forEach(date => {
      const dateStr = format(date, 'yyyy-MM-dd');
      delete newOverrides[dateStr];
    });
    
    setOverrides(newOverrides);
    const count = datesToRemove.length;
    toast.success(count === 1 ? 'Override removed' : `${count} overrides removed`);
  };

  return (
    <div className="space-y-6">
      {/* Calendar Preview */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" />
              Availability Overview
            </h3>
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
          </div>
          
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="text-xs text-muted-foreground text-center font-medium py-1">
                {day}
              </div>
            ))}
          </div>
          
          {/* Calendar grid */}
          <div 
            className="grid grid-cols-7 gap-1 select-none"
            onMouseLeave={() => {
              if (isDragging) {
                applyDragSelection();
                setIsDragging(false);
                setDragStart(null);
                setDragEnd(null);
              }
            }}
          >
            {calendarDays.map(({ date, isCurrentMonth }, index) => {
              const dateStr = format(date, 'yyyy-MM-dd');
              const isBlocked = blockedDateSet.has(dateStr);
              const isAvailable = availableDateSet.has(dateStr);
              const isPast = isBefore(date, startOfDay(new Date()));
              const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
              const hasOverride = isBlocked || isAvailable;
              const isClickable = isCurrentMonth && !isPast;
              const isInDragRange = dragRangeDates.has(dateStr) && !isPast && isCurrentMonth;
              
              const handleMouseDown = (e: React.MouseEvent) => {
                e.preventDefault();
                if (!isClickable) return;
                
                // If clicking on existing override, remove it (single click behavior)
                if (hasOverride && !isDragging) {
                  const newOverrides = { ...overrides };
                  delete newOverrides[dateStr];
                  setOverrides(newOverrides);
                  toast.success('Override removed');
                  return;
                }
                
                // Start drag selection
                setIsDragging(true);
                setDragStart(dateStr);
                setDragEnd(dateStr);
              };
              
              const handleMouseEnter = () => {
                if (isDragging && isClickable && !hasOverride) {
                  setDragEnd(dateStr);
                }
              };
              
              const handleMouseUp = () => {
                if (isDragging) {
                  applyDragSelection();
                  setIsDragging(false);
                  setDragStart(null);
                  setDragEnd(null);
                }
              };
              
              return (
                <button
                  key={index}
                  type="button"
                  disabled={!isClickable}
                  onMouseDown={handleMouseDown}
                  onMouseEnter={handleMouseEnter}
                  onMouseUp={handleMouseUp}
                  className={cn(
                    "aspect-square flex items-center justify-center text-sm rounded-md transition-all duration-200",
                    !isCurrentMonth && "opacity-30",
                    isPast && "opacity-40 cursor-not-allowed",
                    isToday && "ring-1 ring-primary ring-offset-1 ring-offset-background",
                    isBlocked && "bg-destructive/20 text-destructive-foreground dark:bg-destructive/30",
                    isAvailable && "bg-green-500/20 text-green-700 dark:text-green-400",
                    isInDragRange && !hasOverride && overrideMode === 'block' && "bg-destructive/40",
                    isInDragRange && !hasOverride && overrideMode !== 'block' && "bg-green-500/40",
                    isClickable && !hasOverride && !isInDragRange && "hover:bg-muted cursor-pointer",
                    isClickable && hasOverride && "hover:opacity-70 cursor-pointer"
                  )}
                  title={
                    !isClickable ? undefined :
                    hasOverride ? 'Click to remove override' :
                    'Click or drag to select dates'
                  }
                >
                  <span className={cn(
                    "w-7 h-7 flex items-center justify-center rounded-full text-xs transition-transform",
                    isBlocked && "bg-destructive text-destructive-foreground font-medium",
                    isAvailable && "bg-green-500 text-white font-medium",
                    isInDragRange && !hasOverride && overrideMode === 'block' && "bg-destructive text-destructive-foreground font-medium",
                    isInDragRange && !hasOverride && overrideMode !== 'block' && "bg-green-500 text-white font-medium",
                    isClickable && "hover:scale-110"
                  )}>
                    {format(date, 'd')}
                  </span>
                </button>
              );
            })}
          </div>
          
          {/* Mode indicator for clicking */}
          <div className="text-xs text-muted-foreground text-center py-2 bg-muted/30 rounded-lg">
            {isDragging 
              ? `Drag to select ${dragRangeDates.size} date${dragRangeDates.size !== 1 ? 's' : ''} • Release to apply`
              : `Click or drag dates to ${overrideMode === 'block' ? 'block' : overrideMode === 'make_available' ? 'make available' : 'add custom hours'}`}
          </div>
          
          {/* Legend */}
          <div className="flex items-center justify-center gap-4 pt-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-3 h-3 rounded-full bg-destructive" />
              Blocked
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-3 h-3 rounded-full bg-green-500" />
              Available
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-3 h-3 rounded-full ring-1 ring-primary" />
              Today
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add Override Section */}
      <Card className="border-dashed">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CalendarRange className="h-4 w-4" />
            Add Date Override
          </div>
          
          {/* Toggle between override modes */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Button
              type="button"
              variant={overrideMode === 'block' ? "default" : "outline"}
              size="sm"
              className="w-full"
              onClick={() => setOverrideMode('block')}
            >
              <Ban className="h-4 w-4 mr-2" />
              Block Dates
            </Button>
            <Button
              type="button"
              variant={overrideMode === 'make_available' ? "default" : "outline"}
              size="sm"
              className="w-full"
              onClick={() => setOverrideMode('make_available')}
            >
              <CalendarPlus className="h-4 w-4 mr-2" />
              Make Available
            </Button>
            <Button
              type="button"
              variant={overrideMode === 'custom_hours' ? "default" : "outline"}
              size="sm"
              className="w-full"
              onClick={() => setOverrideMode('custom_hours')}
            >
              <Clock className="h-4 w-4 mr-2" />
              Custom Hours
            </Button>
          </div>

          {/* Helper text based on mode */}
          <p className="text-xs text-muted-foreground">
            {overrideMode === 'block' && "Block dates so no one can book (e.g., vacation Dec 20-31)."}
            {overrideMode === 'make_available' && "Make normally unavailable dates available for booking."}
            {overrideMode === 'custom_hours' && "Set different hours than your regular schedule."}
          </p>

          {/* Date Range Picker */}
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal h-12",
                  !dateRange?.from && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {getDisplayDateRange()}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <div className="p-3 border-b">
                <p className="text-sm font-medium">Select a date or range</p>
                <p className="text-xs text-muted-foreground">Click a date, or click and drag to select multiple days</p>
              </div>
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={setDateRange}
                numberOfMonths={1}
                disabled={(date) => {
                  const dateStr = format(date, 'yyyy-MM-dd');
                  return isBefore(date, startOfDay(new Date()));
                }}
                initialFocus
                className="pointer-events-auto p-3"
              />
              {dateRange?.from && (
                <div className="p-3 border-t flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    {dateRange.to && format(dateRange.from, 'yyyy-MM-dd') !== format(dateRange.to, 'yyyy-MM-dd')
                      ? `${eachDayOfInterval({ start: dateRange.from, end: dateRange.to }).length} days selected`
                      : '1 day selected'}
                  </span>
                  <Button
                    size="sm"
                    onClick={() => {
                      addOverride();
                    }}
                  >
                    {overrideMode === 'block' ? 'Block' : overrideMode === 'make_available' ? 'Make Available' : 'Add Hours'}
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          <Button 
            onClick={addOverride} 
            disabled={!dateRange?.from} 
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-2" />
            {overrideMode === 'block' && 'Block Selected Dates'}
            {overrideMode === 'make_available' && 'Make Selected Dates Available'}
            {overrideMode === 'custom_hours' && 'Add Custom Hours'}
          </Button>
        </CardContent>
      </Card>

      {/* Blocked Dates - Grouped */}
      {blockedGroups.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Ban className="h-4 w-4" />
            Blocked Dates ({blockedDates.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {blockedGroups.map((group) => {
              const isSingleDay = group.start === group.end;
              const displayText = isSingleDay 
                ? format(new Date(group.start + 'T00:00:00'), 'MMM d, yyyy')
                : `${format(new Date(group.start + 'T00:00:00'), 'MMM d')} - ${format(new Date(group.end + 'T00:00:00'), 'MMM d, yyyy')}`;
              
              return (
                <Badge
                  key={group.start}
                  variant="secondary"
                  className="px-3 py-1.5 text-sm flex items-center gap-2"
                >
                  {displayText}
                  <button
                    onClick={() => removeOverrideRange(group.start, group.end)}
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

      {/* Available Dates / Custom Hours */}
      {specialDates.length > 0 && (
        <div className="space-y-3">
          <div className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <CalendarPlus className="h-4 w-4" />
            Available / Custom Hours ({specialDates.length})
          </div>
          {specialDates.map((dateStr) => {
            const override = overrides[dateStr];
            return (
              <Card key={dateStr} className="border-green-500/20 bg-green-500/5">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="font-medium">
                        {format(new Date(dateStr + 'T00:00:00'), 'EEEE, MMM d, yyyy')}
                      </div>
                      <div className="text-xs text-green-600 dark:text-green-400">
                        Available (overrides weekly schedule)
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => removeOverride(dateStr)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  
                  {override.windows.map((window, windowIndex) => (
                    <div 
                      key={windowIndex}
                      className="flex items-center gap-2 p-3 rounded-lg bg-background border"
                    >
                      <Clock className="h-4 w-4 text-muted-foreground shrink-0 hidden sm:block" />
                      <Input
                        type="time"
                        value={window.start_time}
                        onChange={(e) => updateTime(dateStr, windowIndex, 'start_time', e.target.value)}
                        className="flex-1 min-w-0 text-center"
                      />
                      <span className="text-muted-foreground text-sm shrink-0">to</span>
                      <Input
                        type="time"
                        value={window.end_time}
                        onChange={(e) => updateTime(dateStr, windowIndex, 'end_time', e.target.value)}
                        className="flex-1 min-w-0 text-center"
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {sortedDates.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-muted-foreground">
            <CalendarRange className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No date overrides</p>
            <p className="text-sm mt-1">Block date ranges or set special hours for vacations & holidays</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
