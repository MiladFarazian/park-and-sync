import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

interface DateTimePickerProps {
  date: Date;
  setDate: (date: Date) => void;
  label?: string;
  placeholder?: string;
  minDate?: Date;
}

export function DateTimePicker({
  date,
  setDate,
  label,
  placeholder = "Pick a date and time",
  minDate = new Date(),
}: DateTimePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = [0, 15, 30, 45];

  const handleDateSelect = (selectedDate: Date | undefined) => {
    if (selectedDate) {
      const newDate = new Date(selectedDate);
      newDate.setHours(date.getHours());
      newDate.setMinutes(date.getMinutes());
      setDate(newDate);
    }
  };

  const handleTimeChange = (hour: number, minute: number) => {
    const newDate = new Date(date);
    newDate.setHours(hour);
    newDate.setMinutes(minute);
    setDate(newDate);
    setIsOpen(false);
  };

  return (
    <div className="space-y-2">
      {label && <label className="text-sm font-medium">{label}</label>}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal h-12",
              !date && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date ? (
              <span className="flex items-center gap-2">
                {format(date, "PPP")}
                <span className="text-muted-foreground">·</span>
                <Clock className="h-3 w-3" />
                {format(date, "h:mm a")}
              </span>
            ) : (
              <span>{placeholder}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="flex">
            <Calendar
              mode="single"
              selected={date}
              onSelect={handleDateSelect}
              disabled={(date) => date < minDate}
              initialFocus
              className="pointer-events-auto"
            />
            <div className="border-l">
              <div className="p-3 border-b">
                <p className="text-sm font-medium text-center">Time</p>
              </div>
              <div className="flex">
                <ScrollArea className="h-[280px]">
                  <div className="p-2 space-y-1">
                    {hours.map((hour) => (
                      <Button
                        key={`hour-${hour}`}
                        variant={date.getHours() === hour ? "default" : "ghost"}
                        className="w-full justify-center text-sm h-8"
                        onClick={() => handleTimeChange(hour, date.getMinutes())}
                      >
                        {hour.toString().padStart(2, "0")}
                      </Button>
                    ))}
                  </div>
                </ScrollArea>
                <div className="border-l">
                  <ScrollArea className="h-[280px]">
                    <div className="p-2 space-y-1">
                      {minutes.map((minute) => (
                        <Button
                          key={`minute-${minute}`}
                          variant={date.getMinutes() === minute ? "default" : "ghost"}
                          className="w-full justify-center text-sm h-8"
                          onClick={() => handleTimeChange(date.getHours(), minute)}
                        >
                          {minute.toString().padStart(2, "0")}
                        </Button>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
