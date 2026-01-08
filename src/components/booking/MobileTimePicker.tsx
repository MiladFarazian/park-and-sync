import { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { X, AlertCircle } from 'lucide-react';
import { format, addDays, startOfDay, setHours, setMinutes, isBefore, isAfter, addMinutes, differenceInMinutes } from 'date-fns';

interface AvailabilityRule {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available?: boolean;
}

interface MobileTimePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (date: Date) => void;
  mode: 'start' | 'end';
  startTime?: Date;
  initialValue?: Date;
  availabilityRules?: AvailabilityRule[];
}

export const MobileTimePicker = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  mode,
  startTime,
  initialValue,
  availabilityRules = []
}: MobileTimePickerProps) => {
  const now = new Date();
  
  // Generate day options (next 7 days)
  const generateDays = () => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(startOfDay(now), i);
      const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : format(date, 'EEE MMM d');
      days.push({ date, label });
    }
    return days;
  };

  const days = generateDays();
  const hours = Array.from({ length: 12 }, (_, i) => i + 1);
  const minutes = [0, 15, 30, 45];
  const periods = ['AM', 'PM'];

  // Initialize with current time or passed initial value
  const getInitialValues = () => {
    let baseTime = initialValue || (mode === 'end' && startTime ? addMinutes(startTime, 15) : now);

    // For start mode: if the provided initialValue is in the past (e.g. it was rounded down
    // elsewhere), start from "now" instead so the default selection is actually selectable.
    if (mode === 'start' && isBefore(baseTime, now)) {
      baseTime = now;
    }

    // For start mode, round UP to the next 15-minute increment so we never default
    // to a time that has already passed.
    if (mode === 'start') {
      const minuteOfHour = baseTime.getMinutes();
      const remainder = minuteOfHour % 15;
      baseTime = remainder === 0 ? addMinutes(baseTime, 15) : addMinutes(baseTime, 15 - remainder);
    }

    const dayIndex = days.findIndex(d =>
      format(d.date, 'yyyy-MM-dd') === format(baseTime, 'yyyy-MM-dd')
    );

    let hour = baseTime.getHours();
    const period = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 || 12;

    const minute = baseTime.getMinutes();

    return {
      dayIndex: dayIndex >= 0 ? dayIndex : 0,
      hour,
      minute,
      period
    };
  };

  const initial = getInitialValues();
  const [selectedDay, setSelectedDay] = useState(initial.dayIndex);
  const [selectedHour, setSelectedHour] = useState(initial.hour);
  const [selectedMinute, setSelectedMinute] = useState(initial.minute);
  const [selectedPeriod, setSelectedPeriod] = useState(initial.period);
  const [error, setError] = useState('');

  const dayRef = useRef<HTMLDivElement>(null);
  const hourRef = useRef<HTMLDivElement>(null);
  const minuteRef = useRef<HTMLDivElement>(null);
  const periodRef = useRef<HTMLDivElement>(null);

  // Get available hours for the selected day
  const availableHoursInfo = useMemo(() => {
    if (availabilityRules.length === 0) {
      return { hasRules: false, availableWindows: [], displayText: '' };
    }
    
    const dayOfWeek = days[selectedDay]?.date.getDay() ?? 0;
    const dayRules = availabilityRules.filter(r => r.day_of_week === dayOfWeek && r.is_available !== false);
    
    if (dayRules.length === 0) {
      return { hasRules: true, availableWindows: [], displayText: 'Not available this day' };
    }
    
    const windows = dayRules.map(rule => {
      const formatTime = (timeStr: string) => {
        const [hours, mins] = timeStr.split(':').map(Number);
        const period = hours >= 12 ? 'PM' : 'AM';
        const displayHours = hours % 12 || 12;
        return `${displayHours}:${mins.toString().padStart(2, '0')} ${period}`;
      };
      return {
        start: rule.start_time,
        end: rule.end_time,
        display: `${formatTime(rule.start_time)} - ${formatTime(rule.end_time)}`
      };
    });
    
    return { 
      hasRules: true, 
      availableWindows: windows,
      displayText: windows.map(w => w.display).join(', ')
    };
  }, [availabilityRules, selectedDay, days]);

  // Check if a specific time is within availability
  const isTimeWithinAvailability = (hour24: number, minute: number): boolean => {
    if (availabilityRules.length === 0) return true;
    
    const dayOfWeek = days[selectedDay]?.date.getDay() ?? 0;
    const dayRules = availabilityRules.filter(r => r.day_of_week === dayOfWeek && r.is_available !== false);
    
    if (dayRules.length === 0) return false;
    
    const timeStr = `${hour24.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    
    return dayRules.some(rule => {
      const startTime = rule.start_time.slice(0, 5);
      const endTime = rule.end_time.slice(0, 5);
      return timeStr >= startTime && timeStr <= endTime;
    });
  };

  // Scroll to selected items on mount
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        scrollToIndex(dayRef, selectedDay);
        scrollToIndex(hourRef, hours.indexOf(selectedHour));
        scrollToIndex(minuteRef, minutes.indexOf(selectedMinute));
        scrollToIndex(periodRef, periods.indexOf(selectedPeriod));
      }, 100);
    }
  }, [isOpen]);

  const scrollToIndex = (ref: React.RefObject<HTMLDivElement>, index: number) => {
    if (ref.current) {
      const itemHeight = 56;
      ref.current.scrollTop = index * itemHeight;
    }
  };

  const createScrollHandler = (
    ref: React.RefObject<HTMLDivElement>,
    items: any[],
    setter: (value: any) => void
  ) => {
    let scrollTimeout: NodeJS.Timeout;
    let lastIndex = -1;
    
    return () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        if (!ref.current) return;
        
        const itemHeight = 56;
        const scrollTop = ref.current.scrollTop;
        const index = Math.round(scrollTop / itemHeight);
        const clampedIndex = Math.max(0, Math.min(items.length - 1, index));
        
        // Trigger haptic feedback when selection changes
        if (clampedIndex !== lastIndex && 'vibrate' in navigator) {
          navigator.vibrate(10);
          lastIndex = clampedIndex;
        }
        
        // Smooth snap
        ref.current.scrollTo({
          top: clampedIndex * itemHeight,
          behavior: 'smooth'
        });
        
        setter(items[clampedIndex]);
      }, 150);
    };
  };

  const getSelectedDate = () => {
    const baseDate = days[selectedDay].date;
    let hour = selectedHour;
    if (selectedPeriod === 'PM' && hour !== 12) hour += 12;
    if (selectedPeriod === 'AM' && hour === 12) hour = 0;
    
    return setMinutes(setHours(baseDate, hour), selectedMinute);
  };

  // Get 24-hour format for current selection
  const getCurrentHour24 = () => {
    let hour = selectedHour;
    if (selectedPeriod === 'PM' && hour !== 12) hour += 12;
    if (selectedPeriod === 'AM' && hour === 12) hour = 0;
    return hour;
  };

  const validateSelection = () => {
    const selectedDate = getSelectedDate();
    
    // Check if date is in the past
    if (isBefore(selectedDate, now)) {
      setError('Please select a future time');
      return false;
    }
    
    // Check if end time is before start time
    if (mode === 'end' && startTime) {
      if (isBefore(selectedDate, startTime)) {
        setError('End time must be after start time');
        return false;
      }
      
      // For extensions, require at least 15 minutes
      const extensionMinutes = differenceInMinutes(selectedDate, startTime);
      if (extensionMinutes < 15) {
        setError('Duration must be at least 15 minutes');
        return false;
      }
      
      // Maximum 24 hours extension
      if (extensionMinutes > 1440) {
        setError('Duration cannot exceed 24 hours');
        return false;
      }
    }
    
    // Check availability rules
    if (availabilityRules.length > 0) {
      const hour24 = getCurrentHour24();
      if (!isTimeWithinAvailability(hour24, selectedMinute)) {
        setError(`This time is outside available hours: ${availableHoursInfo.displayText}`);
        return false;
      }
    }
    
    setError('');
    return true;
  };

  const handleConfirm = () => {
    if (validateSelection()) {
      onConfirm(getSelectedDate());
      onClose();
    }
  };

  // Check if current selection is valid for availability
  const isCurrentSelectionValid = useMemo(() => {
    if (availabilityRules.length === 0) return true;
    const hour24 = getCurrentHour24();
    return isTimeWithinAvailability(hour24, selectedMinute);
  }, [selectedDay, selectedHour, selectedMinute, selectedPeriod, availabilityRules]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 animate-fade-in">
      <div className="absolute inset-x-0 bottom-0 bg-background rounded-t-3xl animate-slide-in-bottom pb-20">
        {/* Header */}
        <div className="p-6 border-b">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h2 className="text-2xl font-bold">
                {mode === 'start' ? 'Select Start Time' : 'Select End Time'}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Cancel for free up to your start time
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>
          
          {/* Availability Info Banner */}
          {availableHoursInfo.hasRules && (
            <div className={`mt-3 p-3 rounded-lg flex items-start gap-2 ${
              availableHoursInfo.availableWindows.length === 0 
                ? 'bg-destructive/10 text-destructive' 
                : 'bg-muted'
            }`}>
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <span className="font-medium">Available hours: </span>
                <span className={availableHoursInfo.availableWindows.length === 0 ? '' : 'text-muted-foreground'}>
                  {availableHoursInfo.displayText || 'Not available this day'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Picker Container */}
        <div className="p-6">
          <div className="relative bg-muted/30 rounded-2xl p-4 shadow-inner">
            {/* Selection highlight */}
            <div className={`absolute inset-x-4 top-1/2 -translate-y-1/2 h-14 rounded-xl pointer-events-none border-2 transition-colors ${
              isCurrentSelectionValid 
                ? 'bg-background/80 border-primary/20' 
                : 'bg-destructive/10 border-destructive/30'
            }`} />
            
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 relative">
              {/* Day Column */}
              <div className="overflow-hidden">
                <div 
                  ref={dayRef}
                  className="overflow-y-scroll scrollbar-hide h-[168px] snap-y snap-mandatory scroll-smooth"
                  onScroll={createScrollHandler(dayRef, days.map((_, i) => i), setSelectedDay)}
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                  <div className="h-14" />
                  {days.map((day, index) => {
                    // Check if this day has any availability
                    const dayOfWeek = day.date.getDay();
                    const dayHasRules = availabilityRules.length === 0 || 
                      availabilityRules.some(r => r.day_of_week === dayOfWeek && r.is_available !== false);
                    
                    return (
                      <div
                        key={index}
                        className={`h-14 flex items-center justify-center snap-center cursor-pointer transition-all px-2 ${
                          !dayHasRules ? 'opacity-30' : ''
                        }`}
                        style={{
                          opacity: selectedDay === index ? 1 : (dayHasRules ? 0.3 : 0.15),
                          transform: selectedDay === index ? 'scale(1)' : 'scale(0.9)'
                        }}
                        onClick={() => {
                          setSelectedDay(index);
                          scrollToIndex(dayRef, index);
                        }}
                      >
                        <span className="text-base font-medium whitespace-nowrap">
                          {day.label}
                        </span>
                      </div>
                    );
                  })}
                  <div className="h-14" />
                </div>
              </div>

              {/* Hour Column */}
              <div className="overflow-hidden">
                <div 
                  ref={hourRef}
                  className="overflow-y-scroll scrollbar-hide h-[168px] snap-y snap-mandatory scroll-smooth"
                  onScroll={createScrollHandler(hourRef, hours, setSelectedHour)}
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                  <div className="h-14" />
                  {hours.map((hour) => (
                    <div
                      key={hour}
                      className="h-14 flex items-center justify-center snap-center cursor-pointer transition-all"
                      style={{
                        opacity: selectedHour === hour ? 1 : 0.3,
                        transform: selectedHour === hour ? 'scale(1)' : 'scale(0.9)'
                      }}
                      onClick={() => {
                        setSelectedHour(hour);
                        scrollToIndex(hourRef, hours.indexOf(hour));
                      }}
                    >
                      <span className="text-2xl font-bold">{hour}</span>
                    </div>
                  ))}
                  <div className="h-14" />
                </div>
              </div>

              {/* Minute Column */}
              <div className="overflow-hidden">
                <div 
                  ref={minuteRef}
                  className="overflow-y-scroll scrollbar-hide h-[168px] snap-y snap-mandatory scroll-smooth"
                  onScroll={createScrollHandler(minuteRef, minutes, setSelectedMinute)}
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                  <div className="h-14" />
                  {minutes.map((minute) => (
                    <div
                      key={minute}
                      className="h-14 flex items-center justify-center snap-center cursor-pointer transition-all"
                      style={{
                        opacity: selectedMinute === minute ? 1 : 0.3,
                        transform: selectedMinute === minute ? 'scale(1)' : 'scale(0.9)'
                      }}
                      onClick={() => {
                        setSelectedMinute(minute);
                        scrollToIndex(minuteRef, minutes.indexOf(minute));
                      }}
                    >
                      <span className="text-2xl font-bold">{minute.toString().padStart(2, '0')}</span>
                    </div>
                  ))}
                  <div className="h-14" />
                </div>
              </div>

              {/* Period Column */}
              <div className="overflow-hidden">
                <div 
                  ref={periodRef}
                  className="overflow-y-scroll scrollbar-hide h-[168px] snap-y snap-mandatory scroll-smooth"
                  onScroll={createScrollHandler(periodRef, periods, setSelectedPeriod)}
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                  <div className="h-14" />
                  {periods.map((period) => (
                    <div
                      key={period}
                      className="h-14 flex items-center justify-center snap-center cursor-pointer transition-all"
                      style={{
                        opacity: selectedPeriod === period ? 1 : 0.3,
                        transform: selectedPeriod === period ? 'scale(1)' : 'scale(0.9)'
                      }}
                      onClick={() => {
                        setSelectedPeriod(period);
                        scrollToIndex(periodRef, periods.indexOf(period));
                      }}
                    >
                      <span className="text-xl font-semibold">{period}</span>
                    </div>
                  ))}
                  <div className="h-14" />
                </div>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <p className="text-sm text-destructive mt-3 text-center animate-fade-in">
              {error}
            </p>
          )}
        </div>

        {/* Footer Button */}
        <div className="p-6 pt-0">
          <Button 
            size="lg" 
            className="w-full h-14 text-lg font-semibold rounded-full"
            onClick={handleConfirm}
          >
            {mode === 'start' ? 'Next' : 'Confirm'}
          </Button>
        </div>
      </div>
    </div>
  );
};
