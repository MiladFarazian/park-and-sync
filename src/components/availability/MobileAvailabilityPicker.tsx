import { useState, useEffect, useCallback } from 'react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Clock, Zap, CalendarClock, Briefcase } from 'lucide-react';

export interface AvailabilityRule {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
  custom_rate?: number | null;
}

interface DaySchedule {
  enabled: boolean;
  startHour: number;
  endHour: number;
}

interface MobileAvailabilityPickerProps {
  initialRules?: AvailabilityRule[];
  onChange?: (rules: AvailabilityRule[]) => void;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const formatHour = (hour: number): string => {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  if (hour === 24) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
};

const HOUR_OPTIONS = Array.from({ length: 25 }, (_, i) => i); // 0-24 for end time

export const MobileAvailabilityPicker = ({
  initialRules = [],
  onChange,
}: MobileAvailabilityPickerProps) => {
  // Initialize schedule from rules
  const [schedule, setSchedule] = useState<DaySchedule[]>(() => {
    const initial: DaySchedule[] = Array.from({ length: 7 }, () => ({
      enabled: false,
      startHour: 9,
      endHour: 17,
    }));

    // Parse initial rules
    initialRules.forEach(rule => {
      if (!rule.is_available) return;
      const startHour = parseInt(rule.start_time.split(':')[0]);
      const endHour = parseInt(rule.end_time.split(':')[0]);
      initial[rule.day_of_week] = {
        enabled: true,
        startHour,
        endHour: endHour === 0 ? 24 : endHour,
      };
    });

    return initial;
  });

  // Convert schedule to rules
  useEffect(() => {
    const rules: AvailabilityRule[] = schedule
      .map((day, index) => {
        if (!day.enabled) return null;
        return {
          day_of_week: index,
          start_time: `${day.startHour.toString().padStart(2, '0')}:00`,
          end_time: `${(day.endHour === 24 ? 0 : day.endHour).toString().padStart(2, '0')}:00`,
          is_available: true,
        };
      })
      .filter((rule): rule is AvailabilityRule => rule !== null);

    onChange?.(rules);
  }, [schedule, onChange]);

  const toggleDay = useCallback((dayIndex: number) => {
    setSchedule(prev => prev.map((day, i) => 
      i === dayIndex ? { ...day, enabled: !day.enabled } : day
    ));
  }, []);

  const setDayHours = useCallback((dayIndex: number, startHour: number, endHour: number) => {
    setSchedule(prev => prev.map((day, i) => 
      i === dayIndex ? { ...day, startHour, endHour, enabled: true } : day
    ));
  }, []);

  // Quick actions
  const set24_7 = () => {
    setSchedule(Array.from({ length: 7 }, () => ({
      enabled: true,
      startHour: 0,
      endHour: 24,
    })));
  };

  const set9to5WeekDays = () => {
    setSchedule(prev => prev.map((_, i) => ({
      enabled: i >= 1 && i <= 5,
      startHour: 9,
      endHour: 17,
    })));
  };

  const clearAll = () => {
    setSchedule(Array.from({ length: 7 }, () => ({
      enabled: false,
      startHour: 9,
      endHour: 17,
    })));
  };

  const enabledCount = schedule.filter(d => d.enabled).length;

  return (
    <div className="space-y-4">
      {/* Quick Actions - Clean pill buttons */}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={set24_7}
          className="flex-1 h-10 text-sm font-medium"
        >
          <CalendarClock className="h-4 w-4 mr-1.5" />
          24/7
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={set9to5WeekDays}
          className="flex-1 h-10 text-sm font-medium"
        >
          <Briefcase className="h-4 w-4 mr-1.5" />
          M-F 9-5
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={clearAll}
          className="h-10 text-sm text-muted-foreground"
        >
          Clear
        </Button>
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between text-sm px-1">
        <span className="text-muted-foreground">
          {enabledCount === 0 
            ? 'No days selected' 
            : enabledCount === 7 
            ? 'Available every day' 
            : `${enabledCount} day${enabledCount > 1 ? 's' : ''} selected`}
        </span>
        {enabledCount > 0 && (
          <span className="text-primary font-medium flex items-center gap-1">
            <Zap className="h-3.5 w-3.5" />
            Active
          </span>
        )}
      </div>

      {/* Days List */}
      <div className="space-y-2">
        {schedule.map((day, dayIndex) => (
          <div
            key={dayIndex}
            className={cn(
              "rounded-xl border transition-all",
              day.enabled 
                ? "bg-primary/5 border-primary/30" 
                : "bg-muted/30 border-border"
            )}
          >
            {/* Day Header */}
            <div 
              className="flex items-center justify-between p-3 cursor-pointer"
              onClick={() => toggleDay(dayIndex)}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center text-sm font-semibold",
                  day.enabled 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-muted text-muted-foreground"
                )}>
                  {DAYS_SHORT[dayIndex]}
                </div>
                <div>
                  <p className={cn(
                    "font-medium text-sm",
                    !day.enabled && "text-muted-foreground"
                  )}>
                    {DAYS[dayIndex]}
                  </p>
                  {day.enabled && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatHour(day.startHour)} – {formatHour(day.endHour)}
                    </p>
                  )}
                </div>
              </div>
              <Switch
                checked={day.enabled}
                onCheckedChange={() => toggleDay(dayIndex)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {/* Time Selection - Collapsible */}
            {day.enabled && (
              <div className="px-3 pb-3 pt-0">
                <div className="flex gap-2 items-center">
                  {/* Start Time */}
                  <div className="flex-1">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1 block">
                      From
                    </label>
                    <select
                      value={day.startHour}
                      onChange={(e) => {
                        const newStart = parseInt(e.target.value);
                        const newEnd = Math.max(newStart + 1, day.endHour);
                        setDayHours(dayIndex, newStart, Math.min(newEnd, 24));
                      }}
                      className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      {HOUR_OPTIONS.slice(0, 24).map(hour => (
                        <option key={hour} value={hour}>
                          {formatHour(hour)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <span className="text-muted-foreground mt-5">→</span>

                  {/* End Time */}
                  <div className="flex-1">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1 block">
                      To
                    </label>
                    <select
                      value={day.endHour}
                      onChange={(e) => {
                        const newEnd = parseInt(e.target.value);
                        setDayHours(dayIndex, day.startHour, newEnd);
                      }}
                      className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      {HOUR_OPTIONS.slice(day.startHour + 1).map(hour => (
                        <option key={hour} value={hour}>
                          {formatHour(hour)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
