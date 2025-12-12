import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Calendar as CalendarIcon, Plus, Trash2, Clock, X, Ban, CalendarPlus } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

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
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [overrideMode, setOverrideMode] = useState<OverrideMode>('block');
  const [calendarOpen, setCalendarOpen] = useState(false);

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

    const isAvailable = overrideMode !== 'block';
    const hasCustomHours = overrideMode === 'custom_hours' || overrideMode === 'make_available';

    setOverrides({
      ...overrides,
      [dateStr]: {
        is_available: isAvailable,
        windows: hasCustomHours ? [{ start_time: '09:00', end_time: '17:00' }] : []
      }
    });
    
    setSelectedDate(undefined);
    setCalendarOpen(false);
    
    const messages: Record<OverrideMode, string> = {
      block: 'Date blocked',
      make_available: 'Date marked as available',
      custom_hours: 'Custom hours added'
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

  const timeToMinutes = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const sortedDates = Object.keys(overrides).sort();
  const blockedDates = sortedDates.filter(d => !overrides[d].is_available);
  const specialDates = sortedDates.filter(d => overrides[d].is_available);

  return (
    <div className="space-y-6">
      {/* Add Override Section */}
      <Card className="border-dashed">
        <CardContent className="p-4 space-y-4">
          <div className="text-sm font-medium">Add Date Override</div>
          
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
              Block Date
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
            {overrideMode === 'block' && "Block this date so no one can book during regular hours."}
            {overrideMode === 'make_available' && "Make a normally unavailable day available for booking."}
            {overrideMode === 'custom_hours' && "Set different hours than your regular schedule."}
          </p>

          {/* Date Picker */}
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !selectedDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {selectedDate ? format(selectedDate, "EEEE, MMMM d, yyyy") : "Select a date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                  setSelectedDate(date);
                }}
                disabled={(date) => {
                  const dateStr = format(date, 'yyyy-MM-dd');
                  return date < new Date(new Date().setHours(0, 0, 0, 0)) || !!overrides[dateStr];
                }}
                initialFocus
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>

          <Button 
            onClick={addOverride} 
            disabled={!selectedDate} 
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-2" />
            {overrideMode === 'block' && 'Block This Date'}
            {overrideMode === 'make_available' && 'Make This Date Available'}
            {overrideMode === 'custom_hours' && 'Add Custom Hours'}
          </Button>
        </CardContent>
      </Card>

      {/* Blocked Dates */}
      {blockedDates.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Ban className="h-4 w-4" />
            Blocked Dates ({blockedDates.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {blockedDates.map((dateStr) => (
              <Badge
                key={dateStr}
                variant="secondary"
                className="px-3 py-1.5 text-sm flex items-center gap-2"
              >
                {format(new Date(dateStr + 'T00:00:00'), 'MMM d, yyyy')}
                <button
                  onClick={() => removeOverride(dateStr)}
                  className="hover:text-destructive transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
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
            <CalendarIcon className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No date overrides</p>
            <p className="text-sm mt-1">Block specific dates or set special hours for holidays</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
