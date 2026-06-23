import * as React from "react"

import { cn } from "@/lib/utils"

// See input.tsx — "default" is now ELEVATED; "filled" is the old flat look.
type TextareaVariant = "default" | "elevated" | "filled"

function Textarea({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"textarea"> & { variant?: TextareaVariant }) {
  return (
    <textarea
      data-slot="textarea"
      data-variant={variant}
      className={cn(
        "flex field-sizing-content min-h-16 w-full",
        "rounded-lg",
        "px-2.5 py-2",
        "text-base md:text-sm",
        "transition-colors outline-none",
        "placeholder:text-foreground-subtle/50",
        "focus-visible:border-ring focus-visible:ring-[1px] focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 dark:disabled:bg-input/80",
        "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        variant === "filled"
          ? "bg-input dark:bg-input/30"
          : "bg-card border border-border shadow-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
export type { TextareaVariant }
