import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Clock, Sun, DollarSign, Briefcase, CalendarClock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { AvailabilityTimePicker } from './AvailabilityTimePicker';

export interface AvailabilityRule {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
  custom_rate?: number | null;
}

interface TimeRange {
  start_time: string;
  end_time: string;
}

interface DayData {
  windows: TimeRange[];
  custom_rate?: number | null;
}

interface AvailabilityManagerProps {
  initialRules?: AvailabilityRule[];
  onChange?: (rules: AvailabilityRule[]) => void;
  baseRate?: number;
}

const DAYS = [
  { name: 'Sunday', short: 'Sun' },
  { name: 'Monday', short: 'Mon' },
  { name: 'Tuesday', short: 'Tue' },
  { name: 'Wednesday', short: 'Wed' },
  { name: 'Thursday', short: 'Thu' },
  { name: 'Friday', short: 'Fri' },
  { name: 'Saturday', short: 'Sat' },
];

export const AvailabilityManager = ({ 
  initialRules = [], 
  onChange,
  baseRate = 0
}: AvailabilityManagerProps) => {
  const groupByDay = (rules: AvailabilityRule[]) => {
    const grouped: Record<number, DayData> = {};
    for (let i = 0; i < 7; i++) {
      grouped[i] = { windows: [], custom_rate: null };
    }
    
    rules.forEach(rule => {
      grouped[rule.day_of_week].windows.push({
        start_time: rule.start_time,
        end_time: rule.end_time,
      });
      // Use the custom_rate from any rule for that day (they should all be the same)
      if (rule.custom_rate !== undefined && rule.custom_rate !== null) {
        grouped[rule.day_of_week].custom_rate = rule.custom_rate;
      }
    });
    
    return grouped;
  };

  const [availabilityWindows, setAvailabilityWindows] = useState<Record<number, DayData>>(groupByDay(initialRules));

  useEffect(() => {
    const rules: AvailabilityRule[] = [];
    
    Object.entries(availabilityWindows).forEach(([day, dayData]) => {
      const dayIndex = Number(day);
      
      if (dayData.windows.length > 0) {
        dayData.windows.forEach(window => {
          rules.push({
            day_of_week: dayIndex,
            start_time: window.start_time,
            end_time: window.end_time,
            is_available: true,
            custom_rate: dayData.custom_rate,
          });
        });
      }
    });
    
    if (onChange) {
      onChange(rules);
    }
  }, [availabilityWindows, onChange]);

  const toggleDay = (dayIndex: number) => {
    const dayData = availabilityWindows[dayIndex];
    if (dayData.windows.length > 0) {
      // Turn off - clear all windows but preserve custom_rate
      setAvailabilityWindows({
        ...availabilityWindows,
        [dayIndex]: { windows: [], custom_rate: null }
      });
    } else {
      // Turn on - add default 9-5, preserve custom_rate
      setAvailabilityWindows({
        ...availabilityWindows,
        [dayIndex]: { ...dayData, windows: [{ start_time: '09:00', end_time: '17:00' }] }
      });
    }
  };

  const set24Hours = (dayIndex: number) => {
    setAvailabilityWindows({
      ...availabilityWindows,
      [dayIndex]: { ...availabilityWindows[dayIndex], windows: [{ start_time: '00:00', end_time: '23:59' }] }
    });
  };

  const setCustomRate = (dayIndex: number, rate: number | null) => {
    setAvailabilityWindows({
      ...availabilityWindows,
      [dayIndex]: { ...availabilityWindows[dayIndex], custom_rate: rate }
    });
  };

  const addTimeSlot = (dayIndex: number) => {
    const dayData = availabilityWindows[dayIndex];
    const newWindow: TimeRange = { start_time: '09:00', end_time: '17:00' };
    
    // Find non-overlapping slot
    if (dayData.windows.length > 0) {
      const sortedWindows = [...dayData.windows].sort((a, b) => 
        timeToMinutes(a.start_time) - timeToMinutes(b.start_time)
      );
      const lastWindow = sortedWindows[sortedWindows.length - 1];
      const lastEndMinutes = timeToMinutes(lastWindow.end_time);
      
      if (lastEndMinutes < 1380) {
        newWindow.start_time = minutesToTime(lastEndMinutes);
        newWindow.end_time = minutesToTime(Math.min(lastEndMinutes + 120, 1439));
      }
    }

    setAvailabilityWindows({
      ...availabilityWindows,
      [dayIndex]: { 
        ...dayData, 
        windows: [...dayData.windows, newWindow].sort((a, b) => 
          timeToMinutes(a.start_time) - timeToMinutes(b.start_time))
      }
    });
  };

  const removeTimeSlot = (dayIndex: number, windowIndex: number) => {
    const dayData = availabilityWindows[dayIndex];
    setAvailabilityWindows({
      ...availabilityWindows,
      [dayIndex]: { ...dayData, windows: dayData.windows.filter((_, i) => i !== windowIndex) }
    });
  };

  const updateTime = (dayIndex: number, windowIndex: number, field: 'start_time' | 'end_time', value: string) => {
    const dayData = availabilityWindows[dayIndex];
    const windows = [...dayData.windows];
    windows[windowIndex] = { ...windows[windowIndex], [field]: value };
    
    // Validate times
    const start = timeToMinutes(windows[windowIndex].start_time);
    const end = timeToMinutes(windows[windowIndex].end_time);
    
    if (start >= end) {
      toast.error('Start time must be before end time');
      return;
    }

    // Check overlap with other windows
    const otherWindows = windows.filter((_, i) => i !== windowIndex);
    if (hasOverlap(otherWindows, windows[windowIndex])) {
      toast.error('Time overlaps with another slot');
      return;
    }

    setAvailabilityWindows({
      ...availabilityWindows,
      [dayIndex]: { 
        ...dayData, 
        windows: windows.sort((a, b) => 
          timeToMinutes(a.start_time) - timeToMinutes(b.start_time))
      }
    });
  };

  const hasOverlap = (windows: TimeRange[], newWindow: TimeRange): boolean => {
    const newStart = timeToMinutes(newWindow.start_time);
    const newEnd = timeToMinutes(newWindow.end_time);

    return windows.some(window => {
      const start = timeToMinutes(window.start_time);
      const end = timeToMinutes(window.end_time);
      return (newStart < end && newEnd > start);
    });
  };

  const timeToMinutes = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const minutesToTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  };

  const is24Hours = (windows: TimeRange[]) => {
    return windows.length === 1 && windows[0].start_time === '00:00' && windows[0].end_time === '23:59';
  };

  return (
    <div className="space-y-3">
      {DAYS.map((day, dayIndex) => {
        const dayData = availabilityWindows[dayIndex];
        const windows = dayData.windows;
        const isAvailable = windows.length > 0;
        const isFullDay = is24Hours(windows);
        const hasCustomRate = dayData.custom_rate !== null && dayData.custom_rate !== undefined;

        return (
          <Card 
            key={dayIndex} 
            className={cn(
              "p-3 sm:p-4 transition-all",
              isAvailable ? "border-primary/30 bg-primary/5" : "border-border"
            )}
          >
            {/* Day Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 sm:gap-3">
                <Switch 
                  checked={isAvailable}
                  onCheckedChange={() => toggleDay(dayIndex)}
                />
                <span className={cn(
                  "font-medium text-sm sm:text-base",
                  !isAvailable && "text-muted-foreground"
                )}>
                  <span className="sm:hidden">{day.short}</span>
                  <span className="hidden sm:inline">{day.name}</span>
                </span>
              </div>
              
              <div className="flex items-center gap-1.5 sm:gap-2">
                {isAvailable && hasCustomRate && (
                  <Badge variant="secondary" className="text-xs bg-green-500/20 text-green-700 dark:text-green-400 px-1.5 sm:px-2">
                    <DollarSign className="h-3 w-3 mr-0.5" />
                    ${dayData.custom_rate}
                  </Badge>
                )}
                {isAvailable && (
                  <Badge 
                    variant={isFullDay ? "default" : "secondary"} 
                    className="text-xs cursor-pointer px-1.5 sm:px-2"
                    onClick={() => set24Hours(dayIndex)}
                  >
                    {isFullDay ? (
                      <>
                        <Clock className="h-3 w-3 sm:mr-1" />
                        <span className="hidden sm:inline">24/7</span>
                      </>
                    ) : (
                      <span className="text-xs">24h</span>
                    )}
                  </Badge>
                )}
                {!isAvailable && (
                  <span className="text-xs sm:text-sm text-muted-foreground">Closed</span>
                )}
              </div>
            </div>

            {/* Custom Rate for Day - Mobile Optimized */}
            {isAvailable && (
              <div className="mt-3 p-2.5 sm:p-3 rounded-lg bg-muted/50 border border-dashed">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
                  <div className="flex items-center gap-2 text-xs sm:text-sm">
                    <DollarSign className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">
                      <span className="sm:hidden">Custom rate</span>
                      <span className="hidden sm:inline">Custom rate for {day.name}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {hasCustomRate ? (
                      <div className="flex items-center gap-1.5 w-full sm:w-auto">
                        <div className="relative flex-1 sm:flex-none">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                          <Input
                            type="number"
                            min="0"
                            step="0.5"
                            value={dayData.custom_rate || ''}
                            onChange={(e) => setCustomRate(dayIndex, e.target.value ? parseFloat(e.target.value) : null)}
                            className="w-full sm:w-20 pl-5 h-8 text-sm"
                            placeholder="0"
                          />
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">/hr</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs shrink-0"
                          onClick={() => setCustomRate(dayIndex, null)}
                        >
                          Reset
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs w-full sm:w-auto"
                        onClick={() => setCustomRate(dayIndex, baseRate || 5)}
                      >
                        Set custom rate
                      </Button>
                    )}
                  </div>
                </div>
                {!hasCustomRate && baseRate > 0 && (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Using base rate: ${baseRate}/hr
                  </p>
                )}
              </div>
            )}

            {/* Time Slots */}
            {isAvailable && !isFullDay && (
              <div className="mt-3 sm:mt-4 space-y-2 sm:space-y-3">
                {windows.map((window, windowIndex) => (
                  <div 
                    key={windowIndex} 
                    className="p-2.5 sm:p-3 rounded-lg bg-background border"
                  >
                    <div className="flex items-center gap-2">
                      <AvailabilityTimePicker
                        value={window.start_time}
                        onChange={(value) => updateTime(dayIndex, windowIndex, 'start_time', value)}
                        label="Start Time"
                      />
                      <span className="text-muted-foreground text-xs sm:text-sm shrink-0">to</span>
                      <AvailabilityTimePicker
                        value={window.end_time}
                        onChange={(value) => updateTime(dayIndex, windowIndex, 'end_time', value)}
                        label="End Time"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => removeTimeSlot(dayIndex, windowIndex)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => addTimeSlot(dayIndex)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add time slot
                </Button>
              </div>
            )}

            {/* 24h display */}
            {isAvailable && isFullDay && (
              <div className="mt-3 flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                <Sun className="h-4 w-4" />
                <span>Available all day (12:00 AM - 11:59 PM)</span>
              </div>
            )}
          </Card>
        );
      })}

      {/* Quick Actions - Mobile Optimized */}
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 sm:h-9 sm:flex-1 sm:min-w-[140px]"
          onClick={() => {
            const allDays: Record<number, DayData> = {};
            for (let i = 0; i < 7; i++) {
              allDays[i] = { windows: [{ start_time: '09:00', end_time: '17:00' }], custom_rate: null };
            }
            setAvailabilityWindows(allDays);
            toast.success('Set weekdays 9 AM - 5 PM');
          }}
        >
          <Briefcase className="h-4 w-4 mr-1.5 shrink-0" />
          <span className="text-xs sm:text-sm truncate">9-5</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 sm:h-9 sm:flex-1 sm:min-w-[140px]"
          onClick={() => {
            const allDays: Record<number, DayData> = {};
            for (let i = 0; i < 7; i++) {
              allDays[i] = { windows: [{ start_time: '00:00', end_time: '23:59' }], custom_rate: null };
            }
            setAvailabilityWindows(allDays);
            toast.success('Set available 24/7');
          }}
        >
          <CalendarClock className="h-4 w-4 mr-1.5 shrink-0" />
          <span className="text-xs sm:text-sm truncate">24/7</span>
        </Button>
        {baseRate > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 sm:h-9 col-span-2 sm:col-span-1 sm:flex-1 sm:min-w-[140px]"
            onClick={() => {
              // Set weekend premium (Sat/Sun at 1.5x)
              const weekendRate = Math.round(baseRate * 1.5 * 100) / 100;
              const updatedDays = { ...availabilityWindows };
              updatedDays[0] = { ...updatedDays[0], custom_rate: weekendRate }; // Sunday
              updatedDays[6] = { ...updatedDays[6], custom_rate: weekendRate }; // Saturday
              setAvailabilityWindows(updatedDays);
              toast.success(`Weekend rate set to $${weekendRate}/hr`);
            }}
          >
            <DollarSign className="h-4 w-4 mr-1.5 shrink-0" />
            <span className="text-xs sm:text-sm truncate">Weekend +50%</span>
          </Button>
        )}
      </div>
    </div>
  );
};
