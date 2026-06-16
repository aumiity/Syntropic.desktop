// SettingRow = canonical 2-line (title + description) setting row for forms/
// dialogs that commit on an explicit Save. One component, one source of truth
// for height/border/tint so the whole app adjusts in a single place.
//
// - control: 'checkbox' (left, deferred — tick-then-save) or 'switch' (right,
//   instant on/off). Ordering follows the app convention automatically.
// - title + description -> always 2 lines -> height locked to h-14 (56px). A
//   single-line variant (no description) falls back to h-12; the 1-line +
//   icon/badge cases still live in CheckRow/Toggle for now.
// - variant: destructive/warning tints the row bg (and border when framed)
//   ONCE checked — signalling the active negative/attention state.
// - framed (default): draws its own `border` + rounded pill. Pass framed={false}
//   for rows inside a shared `rounded-lg border divide-y` group (the group owns
//   the border; each row is borderless and measures exactly h-14). Per the
//   border-over-ring rule: h-N on a bordered row = outer height incl border.
// - readOnly: control shown disabled but the row keeps a normal (non-dimmed)
//   look — for values mirrored/locked from elsewhere (e.g. ข.ย.9 ← is_drug).
import * as React from "react"
import { cn } from "@/lib/utils"
import { Checkbox } from "./checkbox"
import { Switch } from "./switch"

export interface SettingRowProps {
  control?: "checkbox" | "switch"
  checked: boolean
  onChange?: (v: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  variant?: "default" | "destructive" | "warning"
  framed?: boolean
  disabled?: boolean
  readOnly?: boolean
  className?: string
}

export function SettingRow({
  control = "checkbox",
  checked,
  onChange,
  title,
  description,
  variant = "default",
  framed = true,
  disabled,
  readOnly,
  className,
}: SettingRowProps) {
  const isCheckbox = control === "checkbox"
  const tinted = checked && variant !== "default"
  const interactive = !disabled && !readOnly

  const controlNode = isCheckbox ? (
    <Checkbox
      checked={checked}
      onCheckedChange={v => onChange?.(v === true)}
      disabled={disabled || readOnly}
      variant={variant === "destructive" ? "destructive" : "default"}
    />
  ) : (
    <Switch
      checked={checked}
      onCheckedChange={v => onChange?.(v)}
      size="lg"
      variant={variant}
      disabled={disabled}
    />
  )

  const content = (
    <div className="min-w-0">
      <div className="text-sm font-semibold text-foreground">{title}</div>
      {description ? <div className="text-xs text-muted-foreground">{description}</div> : null}
    </div>
  )

  return (
    <label
      className={cn(
        "flex items-center gap-3 px-3 select-none",
        description ? "h-14" : "h-12",
        !isCheckbox && "justify-between",
        interactive ? "cursor-pointer" : "cursor-default",
        disabled && "opacity-50 cursor-not-allowed",
        framed && "rounded-lg border transition-colors",
        framed && !tinted && "border-border",
        tinted && variant === "destructive" && "bg-destructive-soft/40",
        tinted && variant === "destructive" && framed && "border-destructive/40",
        tinted && variant === "warning" && "bg-amber-soft/50",
        tinted && variant === "warning" && framed && "border-warning/40",
        className,
      )}
    >
      {isCheckbox ? (
        <>
          {controlNode}
          {content}
        </>
      ) : (
        <>
          {content}
          {controlNode}
        </>
      )}
    </label>
  )
}
