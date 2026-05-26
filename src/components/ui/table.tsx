import * as React from "react"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "./button"

function Table({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<"table"> & { containerClassName?: string }) {
  return (
    <div
      data-slot="table-container"
      className={cn("relative w-full overflow-auto", containerClassName)}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-0", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0 [&_tr]:border-border", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "bg-input font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors",
        "hover:bg-muted has-aria-expanded:bg-muted",
        "data-[state=selected]:bg-primary-soft",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "sticky top-0 z-10",
        "h-10 px-2 text-left align-middle",
        "bg-muted text-foreground",
        "font-medium whitespace-nowrap",
        "border-b border-border",
        "[&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "py-1 px-2 align-middle whitespace-nowrap",
        "[&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

type SortDir = "asc" | "desc"

function SortableTableHead<F extends string>({
  field,
  align = "left",
  sort,
  onToggle,
  children,
  className,
  ...props
}: Omit<React.ComponentProps<"th">, "children" | "onClick"> & {
  field: F
  align?: "left" | "center" | "right"
  sort: { by: F; dir: SortDir }
  onToggle: (field: F) => void
  children: React.ReactNode
}) {
  const isActive = sort.by === field
  // Single ChevronDown; rotates 180° when sorting asc so the transition animates.
  const rotated = isActive && sort.dir === "asc"
  const justify =
    align === "right" ? "justify-end"
    : align === "center" ? "justify-center"
    : "justify-start"
  return (
    <TableHead className={className} {...props}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onToggle(field)}
        className={cn(
          "h-auto w-full px-0 py-0 text-sm font-medium",
          "hover:bg-transparent",
          justify,
          "text-foreground",
          isActive ? "" : "opacity-80",
        )}
      >
        <span>{children}</span>
        <ChevronDown
          className={cn(
            "size-3 transition-transform duration-200",
            rotated && "rotate-180",
            isActive ? "opacity-100" : "opacity-40",
          )}
        />
      </Button>
    </TableHead>
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
  SortableTableHead,
}
