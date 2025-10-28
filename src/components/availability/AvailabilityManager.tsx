import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Plus, Trash2, Clock } from 'lucide-react';
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

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
  const [openDays, setOpenDays] = useState<Set<number>>(new Set());

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

  const addAvailability = (dayIndex: number) => {
    const windows = availabilityWindows[dayIndex];
    const newWindow: TimeRange = {
      start_time: '09:00',
      end_time: '17:00',
    };

    if (hasOverlap(windows, newWindow)) {
      toast.error('Time range overlaps with existing availability');
      return;
    }

    setAvailabilityWindows({
      ...availabilityWindows,
      [dayIndex]: [...windows, newWindow].sort((a, b) => 
        timeToMinutes(a.start_time) - timeToMinutes(b.start_time))
    });
    toast.success('Availability added');
  };

  const removeAvailability = (dayIndex: number, windowIndex: number) => {
    setAvailabilityWindows({
      ...availabilityWindows,
      [dayIndex]: availabilityWindows[dayIndex].filter((_, i) => i !== windowIndex)
    });
    toast.success('Availability removed');
  };

  const updateAvailability = (dayIndex: number, windowIndex: number, start: string, end: string) => {
    const windows = [...availabilityWindows[dayIndex]];
    windows[windowIndex] = { start_time: start, end_time: end };

    const otherWindows = windows.filter((_, i) => i !== windowIndex);
    if (hasOverlap(otherWindows, windows[windowIndex])) {
      toast.error('Time range overlaps with another availability');
      return;
    }

    setAvailabilityWindows({
      ...availabilityWindows,
      [dayIndex]: windows.sort((a, b) => 
        timeToMinutes(a.start_time) - timeToMinutes(b.start_time))
    });
  };

  const set24Hours = (dayIndex: number) => {
    setAvailabilityWindows({
      ...availabilityWindows,
      [dayIndex]: [{ start_time: '00:00', end_time: '23:59' }]
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

  const formatTime = (time: string): string => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const toggleDay = (dayIndex: number) => {
    const newOpenDays = new Set(openDays);
    if (newOpenDays.has(dayIndex)) {
      newOpenDays.delete(dayIndex);
    } else {
      newOpenDays.add(dayIndex);
    }
    setOpenDays(newOpenDays);
  };

  return (
    <div className="space-y-2">
      {DAYS.map((day, dayIndex) => {
        const windows = availabilityWindows[dayIndex];
        const isOpen = openDays.has(dayIndex);

        return (
          <div key={dayIndex} className="space-y-2">
            <Card className={cn(windows.length > 0 && "border-primary/20 bg-primary/5")}>
              <div className="p-4">
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => toggleDay(dayIndex)}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{day}</span>
                    {windows.length > 0 ? (
                      <Badge variant="secondary" className="text-xs">
                        {windows.length} {windows.length === 1 ? 'availability' : 'availabilities'}
                      </Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">Unavailable</span>
                    )}
                  </div>
                  <ChevronDown
                    className={cn(
                      "h-5 w-5 transition-transform",
                      isOpen && "transform rotate-180"
                    )}
                  />
                </div>

                <Collapsible open={isOpen}>
                  <CollapsibleContent className="mt-4 space-y-3">
                    {windows.map((window, windowIndex) => {
                      const startMinutes = timeToMinutes(window.start_time);
                      const endMinutes = timeToMinutes(window.end_time);

                      return (
                        <div key={windowIndex} className="space-y-2 p-3 rounded-lg bg-background border">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span>Availability {windowIndex + 1}</span>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeAvailability(dayIndex, windowIndex)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>

                          <Slider
                            value={[startMinutes, endMinutes]}
                            min={0}
                            max={1439}
                            step={15}
                            onValueChange={([start, end]) => 
                              updateAvailability(
                                dayIndex, 
                                windowIndex, 
                                minutesToTime(start), 
                                minutesToTime(end)
                              )
                            }
                            className="my-4"
                          />

                          <div className="flex justify-between text-sm text-muted-foreground">
                            <span>{formatTime(window.start_time)}</span>
                            <span>{formatTime(window.end_time)}</span>
                          </div>
                        </div>
                      );
                    })}

                    <div className="flex gap-2 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => addAvailability(dayIndex)}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Availability
                      </Button>
                      {windows.length !== 1 || windows[0].start_time !== '00:00' || windows[0].end_time !== '23:59' ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => set24Hours(dayIndex)}
                        >
                          24 Hours
                        </Button>
                      ) : null}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </Card>
          </div>
        );
      })}
    </div>
  );
};
