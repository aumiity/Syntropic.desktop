import * as React from "react"
import { cn } from "@/lib/utils"

export type TintIconTint =
  // status colors — paired: soft fill (default) + strong solid
  | "primary"
  | "primary-strong"
  | "success"
  | "success-strong"
  | "warning"
  | "warning-strong"
  | "destructive"
  | "destructive-strong"
  | "destructive2"
  // info (blue)
  | "info-soft"
  | "info"
  // decorative colors
  | "warm"
  | "violet"
  | "violet-strong"
  | "teal"
  | "teal-strong"
  | "accent"
  // neutral
  | "secondary"
  | "neutral"

export type TintIconSize = "sm" | "md" | "lg" | "xl"

interface TintIconProps {
  icon: React.ComponentType<{ className?: string }>
  tint?: TintIconTint
  size?: TintIconSize
  /** Show a tint-matched border around the box. `neutral` always renders with its own border + shadow regardless. */
  bordered?: boolean
  className?: string
  /** Override the inner icon's size class — for the rare case where a smaller icon is wanted inside a larger box. */
  iconClassName?: string
}

const BOX_BY_TINT: Record<TintIconTint, string> = {
  // Status — soft fill / strong solid pairs
  primary:               "bg-primary-soft text-primary",
  "primary-strong":      "bg-primary text-primary-foreground",
  success:               "bg-success-soft text-success",
  "success-strong":      "bg-success text-success-foreground",
  warning:               "bg-warm text-warm-foreground",
  "warning-strong":      "bg-warning text-warning-foreground",
  destructive:           "bg-destructive-soft text-destructive",
  "destructive-strong":  "bg-destructive text-destructive-foreground",
  destructive2:          "bg-destructive/15 text-destructive",
  // Info (blue)
  "info-soft":           "bg-info-soft text-info-soft-foreground",
  info:                  "bg-info text-info-foreground",
  // Decorative
  warm:                  "bg-warm text-warm-foreground",
  violet:                "bg-violet-soft text-violet-strong",
  "violet-strong":       "bg-violet text-violet-foreground",
  teal:                  "bg-teal-soft text-teal-strong",
  "teal-strong":         "bg-teal text-teal-foreground",
  accent:                "bg-accent text-accent-foreground",
  // Neutral
  secondary:             "bg-muted text-muted-foreground",
  neutral:               "bg-card text-foreground border border-border shadow-sm",
}

const BORDER_BY_TINT: Record<Exclude<TintIconTint, "neutral">, string> = {
  primary:               "border border-primary/40",
  "primary-strong":      "border border-primary/40",
  success:               "border border-success/40",
  "success-strong":      "border border-success/40",
  warning:               "border border-warning/40",
  "warning-strong":      "border border-warning/40",
  destructive:           "border border-destructive/40",
  "destructive-strong":  "border border-destructive/40",
  destructive2:          "border border-destructive/40",
  "info-soft":           "border border-info-soft-foreground/30",
  info:                  "border border-info/40",
  warm:                  "border border-warm-foreground/30",
  violet:                "border border-violet/40",
  "violet-strong":       "border border-violet/40",
  teal:                  "border border-teal/40",
  "teal-strong":         "border border-teal/40",
  accent:                "border border-accent-foreground/30",
  secondary:             "border border-border",
}

const SIZE_CLS: Record<TintIconSize, { box: string; icon: string }> = {
  sm: { box: "size-8 rounded-lg",   icon: "size-4" },
  md: { box: "size-9 rounded-lg",   icon: "size-5" },
  lg: { box: "size-11 rounded-xl",  icon: "size-7" },
  xl: { box: "size-16 rounded-2xl", icon: "size-10" },
}

export function TintIcon({
  icon: Icon,
  tint = "primary",
  size = "sm",
  bordered = false,
  className,
  iconClassName,
}: TintIconProps) {
  const { box, icon: iconCls } = SIZE_CLS[size]
  const borderCls = tint !== "neutral" && bordered ? BORDER_BY_TINT[tint] : ""
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
