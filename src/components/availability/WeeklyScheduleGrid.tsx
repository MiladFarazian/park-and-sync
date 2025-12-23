import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { DollarSign, RotateCcw, Clock, Briefcase, CalendarClock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export interface AvailabilityRule {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
  custom_rate?: number | null;
}

interface WeeklyScheduleGridProps {
  initialRules?: AvailabilityRule[];
  onChange?: (rules: AvailabilityRule[]) => void;
  baseRate?: number;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const SLOTS_PER_HOUR = 2; // 30-minute slots
const TOTAL_SLOTS = 24 * SLOTS_PER_HOUR;

// Convert HH:MM to slot index
const timeToSlot = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * SLOTS_PER_HOUR + Math.floor(minutes / 30);
};

// Convert slot index to HH:MM
const slotToTime = (slot: number): string => {
  const hours = Math.floor(slot / SLOTS_PER_HOUR);
  const minutes = (slot % SLOTS_PER_HOUR) * 30;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

// Format time for display
const formatTimeDisplay = (hour: number): string => {
  if (hour === 0) return '12am';
  if (hour === 12) return '12pm';
  if (hour < 12) return `${hour}am`;
  return `${hour - 12}pm`;
};

export const WeeklyScheduleGrid = ({
  initialRules = [],
  onChange,
  baseRate = 0
}: WeeklyScheduleGridProps) => {
  // Grid state: 7 days x 48 slots (30-min each)
  const [grid, setGrid] = useState<boolean[][]>(() => {
    const initial = Array.from({ length: 7 }, () => Array(TOTAL_SLOTS).fill(false));
    
    // Apply initial rules
    initialRules.forEach(rule => {
      if (!rule.is_available) return;
      const startSlot = timeToSlot(rule.start_time);
      const endSlot = timeToSlot(rule.end_time);
      for (let slot = startSlot; slot < endSlot; slot++) {
        if (slot < TOTAL_SLOTS) {
          initial[rule.day_of_week][slot] = true;
        }
      }
    });
    
    return initial;
  });

  // Custom rates per day
  const [customRates, setCustomRates] = useState<(number | null)[]>(() => {
    const rates: (number | null)[] = Array(7).fill(null);
    initialRules.forEach(rule => {
      if (rule.custom_rate !== undefined && rule.custom_rate !== null) {
        rates[rule.day_of_week] = rule.custom_rate;
      }
    });
    return rates;
  });

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<'add' | 'remove'>('add');
  const [dragStart, setDragStart] = useState<{ day: number; slot: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ day: number; slot: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Custom rate editing
  const [editingRate, setEditingRate] = useState<number | null>(null);

  // Get cells in drag range
  const getDragRange = useCallback(() => {
    if (!dragStart || !dragEnd) return [];
    
    const minDay = Math.min(dragStart.day, dragEnd.day);
    const maxDay = Math.max(dragStart.day, dragEnd.day);
    const minSlot = Math.min(dragStart.slot, dragEnd.slot);
    const maxSlot = Math.max(dragStart.slot, dragEnd.slot);
    
    const cells: { day: number; slot: number }[] = [];
    for (let day = minDay; day <= maxDay; day++) {
      for (let slot = minSlot; slot <= maxSlot; slot++) {
        cells.push({ day, slot });
      }
    }
    return cells;
  }, [dragStart, dragEnd]);

  const dragRange = useMemo(() => getDragRange(), [getDragRange]);

  // Apply drag selection
  const applyDrag = useCallback(() => {
    if (!dragStart) return;
    
    const range = getDragRange();
    if (range.length === 0) return;

    setGrid(prev => {
      const newGrid = prev.map(row => [...row]);
      range.forEach(({ day, slot }) => {
        newGrid[day][slot] = dragMode === 'add';
      });
      return newGrid;
    });
  }, [dragStart, getDragRange, dragMode]);

  // Convert grid to rules
  useEffect(() => {
    const rules: AvailabilityRule[] = [];

    for (let day = 0; day < 7; day++) {
      let slotStart: number | null = null;

      for (let slot = 0; slot <= TOTAL_SLOTS; slot++) {
        const isActive = slot < TOTAL_SLOTS && grid[day][slot];

        if (isActive && slotStart === null) {
          slotStart = slot;
        } else if (!isActive && slotStart !== null) {
          rules.push({
            day_of_week: day,
            start_time: slotToTime(slotStart),
            end_time: slotToTime(slot),
            is_available: true,
            custom_rate: customRates[day],
          });
          slotStart = null;
        }
      }
    }

    onChange?.(rules);
  }, [grid, customRates, onChange]);

  // Handle mouse events
  const handleMouseDown = (day: number, slot: number, e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragMode(grid[day][slot] ? 'remove' : 'add');
    setDragStart({ day, slot });
    setDragEnd({ day, slot });
  };

  const handleMouseEnter = (day: number, slot: number) => {
    if (isDragging) {
      setDragEnd({ day, slot });
    }
  };

  const handleMouseUp = () => {
    if (isDragging) {
      applyDrag();
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
    }
  };

  // Handle touch events for mobile
  const handleTouchStart = (day: number, slot: number, e: React.TouchEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragMode(grid[day][slot] ? 'remove' : 'add');
    setDragStart({ day, slot });
    setDragEnd({ day, slot });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || !gridRef.current) return;
    
    const touch = e.touches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!element) return;
    
    const dayAttr = element.getAttribute('data-day');
    const slotAttr = element.getAttribute('data-slot');
    
    if (dayAttr !== null && slotAttr !== null) {
      setDragEnd({ day: parseInt(dayAttr), slot: parseInt(slotAttr) });
    }
  };

  const handleTouchEnd = () => {
    if (isDragging) {
      applyDrag();
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
    }
  };

  // Check if cell is in drag range
  const isInDragRange = (day: number, slot: number) => {
    return dragRange.some(cell => cell.day === day && cell.slot === slot);
  };

  // Quick actions
  const set9to5 = () => {
    const newGrid = Array.from({ length: 7 }, () => Array(TOTAL_SLOTS).fill(false));
    for (let day = 0; day < 7; day++) {
      for (let slot = timeToSlot('09:00'); slot < timeToSlot('17:00'); slot++) {
        newGrid[day][slot] = true;
      }
    }
    setGrid(newGrid);
    toast.success('Set weekdays 9 AM - 5 PM');
  };

  const set24_7 = () => {
    setGrid(Array.from({ length: 7 }, () => Array(TOTAL_SLOTS).fill(true)));
    toast.success('Set available 24/7');
  };

  const clearAll = () => {
    setGrid(Array.from({ length: 7 }, () => Array(TOTAL_SLOTS).fill(false)));
    setCustomRates(Array(7).fill(null));
    toast.success('Cleared all availability');
  };

  const setWeekendPremium = () => {
    if (baseRate > 0) {
      const weekendRate = Math.round(baseRate * 1.5 * 100) / 100;
      const newRates = [...customRates];
      newRates[0] = weekendRate; // Sunday
      newRates[6] = weekendRate; // Saturday
      setCustomRates(newRates);
      toast.success(`Weekend rate set to $${weekendRate}/hr`);
    }
  };

  // Get summary for a day
  const getDaySummary = (dayIndex: number): string => {
    const activeSlots = grid[dayIndex].filter(Boolean).length;
    if (activeSlots === 0) return 'Closed';
    if (activeSlots === TOTAL_SLOTS) return '24h';
    
    // Find time ranges
    const ranges: string[] = [];
    let start: number | null = null;
    
    for (let slot = 0; slot <= TOTAL_SLOTS; slot++) {
      const isActive = slot < TOTAL_SLOTS && grid[dayIndex][slot];
      if (isActive && start === null) {
        start = slot;
      } else if (!isActive && start !== null) {
        const startHour = Math.floor(start / SLOTS_PER_HOUR);
        const endHour = Math.floor(slot / SLOTS_PER_HOUR);
        ranges.push(`${formatTimeDisplay(startHour)}-${formatTimeDisplay(endHour)}`);
        start = null;
      }
    }
    
    return ranges.length > 2 ? `${ranges.length} slots` : ranges.join(', ');
  };

  return (
    <div className="space-y-4">
      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9"
          onClick={set9to5}
        >
          <Briefcase className="h-4 w-4 mr-1.5" />
          9-5
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9"
          onClick={set24_7}
        >
          <CalendarClock className="h-4 w-4 mr-1.5" />
          24/7
        </Button>
        {baseRate > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9"
            onClick={setWeekendPremium}
          >
            <DollarSign className="h-4 w-4 mr-1.5" />
            Weekend +50%
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9"
          onClick={clearAll}
        >
          <RotateCcw className="h-4 w-4 mr-1.5" />
          Clear
        </Button>
      </div>

      {/* Instructions */}
      <p className="text-xs text-muted-foreground">
        Click and drag to select available hours. Click on selected cells to remove.
      </p>

      {/* Grid Container */}
      <Card className="overflow-hidden">
        <div 
          ref={gridRef}
          className="overflow-x-auto"
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchEnd={handleTouchEnd}
          onTouchMove={handleTouchMove}
        >
          <div className="min-w-[600px]">
            {/* Header Row */}
            <div className="flex border-b bg-muted/30">
              <div className="w-14 shrink-0 p-2 text-xs font-medium text-muted-foreground border-r">
                Time
              </div>
              {DAYS.map((day, dayIndex) => (
                <div 
                  key={day} 
                  className="flex-1 p-2 text-center border-r last:border-r-0"
                >
                  <div className="text-xs font-medium">{day}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {getDaySummary(dayIndex)}
                  </div>
                  {customRates[dayIndex] !== null && (
                    <Badge 
                      variant="secondary" 
                      className="mt-1 text-[10px] px-1.5 py-0 h-4 bg-green-500/20 text-green-700 dark:text-green-400 cursor-pointer"
                      onClick={() => setEditingRate(dayIndex)}
                    >
                      ${customRates[dayIndex]}/hr
                    </Badge>
                  )}
                </div>
              ))}
            </div>

            {/* Time Grid */}
            <div className="relative">
              {HOURS.map((hour) => (
                <div key={hour} className="flex border-b last:border-b-0">
                  {/* Time Label */}
                  <div className="w-14 shrink-0 p-1 text-[10px] text-muted-foreground border-r flex items-start justify-end pr-2">
                    {formatTimeDisplay(hour)}
                  </div>
                  
                  {/* Day Columns */}
                  {DAYS.map((_, dayIndex) => (
                    <div key={dayIndex} className="flex-1 flex flex-col border-r last:border-r-0">
                      {/* Two 30-minute slots per hour */}
                      {[0, 1].map((halfHour) => {
                        const slot = hour * SLOTS_PER_HOUR + halfHour;
                        const isActive = grid[dayIndex][slot];
                        const inRange = isInDragRange(dayIndex, slot);
                        const willBeActive = inRange ? dragMode === 'add' : isActive;

                        return (
                          <div
                            key={halfHour}
                            data-day={dayIndex}
                            data-slot={slot}
                            onMouseDown={(e) => handleMouseDown(dayIndex, slot, e)}
                            onMouseEnter={() => handleMouseEnter(dayIndex, slot)}
                            onTouchStart={(e) => handleTouchStart(dayIndex, slot, e)}
                            className={cn(
                              "h-3 border-b border-border/30 last:border-b-0 cursor-pointer transition-colors",
                              isActive && !inRange && "bg-primary",
                              inRange && dragMode === 'add' && "bg-primary/70",
                              inRange && dragMode === 'remove' && "bg-destructive/30",
                              !isActive && !inRange && "hover:bg-muted",
                              halfHour === 0 && "border-t border-border/50"
                            )}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Custom Rate Editor */}
      {editingRate !== null && (
        <Card className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                Custom rate for {DAYS[editingRate]}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={customRates[editingRate] || ''}
                  onChange={(e) => {
                    const newRates = [...customRates];
                    newRates[editingRate] = e.target.value ? parseFloat(e.target.value) : null;
                    setCustomRates(newRates);
                  }}
                  className="w-24 pl-5 h-8 text-sm"
                  placeholder="0"
                />
              </div>
              <span className="text-xs text-muted-foreground">/hr</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  const newRates = [...customRates];
                  newRates[editingRate] = null;
                  setCustomRates(newRates);
                }}
              >
                Reset
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setEditingRate(null)}
              >
                Done
              </Button>
            </div>
          </div>
          {!customRates[editingRate] && baseRate > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              Using base rate: ${baseRate}/hr
            </p>
          )}
        </Card>
      )}

      {/* Day Rate Quick Buttons */}
      <div className="flex flex-wrap gap-2">
        {DAYS.map((day, dayIndex) => {
          const hasSlots = grid[dayIndex].some(Boolean);
          if (!hasSlots) return null;
          
          return (
            <Button
              key={dayIndex}
              type="button"
              variant={customRates[dayIndex] !== null ? "secondary" : "outline"}
              size="sm"
              className={cn(
                "h-8 text-xs",
                customRates[dayIndex] !== null && "bg-green-500/20 hover:bg-green-500/30 text-green-700 dark:text-green-400"
              )}
              onClick={() => setEditingRate(dayIndex)}
            >
              <DollarSign className="h-3 w-3 mr-1" />
              {day} {customRates[dayIndex] !== null ? `$${customRates[dayIndex]}` : 'Set rate'}
            </Button>
          );
        })}
      </div>
    </div>
  );
};
