import * as React from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { cn } from "@/lib/utils";

interface HybridTooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}

export function HybridTooltip({ 
  content, 
  children, 
  side = "top", 
  className 
}: HybridTooltipProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    // On mobile: use Popover (tap-based)
    return (
      <Popover>
        <PopoverTrigger asChild>{children}</PopoverTrigger>
        <PopoverContent 
          side={side} 
          className={cn(
            "w-auto max-w-[220px] p-2 text-xs",
            className
          )}
        >
          {content}
        </PopoverContent>
      </Popover>
    );
  }

  // On desktop: use Tooltip (hover-based)
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side} className={className}>
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
