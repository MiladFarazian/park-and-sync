import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Calendar as CalendarIcon, Trash2, X, ChevronLeft, ChevronRight, DollarSign } from 'lucide-react';
import { format, isBefore, startOfDay, addMonths, startOfMonth, endOfMonth, getDay, addDays, eachDayOfInterval } from 'date-fns';
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
  
  // Selected date for editing
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  
  // Form state for the selected date
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

  // When selecting a date, load its existing data or reset form
  const handleDateClick = (dateStr: string) => {
    setSelectedDate(dateStr);
    
    const existing = overrides[dateStr];
    if (existing) {
      setIsAvailable(existing.is_available);
      setUseCustomHours(!!(existing.start_time && existing.end_time));
      setStartTime(existing.start_time || '09:00');
      setEndTime(existing.end_time || '17:00');
      setCustomRate(existing.custom_rate ?? null);
    } else {
      // Reset to defaults
      setIsAvailable(true);
      setUseCustomHours(false);
      setStartTime('09:00');
      setEndTime('17:00');
      setCustomRate(null);
    }
  };

  // Save the current form state for selected date
  const saveOverride = () => {
    if (!selectedDate) return;
    
    setOverrides(prev => ({
      ...prev,
      [selectedDate]: {
        is_available: isAvailable,
        start_time: useCustomHours ? startTime : undefined,
        end_time: useCustomHours ? endTime : undefined,
        custom_rate: isAvailable ? customRate : null
      }
    }));
    
    toast.success(isAvailable ? 'Date marked as available' : 'Date blocked');
    setSelectedDate(null);
  };

  // Remove an override
  const removeOverride = (dateStr: string) => {
    const newOverrides = { ...overrides };
    delete newOverrides[dateStr];
    setOverrides(newOverrides);
    toast.success('Override removed');
    if (selectedDate === dateStr) {
      setSelectedDate(null);
    }
  };

  const sortedDates = Object.keys(overrides).sort();

  return (
    <div className="space-y-4">
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
              const isSelected = selectedDate === dateStr;
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
                    isSelected && "ring-2 ring-primary",
                    isBlocked && "bg-destructive/20",
                    isAvailableOverride && "bg-green-500/20",
                    isClickable && !isBlocked && !isAvailableOverride && "hover:bg-muted cursor-pointer"
                  )}
                >
                  <span className={cn(
                    "w-7 h-7 flex items-center justify-center rounded-full text-xs",
                    isBlocked && "bg-destructive text-destructive-foreground font-medium",
                    isAvailableOverride && "bg-green-500 text-white font-medium"
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
              <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
              Available override
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-destructive" />
              Unavailable override
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Selected Date Editor */}
      {selectedDate && (
        <Card className="border-primary/50">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">
                {format(new Date(selectedDate + 'T00:00:00'), 'MMM d, yyyy')}
              </h3>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setSelectedDate(null)}
              >
                <X className="h-4 w-4" />
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
              <Button onClick={saveOverride} className="flex-1">
                Save Override
              </Button>
              {overrides[selectedDate] && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => removeOverride(selectedDate)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* List of existing overrides */}
      {sortedDates.length > 0 && !selectedDate && (
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
      {sortedDates.length === 0 && !selectedDate && (
        <div className="text-center text-sm text-muted-foreground py-4">
          <CalendarIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Select a date above to add an override</p>
        </div>
      )}
    </div>
  );
};
