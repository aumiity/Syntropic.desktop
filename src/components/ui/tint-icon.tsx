import * as React from "react"
import { cn } from "@/lib/utils"

export type TintIconTint =
  | "primary"
  | "primary-strong"
  | "success"
  | "warning"
  | "destructive"
  | "destructive-strong"
  | "destructive2"
  | "secondary"
  | "warm"
  | "info-soft"
  | "violet"
  | "tertiary"
  | "neutral"

export type TintIconSize = "sm" | "md" | "lg"

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
  primary:               "bg-primary-soft text-primary",
  "primary-strong":      "bg-primary text-primary-foreground",
  success:               "bg-success-soft text-success",
  warning:               "bg-warning-soft text-warning-strong",
  destructive:           "bg-destructive-soft text-destructive",
  "destructive-strong":  "bg-destructive text-destructive-foreground",
  destructive2:          "bg-destructive/15 text-destructive",
  secondary:             "bg-muted text-muted-foreground",
  warm:                  "bg-warm text-warm-foreground",
  "info-soft":           "bg-info-soft text-info-soft-foreground",
  violet:                "bg-violet-soft text-violet-strong",
  tertiary:              "bg-tertiary text-tertiary-foreground",
  neutral:               "bg-card text-foreground border border-border shadow-sm",
}

const BORDER_BY_TINT: Record<Exclude<TintIconTint, "neutral">, string> = {
  primary:               "border border-primary/40",
  "primary-strong":      "border border-primary/40",
  success:               "border border-success/40",
  warning:               "border border-warning/40",
  destructive:           "border border-destructive/40",
  "destructive-strong":  "border border-destructive/40",
  destructive2:          "border border-destructive/40",
  secondary:             "border border-border",
  warm:                  "border border-warm-foreground/30",
  "info-soft":           "border border-info-soft-foreground/30",
  violet:                "border border-violet/40",
  tertiary:              "border border-tertiary-foreground/30",
}

const SIZE_CLS: Record<TintIconSize, { box: string; icon: string }> = {
  sm: { box: "size-8 rounded-lg",  icon: "size-4" },
  md: { box: "size-9 rounded-lg",  icon: "size-5" },
  lg: { box: "size-11 rounded-xl", icon: "size-7" },
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
