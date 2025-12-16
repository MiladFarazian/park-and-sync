import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Clock, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AvailabilityTimePickerProps {
  value: string; // HH:mm format
  onChange: (value: string) => void;
  label?: string;
}

export const AvailabilityTimePicker = ({ value, onChange, label }: AvailabilityTimePickerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  
  // Parse current value
  const [hours24, mins] = value.split(':').map(Number);
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 === 0 ? 12 : hours24 > 12 ? hours24 - 12 : hours24;
  
  const [selectedHour, setSelectedHour] = useState(hours12);
  const [selectedMinute, setSelectedMinute] = useState(mins);
  const [selectedPeriod, setSelectedPeriod] = useState(period);

  const hourRef = useRef<HTMLDivElement>(null);
  const minuteRef = useRef<HTMLDivElement>(null);
  const periodRef = useRef<HTMLDivElement>(null);

  const hours = Array.from({ length: 12 }, (_, i) => i + 1);
  const minutes = [0, 15, 30, 45];
  const periods = ['AM', 'PM'];

  useEffect(() => {
    if (isOpen) {
      // Reset to current value when opening
      const [h24, m] = value.split(':').map(Number);
      const p = h24 >= 12 ? 'PM' : 'AM';
      const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
      setSelectedHour(h12);
      setSelectedMinute(m);
      setSelectedPeriod(p);
      
      setTimeout(() => {
        scrollToIndex(hourRef, hours.indexOf(h12));
        scrollToIndex(minuteRef, minutes.indexOf(m));
        scrollToIndex(periodRef, periods.indexOf(p));
      }, 50);
    }
  }, [isOpen, value]);

  const scrollToIndex = (ref: React.RefObject<HTMLDivElement>, index: number) => {
    if (ref.current) {
      const itemHeight = 44;
      ref.current.scrollTop = index * itemHeight;
    }
  };

  const createScrollHandler = (
    ref: React.RefObject<HTMLDivElement>,
    items: any[],
    setter: (value: any) => void,
    currentValue: any
  ) => {
    let scrollTimeout: NodeJS.Timeout;
    let lastIndex = items.indexOf(currentValue);
    
    return () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        if (!ref.current) return;
        
        const itemHeight = 44;
        const scrollTop = ref.current.scrollTop;
        const index = Math.round(scrollTop / itemHeight);
        const clampedIndex = Math.max(0, Math.min(items.length - 1, index));
        
        // Haptic feedback when selection changes
        if (clampedIndex !== lastIndex && 'vibrate' in navigator) {
          navigator.vibrate(10);
          lastIndex = clampedIndex;
        }
        
        ref.current.scrollTo({
          top: clampedIndex * itemHeight,
          behavior: 'smooth'
        });
        
        setter(items[clampedIndex]);
      }, 100);
    };
  };

  const formatDisplay = (timeStr: string): string => {
    const [h, m] = timeStr.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
  };

  const handleConfirm = () => {
    let hour24 = selectedHour;
    if (selectedPeriod === 'PM' && selectedHour !== 12) hour24 += 12;
    if (selectedPeriod === 'AM' && selectedHour === 12) hour24 = 0;
    
    const newValue = `${hour24.toString().padStart(2, '0')}:${selectedMinute.toString().padStart(2, '0')}`;
    onChange(newValue);
    setIsOpen(false);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="flex-1 min-w-0 justify-center text-xs sm:text-sm h-10 px-2"
        onClick={() => setIsOpen(true)}
      >
        <span className="truncate">{formatDisplay(value)}</span>
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 animate-fade-in" onClick={() => setIsOpen(false)}>
          <div 
            className="absolute inset-x-0 bottom-0 bg-background rounded-t-2xl animate-slide-in-bottom"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 100px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold">{label || 'Select Time'}</h3>
              <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Picker */}
            <div className="p-4">
              <div className="relative bg-muted/30 rounded-xl p-3">
                {/* Selection highlight */}
                <div className="absolute inset-x-3 top-1/2 -translate-y-1/2 h-11 bg-background rounded-lg pointer-events-none border border-primary/20" />
                
                <div className="grid grid-cols-3 gap-2 relative">
                  {/* Hour */}
                  <div className="overflow-hidden">
                    <div 
                      ref={hourRef}
                      className="overflow-y-scroll scrollbar-hide h-[132px] snap-y snap-mandatory"
                      onScroll={createScrollHandler(hourRef, hours, setSelectedHour, selectedHour)}
                      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                    >
                      <div className="h-11" />
                      {hours.map((hour) => (
                        <div
                          key={hour}
                          className={cn(
                            "h-11 flex items-center justify-center snap-center cursor-pointer transition-all",
                            selectedHour === hour ? "opacity-100" : "opacity-30"
                          )}
                          onClick={() => {
                            setSelectedHour(hour);
                            scrollToIndex(hourRef, hours.indexOf(hour));
                          }}
                        >
                          <span className="text-xl font-semibold">{hour}</span>
                        </div>
                      ))}
                      <div className="h-11" />
                    </div>
                  </div>

                  {/* Minute */}
                  <div className="overflow-hidden">
                    <div 
                      ref={minuteRef}
                      className="overflow-y-scroll scrollbar-hide h-[132px] snap-y snap-mandatory"
                      onScroll={createScrollHandler(minuteRef, minutes, setSelectedMinute, selectedMinute)}
                      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                    >
                      <div className="h-11" />
                      {minutes.map((minute) => (
                        <div
                          key={minute}
                          className={cn(
                            "h-11 flex items-center justify-center snap-center cursor-pointer transition-all",
                            selectedMinute === minute ? "opacity-100" : "opacity-30"
                          )}
                          onClick={() => {
                            setSelectedMinute(minute);
                            scrollToIndex(minuteRef, minutes.indexOf(minute));
                          }}
                        >
                          <span className="text-xl font-semibold">{minute.toString().padStart(2, '0')}</span>
                        </div>
                      ))}
                      <div className="h-11" />
                    </div>
                  </div>

                  {/* Period */}
                  <div className="overflow-hidden">
                    <div 
                      ref={periodRef}
                      className="overflow-y-scroll scrollbar-hide h-[132px] snap-y snap-mandatory"
                      onScroll={createScrollHandler(periodRef, periods, setSelectedPeriod, selectedPeriod)}
                      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                    >
                      <div className="h-11" />
                      {periods.map((p) => (
                        <div
                          key={p}
                          className={cn(
                            "h-11 flex items-center justify-center snap-center cursor-pointer transition-all",
                            selectedPeriod === p ? "opacity-100" : "opacity-30"
                          )}
                          onClick={() => {
                            setSelectedPeriod(p);
                            scrollToIndex(periodRef, periods.indexOf(p));
                          }}
                        >
                          <span className="text-lg font-semibold">{p}</span>
                        </div>
                      ))}
                      <div className="h-11" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Confirm Button */}
            <div className="p-4 pt-0">
              <Button 
                className="w-full h-12 text-base font-medium rounded-xl"
                onClick={handleConfirm}
              >
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
