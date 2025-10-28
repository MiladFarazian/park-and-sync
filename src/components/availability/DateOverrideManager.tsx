import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
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

interface TimeBlock {
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
}) => {
  const groupByDate = (overrides: DateOverride[]) => {
    const grouped: Record<string, { is_available: boolean; blocks: TimeBlock[] }> = {};
    overrides.forEach(override => {
      if (!grouped[override.override_date]) {
        grouped[override.override_date] = {
          is_available: override.is_available,
          blocks: []
        };
      }
      if (override.start_time && override.end_time) {
        grouped[override.override_date].blocks.push({
          start_time: override.start_time,
          end_time: override.end_time
        });
      }
    });
    return grouped;
  };

  const [overrides, setOverrides] = useState<Record<string, { is_available: boolean; blocks: TimeBlock[] }>>(
    groupByDate(initialOverrides)
  );
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [isBlocked, setIsBlocked] = useState(true);

  useEffect(() => {
    const result: DateOverride[] = [];
    Object.entries(overrides).forEach(([date, data]) => {
      if (data.blocks.length > 0) {
        data.blocks.forEach(block => {
          result.push({
            override_date: date,
            start_time: block.start_time,
            end_time: block.end_time,
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
        is_available: !isBlocked,
        blocks: [{ start_time: startTime, end_time: endTime }]
      }
    });
    
    setSelectedDate(undefined);
    setStartTime('09:00');
    setEndTime('17:00');
    setIsBlocked(true);
    toast.success('Date override added');
  };

  const removeOverride = (dateStr: string) => {
    const newOverrides = { ...overrides };
    delete newOverrides[dateStr];
    setOverrides(newOverrides);
    toast.success('Date override removed');
  };

  const addTimeBlock = (dateStr: string) => {
    const override = overrides[dateStr];
    const newBlock: TimeBlock = {
      start_time: '09:00',
      end_time: '17:00'
    };

    if (hasOverlap(override.blocks, newBlock)) {
      toast.error('Time range overlaps with existing block');
      return;
    }

    setOverrides({
      ...overrides,
      [dateStr]: {
        ...override,
        blocks: [...override.blocks, newBlock].sort((a, b) => 
          timeToMinutes(a.start_time) - timeToMinutes(b.start_time)
        )
      }
    });
    toast.success('Time block added');
  };

  const removeTimeBlock = (dateStr: string, blockIndex: number) => {
    const override = overrides[dateStr];
    setOverrides({
      ...overrides,
      [dateStr]: {
        ...override,
        blocks: override.blocks.filter((_, i) => i !== blockIndex)
      }
    });
    toast.success('Time block removed');
  };

  const updateTimeBlock = (dateStr: string, blockIndex: number, start: string, end: string) => {
    const override = overrides[dateStr];
    const blocks = [...override.blocks];
    blocks[blockIndex] = { start_time: start, end_time: end };
    
    const otherBlocks = blocks.filter((_, i) => i !== blockIndex);
    if (hasOverlap(otherBlocks, blocks[blockIndex])) {
      toast.error('Time range overlaps with another block');
      return;
    }

    setOverrides({
      ...overrides,
      [dateStr]: {
        ...override,
        blocks: blocks.sort((a, b) => 
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

  const hasOverlap = (blocks: TimeBlock[], newBlock: TimeBlock): boolean => {
    const newStart = timeToMinutes(newBlock.start_time);
    const newEnd = timeToMinutes(newBlock.end_time);

    return blocks.some(block => {
      const start = timeToMinutes(block.start_time);
      const end = timeToMinutes(block.end_time);
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
            <Label className="mb-2 block">Select Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
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
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <Label className="mb-2 block">Time Range</Label>
            <div className="space-y-2">
              <div className="px-2">
                <Slider
                  value={[startMinutes, endMinutes]}
                  min={0}
                  max={1439}
                  step={30}
                  onValueChange={(values) => {
                    setStartTime(minutesToTime(values[0]));
                    setEndTime(minutesToTime(values[1]));
                  }}
                  className="w-full"
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground px-2">
                <span>{formatTime(startTime)}</span>
                <span>{formatTime(endTime)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label>Status</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsBlocked(!isBlocked)}
            >
              {isBlocked ? 'Blocked' : 'Available'}
            </Button>
          </div>

          <Button onClick={addOverride} disabled={!selectedDate} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Add Override
          </Button>
        </CardContent>
      </Card>

      {sortedDates.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-6 text-center">
            <CalendarIcon className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              No date overrides set. Add specific dates to override your weekly schedule.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sortedDates.map((dateStr) => {
            const override = overrides[dateStr];

            return (
              <Card key={dateStr} className={cn(!override.is_available && "border-destructive/20 bg-destructive/5")}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="font-semibold">
                        {format(new Date(dateStr + 'T00:00:00'), 'EEEE, MMMM d, yyyy')}
                      </Label>
                      <div className="flex items-center gap-2 mt-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleAvailability(dateStr)}
                          className="h-auto p-0 text-xs"
                        >
                          {override.is_available ? '✓ Available' : '✕ Blocked'}
                        </Button>
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

                  {override.blocks.map((block, blockIndex) => {
                    const blockStartMinutes = timeToMinutes(block.start_time);
                    const blockEndMinutes = timeToMinutes(block.end_time);

                    return (
                      <div key={blockIndex} className="space-y-2 p-3 rounded-lg bg-background border">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" />
                            <span>Block {blockIndex + 1}</span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeTimeBlock(dateStr, blockIndex)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                        
                        <div className="px-2">
                          <Slider
                            value={[blockStartMinutes, blockEndMinutes]}
                            min={0}
                            max={1439}
                            step={30}
                            onValueChange={(values) => {
                              updateTimeBlock(
                                dateStr,
                                blockIndex,
                                minutesToTime(values[0]),
                                minutesToTime(values[1])
                              );
                            }}
                            className="w-full"
                          />
                        </div>
                        
                        <div className="flex justify-between text-xs text-muted-foreground px-2">
                          <span>{formatTime(block.start_time)}</span>
                          <span>{formatTime(block.end_time)}</span>
                        </div>
                      </div>
                    );
                  })}

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addTimeBlock(dateStr)}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Time Range
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
