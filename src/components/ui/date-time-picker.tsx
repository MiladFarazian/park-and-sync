import * as React from "react";
import { format, isToday } from "date-fns";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
            <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
            {date ? (
              <span className="flex items-center gap-1 md:gap-2 text-sm md:text-base truncate">
                <span className="truncate">{isToday(date) ? "Today" : format(date, "MMM d, yyyy")}</span>
                <span className="text-muted-foreground flex-shrink-0">·</span>
                <Clock className="h-3 w-3 flex-shrink-0" />
                <span className="flex-shrink-0">{format(date, "h:mm a")}</span>
              </span>
            ) : (
              <span>{placeholder}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 max-w-[calc(100vw-2rem)]" align="start">
          {/* Desktop: side-by-side layout */}
          <div className="hidden md:flex">
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

          {/* Mobile: tabbed layout */}
          <Tabs defaultValue="date" className="md:hidden w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="date">Date</TabsTrigger>
              <TabsTrigger value="time">Time</TabsTrigger>
            </TabsList>
            <TabsContent value="date" className="m-0">
              <Calendar
                mode="single"
                selected={date}
                onSelect={handleDateSelect}
                disabled={(date) => date < minDate}
                initialFocus
                className="pointer-events-auto"
              />
            </TabsContent>
            <TabsContent value="time" className="m-0">
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
                <Button
                  onClick={() => setIsOpen(false)}
                  className="w-full mt-4"
                >
                  Done
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </PopoverContent>
      </Popover>
    </div>
  );
}
