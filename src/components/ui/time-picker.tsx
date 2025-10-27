import * as React from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

interface TimePickerProps {
  date: Date;
  setDate: (date: Date) => void;
  children?: React.ReactNode;
}

export function TimePicker({ date, setDate, children }: TimePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  const hours = Array.from({ length: 12 }, (_, i) => i + 1); // 1-12
  const minutes = [0, 15, 30, 45];

  // Get current 12-hour format values
  const currentHour24 = date.getHours();
  const currentHour12 = currentHour24 === 0 ? 12 : currentHour24 > 12 ? currentHour24 - 12 : currentHour24;
  const currentPeriod = currentHour24 >= 12 ? 'PM' : 'AM';

  const handleTimeChange = (hour12: number, minute: number, period: string) => {
    const newDate = new Date(date);
    let hour24 = hour12;
    
    // Convert 12-hour to 24-hour format
    if (period === 'AM') {
      hour24 = hour12 === 12 ? 0 : hour12;
    } else {
      hour24 = hour12 === 12 ? 12 : hour12 + 12;
    }
    
    newDate.setHours(hour24);
    newDate.setMinutes(minute);
    setDate(newDate);
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        {children || (
          <Button
            variant="outline"
            className={cn(
              "justify-start text-left font-normal",
              !date && "text-muted-foreground"
            )}
          >
            <Clock className="mr-2 h-4 w-4" />
            {date ? (
              <span>{date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
            ) : (
              <span>Pick a time</span>
            )}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="p-4">
          <p className="text-sm font-medium text-center mb-3">Select Time</p>
          <div className="flex gap-2 justify-center">
            <ScrollArea className="h-[240px] w-16">
              <div className="space-y-1 pr-2">
                {hours.map((hour) => (
                  <Button
                    key={`hour-${hour}`}
                    variant={currentHour12 === hour ? "default" : "ghost"}
                    className="w-full justify-center text-sm h-10"
                    onClick={() => handleTimeChange(hour, date.getMinutes(), currentPeriod)}
                  >
                    {hour}
                  </Button>
                ))}
              </div>
            </ScrollArea>
            <div className="flex items-center">
              <span className="text-2xl font-bold">:</span>
            </div>
            <ScrollArea className="h-[240px] w-16">
              <div className="space-y-1 pr-2">
                {minutes.map((minute) => (
                  <Button
                    key={`minute-${minute}`}
                    variant={date.getMinutes() === minute ? "default" : "ghost"}
                    className="w-full justify-center text-sm h-10"
                    onClick={() => handleTimeChange(currentHour12, minute, currentPeriod)}
                  >
                    {minute.toString().padStart(2, "0")}
                  </Button>
                ))}
              </div>
            </ScrollArea>
            <ScrollArea className="h-[240px] w-16">
              <div className="space-y-1 pr-2">
                {['AM', 'PM'].map((period) => (
                  <Button
                    key={period}
                    variant={currentPeriod === period ? "default" : "ghost"}
                    className="w-full justify-center text-sm h-10"
                    onClick={() => handleTimeChange(currentHour12, date.getMinutes(), period)}
                  >
                    {period}
                  </Button>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
