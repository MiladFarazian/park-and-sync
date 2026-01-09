import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Undo2, Briefcase, CalendarClock } from 'lucide-react';
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
  compact?: boolean;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
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
  compact = false,
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

  // History for undo
  const [history, setHistory] = useState<boolean[][][]>([]);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<'add' | 'remove'>('add');
  const [dragStart, setDragStart] = useState<{ day: number; slot: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ day: number; slot: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Save current state to history
  const saveToHistory = useCallback(() => {
    setHistory(prev => [...prev, grid.map(row => [...row])]);
  }, [grid]);

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

    saveToHistory();
    setGrid(prev => {
      const newGrid = prev.map(row => [...row]);
      range.forEach(({ day, slot }) => {
        newGrid[day][slot] = dragMode === 'add';
      });
      return newGrid;
    });
  }, [dragStart, getDragRange, dragMode, saveToHistory]);

  // Quick actions
  const set9to5MF = () => {
    saveToHistory();
    const newGrid = Array.from({ length: 7 }, () => Array(TOTAL_SLOTS).fill(false));
    for (let day = 1; day <= 5; day++) {
      for (let slot = timeToSlot('09:00'); slot < timeToSlot('17:00'); slot++) {
        newGrid[day][slot] = true;
      }
    }
    setGrid(newGrid);
    toast.success('Set Mon-Fri 9 AM - 5 PM');
  };

  const set24_7 = () => {
    saveToHistory();
    setGrid(Array.from({ length: 7 }, () => Array(TOTAL_SLOTS).fill(true)));
    toast.success('Set available 24/7');
  };

  const undo = () => {
    if (history.length === 0) {
      toast.error('Nothing to undo');
      return;
    }
    const previousState = history[history.length - 1];
    setHistory(prev => prev.slice(0, -1));
    setGrid(previousState);
    toast.success('Undid last action');
  };

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
          });
          slotStart = null;
        }
      }
    }

    onChange?.(rules);
  }, [grid, onChange]);

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
      {/* Instructions & Legend */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Click and drag to select available hours. Click on selected cells to remove.
        </p>
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-primary" />
            <span className="text-muted-foreground">Available</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-muted border border-border" />
            <span className="text-muted-foreground">Unavailable</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-primary/70" />
            <span className="text-muted-foreground">Selecting</span>
          </div>
        </div>
      </div>

      {/* Grid Container */}
      <Card className="overflow-hidden">
        <div 
          ref={gridRef}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchEnd={handleTouchEnd}
          onTouchMove={handleTouchMove}
          className={cn(compact && "max-h-[50vh] overflow-y-auto")}
        >
          {/* Header Row */}
          <div className={cn("flex border-b bg-muted/30", compact && "sticky top-0 z-10")}>
            <div className="w-8 sm:w-14 shrink-0 p-1 sm:p-2 text-[10px] sm:text-xs font-medium text-muted-foreground border-r">
              <span className="hidden sm:inline">Time</span>
            </div>
            {DAYS.map((day, dayIndex) => (
              <div 
                key={day} 
                className="flex-1 min-w-0 p-1 sm:p-2 text-center border-r last:border-r-0"
              >
                <div className="text-[10px] sm:text-xs font-medium">
                  <span className="sm:hidden">{DAYS_SHORT[dayIndex]}</span>
                  <span className="hidden sm:inline">{day}</span>
                </div>
                {!compact && (
                  <div className="hidden sm:block text-[10px] text-muted-foreground mt-0.5">
                    {getDaySummary(dayIndex)}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Time Grid */}
          <div className="relative">
            {HOURS.map((hour) => (
              <div key={hour} className="flex border-b last:border-b-0">
                {/* Time Label */}
                <div className={cn(
                  "w-8 sm:w-14 shrink-0 text-[8px] sm:text-[10px] text-muted-foreground border-r flex items-start justify-end pr-0.5 sm:pr-2",
                  compact ? "p-0 py-0.5" : "p-0.5 sm:p-1"
                )}>
                  {formatTimeDisplay(hour)}
                </div>
                
                {/* Day Columns */}
                {DAYS.map((_, dayIndex) => (
                  <div key={dayIndex} className="flex-1 min-w-0 flex flex-col border-r last:border-r-0">
                    {/* Two 30-minute slots per hour */}
                    {[0, 1].map((halfHour) => {
                      const slot = hour * SLOTS_PER_HOUR + halfHour;
                      const isActive = grid[dayIndex][slot];
                      const inRange = isInDragRange(dayIndex, slot);

                      return (
                        <div
                          key={halfHour}
                          data-day={dayIndex}
                          data-slot={slot}
                          onMouseDown={(e) => handleMouseDown(dayIndex, slot, e)}
                          onMouseEnter={() => handleMouseEnter(dayIndex, slot)}
                          onTouchStart={(e) => handleTouchStart(dayIndex, slot, e)}
                          className={cn(
                            "border-b border-border/30 last:border-b-0 cursor-pointer transition-colors",
                            compact ? "h-1.5 sm:h-2" : "h-2.5 sm:h-3",
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
      </Card>

      {/* Quick Actions - Below Grid */}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1 h-9"
          onClick={set24_7}
        >
          <CalendarClock className="h-4 w-4 mr-1.5" />
          24/7
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1 h-9"
          onClick={set9to5MF}
        >
          <Briefcase className="h-4 w-4 mr-1.5" />
          M-F 9-5
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1 h-9"
          onClick={undo}
          disabled={history.length === 0}
        >
          <Undo2 className="h-4 w-4 mr-1.5" />
          Undo
        </Button>
      </div>
    </div>
  );
};
