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

// Checked-fill color by role. `default` = primary teal (the standard tick).
// `destructive` = red fill, for rows whose meaning is negative (e.g. ปิดใช้งาน/
// ซ่อน) so the tick matches the red row tint instead of clashing teal-on-red.
const checkboxVariants = {
  default: {
    root: "data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground dark:data-checked:bg-primary",
    indicator: "bg-primary",
  },
  destructive: {
    root: "data-checked:border-destructive data-checked:bg-destructive data-checked:text-white dark:data-checked:bg-destructive",
    indicator: "bg-destructive",
  },
} as const

function Checkbox({
  className,
  size = "default",
  variant = "default",
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root> & {
  size?: keyof typeof checkboxSizes
  variant?: keyof typeof checkboxVariants
}) {
  const sz = checkboxSizes[size]
  const v = checkboxVariants[variant]
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
        v.root,
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className={cn(
          "grid place-content-center shrink-0 rounded-[4px] text-white transition-none",
          v.indicator,
          sz.box,
          sz.check,
        )}
      >
        <Check strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

// CheckRow = Checkbox + label, checkbox on the LEFT, label on the RIGHT.
// Sibling of Toggle (switch.tsx) for "deferred" settings that commit only on an
// explicit Save: a checkbox reads as "tick to select, then save", whereas a
// switch implies an instant on/off. `framed` wraps it in an h-12 pill (mirrors
// Toggle framed) so it reads as a control inside dialogs and on tinted pages;
// variant=destructive/warning tints the pill once checked, exactly like Toggle.
function CheckRow({ checked, onChange, label, variant = "default", framed, disabled, className }: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: React.ReactNode
  variant?: "default" | "destructive" | "warning"
  framed?: boolean
  disabled?: boolean
  className?: string
}) {
  return (
    <label className={cn(
      "flex items-center gap-2 cursor-pointer select-none",
      disabled && "cursor-not-allowed opacity-50",
      framed && "h-12 px-3 rounded-lg border transition-colors",
      framed && (variant === "default" || !checked) && "bg-card border-border",
      framed && variant === "destructive" && checked && "bg-destructive-soft border-destructive/30 text-destructive",
      framed && variant === "warning" && checked && "bg-amber-soft border-warning/40 text-amber-strong",
      className,
    )}>
      <Checkbox checked={checked} onCheckedChange={v => onChange(v === true)} disabled={disabled} variant={variant === "destructive" ? "destructive" : "default"} />
      {label ? <span className="text-sm">{label}</span> : null}
    </label>
  )
}

export { Checkbox, CheckRow }
