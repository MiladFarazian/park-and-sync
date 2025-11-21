import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { format, addDays, startOfDay, setHours, setMinutes, isBefore, isAfter, addMinutes } from 'date-fns';

interface MobileTimePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (date: Date) => void;
  mode: 'start' | 'end';
  startTime?: Date;
  initialValue?: Date;
}

export const MobileTimePicker = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  mode,
  startTime,
  initialValue 
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
    const baseTime = initialValue || (mode === 'end' && startTime ? addMinutes(startTime, 15) : now);
    
    const dayIndex = days.findIndex(d => 
      format(d.date, 'yyyy-MM-dd') === format(baseTime, 'yyyy-MM-dd')
    );
    
    let hour = baseTime.getHours();
    const period = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 || 12;
    
    const minute = Math.floor(baseTime.getMinutes() / 15) * 15;
    
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

  const handleScroll = (
    ref: React.RefObject<HTMLDivElement>,
    items: any[],
    setter: (value: any) => void
  ) => {
    if (!ref.current) return;
    
    const itemHeight = 56;
    const scrollTop = ref.current.scrollTop;
    const index = Math.round(scrollTop / itemHeight);
    const clampedIndex = Math.max(0, Math.min(items.length - 1, index));
    
    setter(items[clampedIndex]);
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
          navigator.vibrate(10); // Short 10ms vibration
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

  const validateSelection = () => {
    const selectedDate = getSelectedDate();
    
    // Check if date is in the past
    if (isBefore(selectedDate, now)) {
      setError('Please select a future time');
      return false;
    }
    
    // Check if end time is before start time
    if (mode === 'end' && startTime && isBefore(selectedDate, startTime)) {
      setError('End time must be after start time');
      return false;
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
        </div>

        {/* Picker Container */}
        <div className="p-6">
          <div className="relative bg-muted/30 rounded-2xl p-4 shadow-inner">
            {/* Selection highlight */}
            <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-14 bg-background/80 rounded-xl pointer-events-none border-2 border-primary/20" />
            
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
                  {days.map((day, index) => (
                    <div
                      key={index}
                      className="h-14 flex items-center justify-center snap-center cursor-pointer transition-all px-2"
                      style={{
                        opacity: selectedDay === index ? 1 : 0.3,
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
                  ))}
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
