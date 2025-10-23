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

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = [0, 15, 30, 45];

  const handleTimeChange = (hour: number, minute: number) => {
    const newDate = new Date(date);
    newDate.setHours(hour);
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
            <ScrollArea className="h-[240px] w-20">
              <div className="space-y-1">
                {hours.map((hour) => (
                  <Button
                    key={`hour-${hour}`}
                    variant={date.getHours() === hour ? "default" : "ghost"}
                    className="w-full justify-center text-sm h-10"
                    onClick={() => handleTimeChange(hour, date.getMinutes())}
                  >
                    {hour.toString().padStart(2, "0")}
                  </Button>
                ))}
              </div>
            </ScrollArea>
            <div className="flex items-center">
              <span className="text-2xl font-bold">:</span>
            </div>
            <ScrollArea className="h-[240px] w-20">
              <div className="space-y-1">
                {minutes.map((minute) => (
                  <Button
                    key={`minute-${minute}`}
                    variant={date.getMinutes() === minute ? "default" : "ghost"}
                    className="w-full justify-center text-sm h-10"
                    onClick={() => handleTimeChange(date.getHours(), minute)}
                  >
                    {minute.toString().padStart(2, "0")}
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
