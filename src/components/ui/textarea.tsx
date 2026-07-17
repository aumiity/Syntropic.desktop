import * as React from "react"

import { cn } from "@/lib/utils"
import { fieldVariant, type FieldVariant } from "./field-variants"
import { type Radius } from "./radius"

// See field-variants.ts — shape x shadow on the house ELEVATED surface.
type TextareaVariant = FieldVariant

function Textarea({
  className,
  variant = "default",
  radius = "md",
  ...props
}: React.ComponentProps<"textarea"> & { variant?: TextareaVariant; radius?: Radius }) {
  return (
    <textarea
      data-slot="textarea"
      data-variant={variant}
      className={cn(
        "flex field-sizing-content min-h-16 w-full",
        "px-2.5 py-2",
        "text-base md:text-sm",
        "transition-colors outline-none",
        "placeholder:text-foreground-subtle/50",
        "focus-visible:border-ring focus-visible:ring-[1px] focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 dark:disabled:bg-input/80",
        "aria-invalid:border-destructive aria-invalid:ring-[1px] aria-invalid:ring-destructive dark:aria-invalid:border-destructive dark:aria-invalid:ring-destructive",
        fieldVariant(variant, radius),
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
export type { TextareaVariant }
