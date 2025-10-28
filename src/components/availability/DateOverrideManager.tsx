import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar as CalendarIcon, Plus, Trash2, Clock } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

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
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [isUnavailable, setIsUnavailable] = useState(true);

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
    if (!selectedDate) {
      toast.error('Please select a date');
      return;
    }

    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    
    if (overrides[dateStr]) {
      toast.error('Override already exists for this date');
      return;
    }

    setOverrides({
      ...overrides,
      [dateStr]: {
        is_available: !isUnavailable,
        windows: [{ start_time: startTime, end_time: endTime }]
      }
    });
    
    setSelectedDate(undefined);
    setStartTime('09:00');
    setEndTime('17:00');
    setIsUnavailable(true);
    toast.success('Date override added');
  };

  const removeOverride = (dateStr: string) => {
    const newOverrides = { ...overrides };
    delete newOverrides[dateStr];
    setOverrides(newOverrides);
    toast.success('Date override removed');
  };

  const addAvailability = (dateStr: string) => {
    const override = overrides[dateStr];
    const newWindow: TimeRange = {
      start_time: '09:00',
      end_time: '17:00'
    };

    if (hasOverlap(override.windows, newWindow)) {
      toast.error('Time range overlaps with existing availability');
      return;
    }

    setOverrides({
      ...overrides,
      [dateStr]: {
        ...override,
        windows: [...override.windows, newWindow].sort((a, b) => 
          timeToMinutes(a.start_time) - timeToMinutes(b.start_time)
        )
      }
    });
    toast.success('Availability added');
  };

  const removeAvailability = (dateStr: string, windowIndex: number) => {
    const override = overrides[dateStr];
    setOverrides({
      ...overrides,
      [dateStr]: {
        ...override,
        windows: override.windows.filter((_, i) => i !== windowIndex)
      }
    });
    toast.success('Availability removed');
  };

  const updateAvailability = (dateStr: string, windowIndex: number, start: string, end: string) => {
    const override = overrides[dateStr];
    const windows = [...override.windows];
    windows[windowIndex] = { start_time: start, end_time: end };

    const otherWindows = windows.filter((_, i) => i !== windowIndex);
    if (hasOverlap(otherWindows, windows[windowIndex])) {
      toast.error('Time range overlaps with another availability');
      return;
    }

    setOverrides({
      ...overrides,
      [dateStr]: {
        ...override,
        windows: windows.sort((a, b) => 
          timeToMinutes(a.start_time) - timeToMinutes(b.start_time)
        )
      }
    });
  };

  const toggleAvailability = (dateStr: string) => {
    setOverrides({
      ...overrides,
      [dateStr]: {
        ...overrides[dateStr],
        is_available: !overrides[dateStr].is_available
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

  const formatTime = (time: string): string => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const sortedDates = Object.keys(overrides).sort();
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);

  return (
    <div className="space-y-4">
      <Card className="border-dashed">
        <CardContent className="p-4 space-y-4">
          <div>
            <Label htmlFor="date-picker">Select Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="date-picker"
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal mt-2",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <Label htmlFor="time-range">Time Range</Label>
            <div className="space-y-2 mt-2">
              <Slider
                id="time-range"
                value={[startMinutes, endMinutes]}
                min={0}
                max={1439}
                step={15}
                onValueChange={([start, end]) => {
                  setStartTime(minutesToTime(start));
                  setEndTime(minutesToTime(end));
                }}
              />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{formatTime(startTime)}</span>
                <span>{formatTime(endTime)}</span>
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="status">Status</Label>
            <Select value={isUnavailable ? "unavailable" : "available"} onValueChange={(value) => setIsUnavailable(value === "unavailable")}>
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unavailable">Mark as Unavailable</SelectItem>
                <SelectItem value="available">Mark as Available</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button onClick={addOverride} disabled={!selectedDate} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Add Override
          </Button>
        </CardContent>
      </Card>

      {sortedDates.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-6 text-center text-muted-foreground">
            <CalendarIcon className="h-8 w-8 mx-auto mb-2" />
            <p className="text-sm">No date overrides set</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sortedDates.map((dateStr) => {
            const override = overrides[dateStr];

            return (
              <Card key={dateStr}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="font-medium">
                        {format(new Date(dateStr + 'T00:00:00'), 'EEEE, MMMM d, yyyy')}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={override.is_available ? "default" : "secondary"}>
                          {override.is_available ? "Available" : "Unavailable"}
                        </Badge>
                        {override.windows.length > 0 && (
                          <Badge variant="outline" className="text-xs">
                            {override.windows.length} {override.windows.length === 1 ? 'availability' : 'availabilities'}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeOverride(dateStr)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>

                  {override.windows.map((window, windowIndex) => {
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
                            onClick={() => removeAvailability(dateStr, windowIndex)}
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
                              dateStr, 
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

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => addAvailability(dateStr)}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Availability
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
