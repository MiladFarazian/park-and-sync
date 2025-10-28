import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Clock, Plus, Trash2, Copy } from 'lucide-react';
import { TimePicker } from '@/components/ui/time-picker';
import { toast } from 'sonner';

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

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const AvailabilityManager: React.FC<AvailabilityManagerProps> = ({ 
  initialRules = [], 
  onChange 
}) => {
  const [rules, setRules] = useState<AvailabilityRule[]>(initialRules);

  useEffect(() => {
    onChange?.(rules);
  }, [rules, onChange]);

  const addTimeSlot = (dayOfWeek: number) => {
    const newRule: AvailabilityRule = {
      day_of_week: dayOfWeek,
      start_time: '09:00',
      end_time: '17:00',
      is_available: true,
    };
    setRules([...rules, newRule]);
  };

  const removeTimeSlot = (index: number) => {
    setRules(rules.filter((_, i) => i !== index));
  };

  const updateTimeSlot = (index: number, field: keyof AvailabilityRule, value: any) => {
    const newRules = [...rules];
    newRules[index] = { ...newRules[index], [field]: value };
    setRules(newRules);
  };

  const copyToAllDays = (sourceRule: AvailabilityRule) => {
    const newRules = DAYS.map((_, dayIndex) => ({
      day_of_week: dayIndex,
      start_time: sourceRule.start_time,
      end_time: sourceRule.end_time,
      is_available: sourceRule.is_available,
    }));
    setRules(newRules);
    toast.success('Copied to all days');
  };

  const copyToWeekdays = (sourceRule: AvailabilityRule) => {
    // Remove existing weekday rules
    const nonWeekdayRules = rules.filter(r => r.day_of_week === 0 || r.day_of_week === 6);
    // Create weekday rules (Monday-Friday)
    const weekdayRules = [1, 2, 3, 4, 5].map(dayIndex => ({
      day_of_week: dayIndex,
      start_time: sourceRule.start_time,
      end_time: sourceRule.end_time,
      is_available: sourceRule.is_available,
    }));
    setRules([...nonWeekdayRules, ...weekdayRules]);
    toast.success('Copied to weekdays (Mon-Fri)');
  };

  const getRulesForDay = (dayOfWeek: number) => {
    return rules
      .map((rule, index) => ({ ...rule, originalIndex: index }))
      .filter(rule => rule.day_of_week === dayOfWeek);
  };

  const parseTimeString = (timeStr: string): Date => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date;
  };

  const formatTimeString = (date: Date): string => {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {DAYS.map((day, dayIndex) => {
          const dayRules = getRulesForDay(dayIndex);
          
          return (
            <Card key={dayIndex}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <Label className="font-semibold text-base">{day}</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addTimeSlot(dayIndex)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Time
                  </Button>
                </div>

                {dayRules.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No availability set</p>
                ) : (
                  <div className="space-y-3">
                    {dayRules.map((rule) => (
                      <div key={rule.originalIndex} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 flex items-center gap-2">
                            <TimePicker
                              date={parseTimeString(rule.start_time)}
                              setDate={(date) => {
                                updateTimeSlot(rule.originalIndex!, 'start_time', formatTimeString(date));
                              }}
                            >
                              <Button variant="outline" size="sm" className="text-xs">
                                <Clock className="h-3 w-3 mr-1" />
                                {rule.start_time}
                              </Button>
                            </TimePicker>
                            
                            <span className="text-sm text-muted-foreground">to</span>
                            
                            <TimePicker
                              date={parseTimeString(rule.end_time)}
                              setDate={(date) => {
                                updateTimeSlot(rule.originalIndex!, 'end_time', formatTimeString(date));
                              }}
                            >
                              <Button variant="outline" size="sm" className="text-xs">
                                <Clock className="h-3 w-3 mr-1" />
                                {rule.end_time}
                              </Button>
                            </TimePicker>
                          </div>

                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToWeekdays(rule)}
                              title="Copy to weekdays (Mon-Fri)"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToAllDays(rule)}
                              title="Copy to all days"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeTimeSlot(rule.originalIndex!)}
                            >
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-sm">
                          <Switch
                            checked={rule.is_available}
                            onCheckedChange={(checked) => 
                              updateTimeSlot(rule.originalIndex!, 'is_available', checked)
                            }
                          />
                          <Label className="text-xs">
                            {rule.is_available ? 'Available' : 'Unavailable'}
                          </Label>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {rules.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-6 text-center">
            <Clock className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              No availability set. Click "Add Time" to set your parking spot's availability.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
