import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';

export interface AvailabilityRule {
  day_of_week: number; // 0 = Sunday, 6 = Saturday
  start_time: string; // HH:MM format
  end_time: string; // HH:MM format
  is_available: boolean;
}

interface AvailabilityManagerProps {
  initialRules?: AvailabilityRule[];
  onChange?: (rules: AvailabilityRule[]) => void;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const AvailabilityManager: React.FC<AvailabilityManagerProps> = ({ 
  initialRules = [], 
  onChange 
}) => {
  // Initialize with one rule per day, default unavailable
  const getInitialRules = () => {
    if (initialRules.length > 0) {
      // Ensure all 7 days are represented
      const ruleMap = new Map(initialRules.map(r => [r.day_of_week, r]));
      return DAYS.map((_, index) => 
        ruleMap.get(index) || {
          day_of_week: index,
          start_time: '00:00',
          end_time: '23:59',
          is_available: false,
        }
      );
    }
    return DAYS.map((_, index) => ({
      day_of_week: index,
      start_time: '00:00',
      end_time: '23:59',
      is_available: false,
    }));
  };

  const [rules, setRules] = useState<AvailabilityRule[]>(getInitialRules());

  useEffect(() => {
    // Return all rules, not just available ones
    onChange?.(rules);
  }, [rules, onChange]);

  const updateDay = (dayIndex: number, field: keyof AvailabilityRule, value: any) => {
    const newRules = [...rules];
    const ruleIndex = newRules.findIndex(r => r.day_of_week === dayIndex);
    if (ruleIndex !== -1) {
      newRules[ruleIndex] = { ...newRules[ruleIndex], [field]: value };
      setRules(newRules);
    }
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

  return (
    <Card>
      <CardContent className="p-6">
        <div className="space-y-4">
          {DAYS.map((day, dayIndex) => {
            const rule = rules.find(r => r.day_of_week === dayIndex);
            if (!rule) return null;

            const startMinutes = timeToMinutes(rule.start_time);
            const endMinutes = timeToMinutes(rule.end_time);

            return (
              <div key={dayIndex} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium w-12">{day}</Label>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={rule.is_available}
                      onCheckedChange={(checked) => updateDay(dayIndex, 'is_available', checked)}
                    />
                    <span className="text-xs text-muted-foreground w-20">
                      {rule.is_available ? 'Available' : 'Unavailable'}
                    </span>
                  </div>
                </div>
                
                {rule.is_available && (
                  <div className="space-y-2">
                    <div className="px-2">
                      <Slider
                        value={[startMinutes, endMinutes]}
                        min={0}
                        max={1439}
                        step={30}
                        onValueChange={(values) => {
                          updateDay(dayIndex, 'start_time', minutesToTime(values[0]));
                          updateDay(dayIndex, 'end_time', minutesToTime(values[1]));
                        }}
                        className="w-full"
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground px-2">
                      <span>{formatTime(rule.start_time)}</span>
                      <span>{formatTime(rule.end_time)}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
