import * as React from "react"
import { cn } from "@/lib/utils"

// Naming mirrors Button/Badge: bare `<role>` = SOLID (filled), `<role>-soft` =
// SOFT (pale tinted surface). Neutrals: `neutral` = flat gray, `elevated` =
// raised white (border + shadow). Grouped by surface below.
export type TintIconTint =
  // SOLID — filled role color
  | "primary"
  | "success"
  | "warning"
  | "destructive"
  | "info"
  | "accent"
  | "violet"
  | "teal"
  | "amber"
  // SOFT — pale tinted surface + role text
  | "primary-soft"
  | "success-soft"
  | "warning-soft"
  | "destructive-soft"
  | "info-soft"
  | "accent-soft"
  | "violet-soft"
  | "teal-soft"
  | "amber-soft"
  // NEUTRAL
  | "neutral"
  | "elevated"

export type TintIconSize = "sm" | "md" | "lg" | "xl"

interface TintIconProps {
  icon: React.ComponentType<{ className?: string }>
  tint?: TintIconTint
  size?: TintIconSize
  /** Show a tint-matched border around the box. `elevated` always renders with its own border + shadow regardless. */
  bordered?: boolean
  className?: string
  /** Override the inner icon's size class — for the rare case where a smaller icon is wanted inside a larger box. */
  iconClassName?: string
}

const BOX_BY_TINT: Record<TintIconTint, string> = {
  // SOLID — filled
  primary:            "bg-primary text-primary-foreground",
  success:            "bg-success text-success-foreground",
  warning:            "bg-warning text-warning-foreground",
  destructive:        "bg-destructive text-destructive-foreground",
  info:               "bg-info text-info-foreground",
  accent:             "bg-accent text-accent-foreground",
  violet:             "bg-violet text-violet-foreground",
  teal:               "bg-teal text-teal-foreground",
  amber:              "bg-amber text-amber-foreground",
  // SOFT — pale surface + role text
  "primary-soft":     "bg-primary-soft text-primary",
  "success-soft":     "bg-success-soft text-success",
  "warning-soft":     "bg-warning-soft text-warning-soft-foreground",
  "destructive-soft": "bg-destructive-soft text-destructive",
  "info-soft":        "bg-info-soft text-info-soft-foreground",
  "accent-soft":      "bg-accent-soft text-accent-soft-foreground",
  "violet-soft":      "bg-violet-soft text-violet-strong",
  "teal-soft":        "bg-teal-soft text-teal-strong",
  "amber-soft":       "bg-amber-soft text-amber-strong",
  // NEUTRAL
  neutral:            "bg-muted text-muted-foreground",
  elevated:           "bg-card text-foreground border border-border shadow-sm",
}

const BORDER_BY_TINT: Record<Exclude<TintIconTint, "elevated">, string> = {
  // SOLID
  primary:            "border border-primary/40",
  success:            "border border-success/40",
  warning:            "border border-warning/40",
  destructive:        "border border-destructive/40",
  info:               "border border-info/40",
  accent:             "border border-accent-foreground/30",
  violet:             "border border-violet/40",
  teal:               "border border-teal/40",
  amber:              "border border-amber/40",
  // SOFT
  "primary-soft":     "border border-primary/40",
  "success-soft":     "border border-success/40",
  "warning-soft":     "border border-warning/40",
  "destructive-soft": "border border-destructive/40",
  "info-soft":        "border border-info-soft-foreground/30",
  "accent-soft":      "border border-accent-soft-foreground/30",
  "violet-soft":      "border border-violet/40",
  "teal-soft":        "border border-teal/40",
  "amber-soft":       "border border-amber/40",
  // NEUTRAL
  neutral:            "border border-border",
}

const SIZE_CLS: Record<TintIconSize, { box: string; icon: string }> = {
  sm: { box: "size-8 rounded-lg",   icon: "size-4" },
  md: { box: "size-9 rounded-lg",   icon: "size-5" },
  lg: { box: "size-11 rounded-xl",  icon: "size-7" },
  xl: { box: "size-16 rounded-2xl", icon: "size-10" },
}

export function TintIcon({
  icon: Icon,
  tint = "primary-soft",
  size = "sm",
  bordered = false,
  className,
  iconClassName,
}: TintIconProps) {
  const { box, icon: iconCls } = SIZE_CLS[size]
  const borderCls = tint !== "elevated" && bordered ? BORDER_BY_TINT[tint] : ""
  return (
    <span
      className={cn(
        "grid place-items-center shrink-0",
        box,
        BOX_BY_TINT[tint],
        borderCls,
        className,
      )}
    >
      <Icon className={iconClassName ?? iconCls} />
    </span>
  )
}
