import * as React from "react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { Check } from "lucide-react"

// Box + check-icon sizes per variant. `default` (size-4) is unchanged — all
// existing call sites omit `size`, so they keep the 16px box. `lg` (size-5) is
// for touch-friendly contexts (e.g. POS row selection). Both the Root box and
// the Indicator box use the SAME size so the checked fill matches the border.
const checkboxSizes = {
  default: { box: "size-4", check: "[&>svg]:size-4" },
  lg: { box: "size-5", check: "[&>svg]:size-[18px]" },
} as const

function Checkbox({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root> & {
  size?: keyof typeof checkboxSizes
}) {
  const sz = checkboxSizes[size]
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer relative flex shrink-0 items-center justify-center",
        sz.box,
        "rounded-[4px] border border-border",
        "transition-colors outline-none",
        "after:absolute after:-inset-x-3 after:-inset-y-2",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "group-has-disabled/field:opacity-50",
        "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
        "aria-invalid:aria-checked:border-primary",
        "dark:bg-input/30",
        "dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        "data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground dark:data-checked:bg-primary",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className={cn(
          "grid place-content-center shrink-0 rounded-[4px] bg-primary text-white transition-none",
          sz.box,
          sz.check,
        )}
      >
        <Check strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
