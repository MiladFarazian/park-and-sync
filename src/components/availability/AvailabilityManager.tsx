import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
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

interface TimeBlock {
  start_time: string;
  end_time: string;
}

interface AvailabilityManagerProps {
  initialRules?: AvailabilityRule[];
  onChange?: (rules: AvailabilityRule[]) => void;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const AvailabilityManager: React.FC<AvailabilityManagerProps> = ({ 
  initialRules = [], 
  onChange 
}) => {
  const groupByDay = (rules: AvailabilityRule[]) => {
    const grouped: Record<number, TimeBlock[]> = {};
    for (let i = 0; i < 7; i++) {
      grouped[i] = [];
    }
    rules.forEach(rule => {
      if (rule.is_available) {
        grouped[rule.day_of_week].push({
          start_time: rule.start_time,
          end_time: rule.end_time
        });
      }
    });
    return grouped;
  };

  const [timeBlocks, setTimeBlocks] = useState<Record<number, TimeBlock[]>>(groupByDay(initialRules));
  const [openDays, setOpenDays] = useState<Set<number>>(new Set());

  useEffect(() => {
    const rules: AvailabilityRule[] = [];
    Object.entries(timeBlocks).forEach(([day, blocks]) => {
      const dayNum = parseInt(day);
      if (blocks.length > 0) {
        blocks.forEach(block => {
          rules.push({
            day_of_week: dayNum,
            start_time: block.start_time,
            end_time: block.end_time,
            is_available: true
          });
        });
      } else {
        rules.push({
          day_of_week: dayNum,
          start_time: '00:00',
          end_time: '23:59',
          is_available: false
        });
      }
    });
    onChange?.(rules);
  }, [timeBlocks, onChange]);

  const addTimeBlock = (dayIndex: number) => {
    const blocks = timeBlocks[dayIndex];
    const newBlock: TimeBlock = {
      start_time: '09:00',
      end_time: '17:00'
    };

    if (hasOverlap(blocks, newBlock)) {
      toast.error('Time range overlaps with existing block');
      return;
    }

    setTimeBlocks({
      ...timeBlocks,
      [dayIndex]: [...blocks, newBlock].sort((a, b) => 
        timeToMinutes(a.start_time) - timeToMinutes(b.start_time)
      )
    });
    toast.success('Time block added');
  };

  const removeTimeBlock = (dayIndex: number, blockIndex: number) => {
    setTimeBlocks({
      ...timeBlocks,
      [dayIndex]: timeBlocks[dayIndex].filter((_, i) => i !== blockIndex)
    });
    toast.success('Time block removed');
  };

  const updateTimeBlock = (dayIndex: number, blockIndex: number, start: string, end: string) => {
    const blocks = [...timeBlocks[dayIndex]];
    blocks[blockIndex] = { start_time: start, end_time: end };
    
    const otherBlocks = blocks.filter((_, i) => i !== blockIndex);
    if (hasOverlap(otherBlocks, blocks[blockIndex])) {
      toast.error('Time range overlaps with another block');
      return;
    }

    setTimeBlocks({
      ...timeBlocks,
      [dayIndex]: blocks.sort((a, b) => 
        timeToMinutes(a.start_time) - timeToMinutes(b.start_time)
      )
    });
  };

  const set24Hours = (dayIndex: number) => {
    setTimeBlocks({
      ...timeBlocks,
      [dayIndex]: [{ start_time: '00:00', end_time: '23:59' }]
    });
    toast.success('Set to 24 hours');
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
        const blocks = timeBlocks[dayIndex];
        const isOpen = openDays.has(dayIndex);

        return (
          <Collapsible key={dayIndex} open={isOpen} onOpenChange={() => toggleDay(dayIndex)}>
            <Card className={cn(blocks.length > 0 && "border-primary/20 bg-primary/5")}>
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <ChevronDown className={cn(
                      "h-4 w-4 text-muted-foreground transition-transform",
                      isOpen && "transform rotate-180"
                    )} />
                    <Label className="text-base font-semibold cursor-pointer">{day}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    {blocks.length > 0 ? (
                      <span className="text-sm text-muted-foreground">
                        {blocks.length} {blocks.length === 1 ? 'block' : 'blocks'}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">Unavailable</span>
                    )}
                  </div>
                </div>
              </CollapsibleTrigger>
              
              <CollapsibleContent>
                <CardContent className="pt-0 pb-4 px-4 space-y-3">
                  {blocks.map((block, blockIndex) => {
                    const startMinutes = timeToMinutes(block.start_time);
                    const endMinutes = timeToMinutes(block.end_time);

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
                            onClick={() => removeTimeBlock(dayIndex, blockIndex)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                        
                        <div className="px-2">
                          <Slider
                            value={[startMinutes, endMinutes]}
                            min={0}
                            max={1439}
                            step={30}
                            onValueChange={(values) => {
                              updateTimeBlock(
                                dayIndex, 
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

                  <div className="flex gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addTimeBlock(dayIndex)}
                      className="flex-1"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Time Range
                    </Button>
                    {blocks.length !== 1 || blocks[0].start_time !== '00:00' || blocks[0].end_time !== '23:59' ? (
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
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })}
    </div>
  );
};
