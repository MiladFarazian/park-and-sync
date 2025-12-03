import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Clock, Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export interface AvailabilityRule {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
}

interface TimeRange {
  start_time: string;
  end_time: string;
}

interface AvailabilityManagerProps {
  initialRules?: AvailabilityRule[];
  onChange?: (rules: AvailabilityRule[]) => void;
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
  onChange 
}: AvailabilityManagerProps) => {
  const groupByDay = (rules: AvailabilityRule[]) => {
    const grouped: Record<number, TimeRange[]> = {};
    for (let i = 0; i < 7; i++) {
      grouped[i] = [];
    }
    
    rules.forEach(rule => {
      grouped[rule.day_of_week].push({
        start_time: rule.start_time,
        end_time: rule.end_time,
      });
    });
    
    return grouped;
  };

  const [availabilityWindows, setAvailabilityWindows] = useState<Record<number, TimeRange[]>>(groupByDay(initialRules));

  useEffect(() => {
    const rules: AvailabilityRule[] = [];
    
    Object.entries(availabilityWindows).forEach(([day, windows]) => {
      const dayIndex = Number(day);
      
      if (windows.length > 0) {
        windows.forEach(window => {
          rules.push({
            day_of_week: dayIndex,
            start_time: window.start_time,
            end_time: window.end_time,
            is_available: true,
          });
        });
      }
    });
    
    if (onChange) {
      onChange(rules);
    }
  }, [availabilityWindows, onChange]);

  const toggleDay = (dayIndex: number) => {
    const windows = availabilityWindows[dayIndex];
    if (windows.length > 0) {
      // Turn off - clear all windows
      setAvailabilityWindows({
        ...availabilityWindows,
        [dayIndex]: []
      });
    } else {
      // Turn on - add default 9-5
      setAvailabilityWindows({
        ...availabilityWindows,
        [dayIndex]: [{ start_time: '09:00', end_time: '17:00' }]
      });
    }
  };

  const set24Hours = (dayIndex: number) => {
    setAvailabilityWindows({
      ...availabilityWindows,
      [dayIndex]: [{ start_time: '00:00', end_time: '23:59' }]
    });
  };

  const addTimeSlot = (dayIndex: number) => {
    const windows = availabilityWindows[dayIndex];
    const newWindow: TimeRange = { start_time: '09:00', end_time: '17:00' };
    
    // Find non-overlapping slot
    if (windows.length > 0) {
      const sortedWindows = [...windows].sort((a, b) => 
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
      [dayIndex]: [...windows, newWindow].sort((a, b) => 
        timeToMinutes(a.start_time) - timeToMinutes(b.start_time))
    });
  };

  const removeTimeSlot = (dayIndex: number, windowIndex: number) => {
    setAvailabilityWindows({
      ...availabilityWindows,
      [dayIndex]: availabilityWindows[dayIndex].filter((_, i) => i !== windowIndex)
    });
  };

  const updateTime = (dayIndex: number, windowIndex: number, field: 'start_time' | 'end_time', value: string) => {
    const windows = [...availabilityWindows[dayIndex]];
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
      [dayIndex]: windows.sort((a, b) => 
        timeToMinutes(a.start_time) - timeToMinutes(b.start_time))
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

  const formatTimeDisplay = (time: string): string => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const is24Hours = (windows: TimeRange[]) => {
    return windows.length === 1 && windows[0].start_time === '00:00' && windows[0].end_time === '23:59';
  };

  return (
    <div className="space-y-3">
      {DAYS.map((day, dayIndex) => {
        const windows = availabilityWindows[dayIndex];
        const isAvailable = windows.length > 0;
        const isFullDay = is24Hours(windows);

        return (
          <Card 
            key={dayIndex} 
            className={cn(
              "p-4 transition-all",
              isAvailable ? "border-primary/30 bg-primary/5" : "border-border"
            )}
          >
            {/* Day Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Switch 
                  checked={isAvailable}
                  onCheckedChange={() => toggleDay(dayIndex)}
                />
                <span className={cn(
                  "font-medium",
                  !isAvailable && "text-muted-foreground"
                )}>
                  {day.name}
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                {isAvailable && (
                  <>
                    <Badge 
                      variant={isFullDay ? "default" : "secondary"} 
                      className="text-xs cursor-pointer"
                      onClick={() => set24Hours(dayIndex)}
                    >
                      {isFullDay ? (
                        <>
                          <Clock className="h-3 w-3 mr-1" />
                          24/7
                        </>
                      ) : (
                        'Set 24h'
                      )}
                    </Badge>
                  </>
                )}
                {!isAvailable && (
                  <span className="text-sm text-muted-foreground">Closed</span>
                )}
              </div>
            </div>

            {/* Time Slots */}
            {isAvailable && !isFullDay && (
              <div className="mt-4 space-y-3">
                {windows.map((window, windowIndex) => (
                  <div 
                    key={windowIndex} 
                    className="p-3 rounded-lg bg-background border"
                  >
                    <div className="flex items-center justify-between mb-2 sm:mb-0">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span className="sm:hidden">Time slot {windowIndex + 1}</span>
                      </div>
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
                    
                    <div className="flex items-center gap-2">
                      <Input
                        type="time"
                        value={window.start_time}
                        onChange={(e) => updateTime(dayIndex, windowIndex, 'start_time', e.target.value)}
                        className="flex-1 min-w-0 text-center"
                      />
                      <span className="text-muted-foreground text-sm shrink-0">to</span>
                      <Input
                        type="time"
                        value={window.end_time}
                        onChange={(e) => updateTime(dayIndex, windowIndex, 'end_time', e.target.value)}
                        className="flex-1 min-w-0 text-center"
                      />
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
              <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Sun className="h-4 w-4" />
                <span>Available all day (12:00 AM - 11:59 PM)</span>
              </div>
            )}
          </Card>
        );
      })}

      {/* Quick Actions */}
      <div className="flex gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => {
            const allDays: Record<number, TimeRange[]> = {};
            for (let i = 0; i < 7; i++) {
              allDays[i] = [{ start_time: '09:00', end_time: '17:00' }];
            }
            setAvailabilityWindows(allDays);
            toast.success('Set weekdays 9 AM - 5 PM');
          }}
        >
          Business Hours (9-5)
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => {
            const allDays: Record<number, TimeRange[]> = {};
            for (let i = 0; i < 7; i++) {
              allDays[i] = [{ start_time: '00:00', end_time: '23:59' }];
            }
            setAvailabilityWindows(allDays);
            toast.success('Set available 24/7');
          }}
        >
          Available 24/7
        </Button>
      </div>
    </div>
  );
};
