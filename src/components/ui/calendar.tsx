import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"
import { buttonVariants } from "./button"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-4",
        month: "flex flex-col gap-3",
        caption: "flex justify-center pt-1 pb-1 relative items-center w-full",
        caption_label: "text-sm font-semibold text-foreground tracking-tight",
        nav: "flex items-center gap-1",
        nav_button: cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "absolute opacity-60 hover:opacity-100 hover:bg-primary-soft hover:text-primary"
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse",
        head_row: "flex",
        head_cell:
          "text-foreground-subtle w-9 font-semibold text-[0.7rem] uppercase tracking-wider",
        row: "flex w-full mt-1.5",
        cell: cn(
          "relative p-0 text-center text-sm focus-within:relative focus-within:z-20",
          // Range bar — only when in range mode (.day-range-* classes exist)
          "[&:has(.day-range-middle)]:bg-primary-soft",
          "[&:has(.day-range-start)]:bg-primary-soft [&:has(.day-range-start)]:rounded-l-full",
          "[&:has(.day-range-end)]:bg-primary-soft [&:has(.day-range-end)]:rounded-r-full",
          // Wrap pill at week edges so the bar looks continuous-but-bounded
          "first:[&:has(.day-range-middle)]:rounded-l-full",
          "last:[&:has(.day-range-middle)]:rounded-r-full"
        ),
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "size-9 p-0 font-normal aria-selected:opacity-100 rounded-full tabular-nums",
          "hover:bg-primary-soft hover:text-primary"
        ),
        day_range_start:
          "day-range-start !bg-primary !text-primary-foreground hover:!bg-primary-hover focus:!bg-primary",
        day_range_end:
          "day-range-end !bg-primary !text-primary-foreground hover:!bg-primary-hover focus:!bg-primary",
        day_selected:
          "!bg-primary !text-primary-foreground hover:!bg-primary-hover hover:!text-primary-foreground focus:!bg-primary focus:!text-primary-foreground",
        day_today:
          "font-bold ring-2 ring-primary/40 ring-inset text-primary",
        day_outside:
          "day-outside text-foreground-subtle aria-selected:text-foreground-subtle",
        day_disabled: "text-foreground-subtle opacity-40",
        day_range_middle:
          "day-range-middle !bg-transparent !text-foreground hover:!bg-primary-soft-hover",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: () => <ChevronLeft className="size-4" />,
        IconRight: () => <ChevronRight className="size-4" />,
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
