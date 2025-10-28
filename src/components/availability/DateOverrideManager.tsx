import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Calendar as CalendarIcon, Plus, Trash2, Clock } from 'lucide-react';
import { TimePicker } from '@/components/ui/time-picker';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export interface DateOverride {
  id?: string;
  override_date: string; // YYYY-MM-DD format
  start_time?: string; // HH:MM format (optional - null means all day)
  end_time?: string; // HH:MM format (optional)
  is_available: boolean;
  reason?: string;
}

interface DateOverrideManagerProps {
  initialOverrides?: DateOverride[];
  onChange?: (overrides: DateOverride[]) => void;
}

export const DateOverrideManager: React.FC<DateOverrideManagerProps> = ({ 
  initialOverrides = [], 
  onChange 
}) => {
  const [overrides, setOverrides] = useState<DateOverride[]>(initialOverrides);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();

  useEffect(() => {
    onChange?.(overrides);
  }, [overrides, onChange]);

  const addOverride = () => {
    if (!selectedDate) {
      toast.error('Please select a date');
      return;
    }

    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    
    // Check if override already exists for this date
    if (overrides.some(o => o.override_date === dateStr)) {
      toast.error('Override already exists for this date');
      return;
    }

    const newOverride: DateOverride = {
      override_date: dateStr,
      is_available: false,
      start_time: '09:00',
      end_time: '17:00',
      reason: '',
    };
    
    setOverrides([...overrides, newOverride].sort((a, b) => 
      a.override_date.localeCompare(b.override_date)
    ));
    setSelectedDate(undefined);
    toast.success('Date override added');
  };

  const removeOverride = (index: number) => {
    setOverrides(overrides.filter((_, i) => i !== index));
    toast.success('Date override removed');
  };

  const updateOverride = (index: number, field: keyof DateOverride, value: any) => {
    const newOverrides = [...overrides];
    newOverrides[index] = { ...newOverrides[index], [field]: value };
    setOverrides(newOverrides);
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
      {/* Date Picker */}
      <Card className="border-dashed">
        <CardContent className="p-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
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
            <Button onClick={addOverride} disabled={!selectedDate}>
              <Plus className="h-4 w-4 mr-2" />
              Add Override
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* List of Overrides */}
      {overrides.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-6 text-center">
            <CalendarIcon className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              No date overrides set. Add specific dates to block or modify availability.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {overrides.map((override, index) => (
            <Card key={index}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-semibold">
                      {format(new Date(override.override_date + 'T00:00:00'), 'EEEE, MMMM d, yyyy')}
                    </Label>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeOverride(index)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    checked={override.is_available}
                    onCheckedChange={(checked) => 
                      updateOverride(index, 'is_available', checked)
                    }
                  />
                  <Label className="text-sm">
                    {override.is_available ? 'Available' : 'Blocked'}
                  </Label>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    {override.is_available ? 'Custom Hours' : 'Blocked Hours'}
                  </Label>
                  <div className="flex items-center gap-2">
                    <TimePicker
                      date={override.start_time ? parseTimeString(override.start_time) : new Date(new Date().setHours(9, 0, 0, 0))}
                      setDate={(date) => {
                        updateOverride(index, 'start_time', formatTimeString(date));
                      }}
                    >
                      <Button variant="outline" size="sm" className="text-xs">
                        <Clock className="h-3 w-3 mr-1" />
                        {override.start_time || '09:00'}
                      </Button>
                    </TimePicker>
                    
                    <span className="text-sm text-muted-foreground">to</span>
                    
                    <TimePicker
                      date={override.end_time ? parseTimeString(override.end_time) : new Date(new Date().setHours(17, 0, 0, 0))}
                      setDate={(date) => {
                        updateOverride(index, 'end_time', formatTimeString(date));
                      }}
                    >
                      <Button variant="outline" size="sm" className="text-xs">
                        <Clock className="h-3 w-3 mr-1" />
                        {override.end_time || '17:00'}
                      </Button>
                    </TimePicker>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
