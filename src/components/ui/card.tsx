import * as React from "react"

import { cn } from "@/lib/utils"
import { Sparkline } from "@/components/ui/charts/sparkline"
import { TintIcon, type TintIconTint } from "@/components/ui/tint-icon"

function Card({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card flex flex-col gap-4 overflow-hidden rounded-card",
        "bg-card py-4 text-sm text-card-foreground",
        "border border-border shadow-card",
        "has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0",
        "data-[size=sm]:gap-3 data-[size=sm]:py-3 data-[size=sm]:has-data-[slot=card-footer]:pb-0",
        "*:[img:first-child]:rounded-t-card *:[img:last-child]:rounded-b-card",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-card",
        "px-4 group-data-[size=sm]/card:px-3",
        "has-data-[slot=card-action]:grid-cols-[1fr_auto]",
        "has-data-[slot=card-description]:grid-rows-[auto_auto]",
        "[.border-b]:pb-4 group-data-[size=sm]/card:[.border-b]:pb-3",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-heading text-base leading-snug font-medium",
        "group-data-[size=sm]/card:text-sm",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-4 group-data-[size=sm]/card:px-3", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-card",
        "border-t bg-muted/50",
        "p-4 group-data-[size=sm]/card:p-3",
        className
      )}
      {...props}
    />
  )
}

type MetricTint = "primary" | "success" | "warning" | "warning-soft" | "destructive" | "destructive2" | "secondary" | "warm" | "info-soft" | "info" | "violet"
type SectionTint = MetricTint

function SectionCard({
  icon: Icon, title, tint = 'primary', right, children, className, fill = false,
}: {
  icon?: React.ComponentType<{ className?: string }>
  title: React.ReactNode
  tint?: SectionTint
  right?: React.ReactNode
  children: React.ReactNode
  className?: string
  /** Stretch the card to its grid-row height and let the body fill the leftover space. */
  fill?: boolean
}) {
  return (
    <div className={cn('bg-card rounded-card p-4 space-y-3 shadow-card border border-border', fill && 'flex flex-col h-full', className)}>
      <div className="flex items-center gap-2.5">
        {Icon && <TintIcon icon={Icon} tint={tint as TintIconTint} size="sm" bordered />}
        <h3 className="text-base font-semibold text-foreground flex-1">{title}</h3>
        {right}
      </div>
      <div className={cn('space-y-3', fill && 'flex-1 min-h-0')}>{children}</div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  unit,
  sub,
  subIcon: SubIcon,
  badge,
  icon: Icon,
  tint = "primary",
  size = "default",
  sparkline,
  sparklineColor,
  onClick,
  className,
  labelClassName,
  valueClassName,
  subClassName,
  subTitle,
}: {
  label: string
  value: string
  unit?: string
  sub?: string
  /** Small inline icon rendered before `sub` — e.g. TrendingUp/Down for delta. */
  subIcon?: React.ComponentType<{ className?: string }>
  /** Native HTML `title` for the sub line — shown as a tooltip on hover. */
  subTitle?: string
  badge?: React.ReactNode
  icon: React.ComponentType<{ className?: string }>
  tint?: MetricTint
  size?: "default" | "sm"
  /** Optional micro-trend rendered at the bottom of the default-size card. */
  sparkline?: number[]
  /** CSS color value for the sparkline; defaults to the card's accent color. */
  sparklineColor?: string
  onClick?: () => void
  className?: string
  labelClassName?: string
  valueClassName?: string
  subClassName?: string
}) {
  const valColor =
    tint === "success"     ? "text-success"
    : tint === "warning"     ? "text-warm-foreground"
    : tint === "destructive" ? "text-destructive"
    : "text-foreground"
  const accentColor =
    tint === "success"     ? "text-success"
    : tint === "warning"     ? "text-warm-foreground"
    : tint === "destructive" ? "text-destructive"
    : tint === "destructive2" ? "text-destructive"
    : tint === "secondary"   ? "text-muted-foreground"
    : tint === "warm"        ? "text-warm-foreground"
    : tint === "warning-soft" ? "text-warning-soft-foreground"
    : tint === "info-soft"   ? "text-info-soft-foreground"
    : tint === "info"        ? "text-info-soft-foreground"
    : tint === "violet"      ? "text-violet-strong"
    : "text-primary"

  // sm = compact variant: icon on the right, 3 stacked lines on the left —
  // label / value+unit / sub. Sizes tuned so the 3-line card matches the old
  // 2-line StatCard height (label text-sm, value text-2xl leading-none, sub
  // text-xs — the sub uses text-xs as helper/caption text per the global
  // size rule). `sub` on its own line means longer captions like
  // "กำไร +6.50 (+76%)" / "เฉลี่ย ฿8.20" no longer get truncated.
  if (size === "sm") {
    const innerSm = (
      <>
        <div className="flex flex-col min-w-0 flex-1 text-left">
          <div className={cn("text-sm font-semibold text-foreground overflow-x-clip overflow-y-visible whitespace-nowrap text-ellipsis leading-snug", labelClassName)} title={label}>{label}</div>
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className={cn("text-lg font-bold leading-none truncate", valColor, valueClassName)} title={value}>{value}</span>
            {unit && <span className="text-sm font-semibold text-muted-foreground truncate" title={unit}>{unit}</span>}
            {badge && <span className="ml-auto shrink-0 self-center">{badge}</span>}
          </div>
          {sub && (
            <div className={cn("text-sm font-semibold truncate leading-tight inline-flex items-center gap-1", accentColor, subClassName)} title={subTitle ?? sub}>
              {SubIcon && <SubIcon className="size-3.5 shrink-0" />}
              <span className="truncate">{sub}</span>
            </div>
          )}
        </div>
        <TintIcon icon={Icon} tint={tint as TintIconTint} size="lg" bordered />
      </>
    )
    // py-2 (vs py-3 on StatCard) compensates for the extra 3rd line: a 2-line
    // StatCard at py-3 ≈ a 3-line MetricCard sm at py-2, so the two card
    // primitives render the same total height when sharing a grid row.
    const baseSm = "bg-card rounded-card shadow-card border border-border px-4 py-2 flex items-center gap-3 overflow-hidden"
    if (onClick) {
      return (
        <button
          type="button"
          onClick={onClick}
          data-slot="metric-card"
          className={cn(baseSm, "cursor-pointer hover:shadow-md transition-all text-left w-full", className)}
        >
          {innerSm}
        </button>
      )
    }
    return (
      <div data-slot="metric-card" className={cn(baseSm, className)}>
        {innerSm}
      </div>
    )
  }

  const inner = (
    <>
      <TintIcon
        icon={Icon}
        tint={tint as TintIconTint}
        size="lg"
        bordered
        className="absolute top-4 right-4 z-10"
      />
      {/* Ambient sparkline at the bottom — inherits accent color via Tailwind
          text utility on the wrapper (Sparkline uses currentColor). Lives below
          the natural content flow so it never overlaps label/value, only the
          empty space under `sub`. */}
      {sparkline && sparkline.length > 0 && (
        <div
          className={cn("absolute inset-x-0 bottom-0 h-9 pointer-events-none", accentColor)}
          style={sparklineColor ? { color: sparklineColor } : undefined}
        >
          <Sparkline data={sparkline} color="currentColor" height={36} />
        </div>
      )}
      <div className="pr-10 min-w-0 relative z-10 h-full flex flex-col justify-start">
        <div className={cn("text-base font-bold text-foreground overflow-x-clip overflow-y-visible whitespace-nowrap text-ellipsis leading-7", labelClassName)} title={label}>{label}</div>
        <div className="flex items-baseline gap-1.5 mt-1 min-w-0">
          <span
            className={cn(
              "text-3xl font-bold leading-none truncate",
              valColor,
              valueClassName,
            )}
            title={value}
          >
            {value}
          </span>
          {unit && <span className="text-sm font-semibold text-muted-foreground truncate" title={unit}>{unit}</span>}
        </div>
        {(sub || badge) && (
          <div className="flex items-center gap-1.5 mt-auto min-w-0">
            {sub && (
              <div className={cn("font-semibold text-sm leading-tight truncate inline-flex items-center gap-1", accentColor, subClassName)} title={subTitle ?? sub}>
                {SubIcon && <SubIcon className="size-3.5 shrink-0" />}
                <span className="truncate">{sub}</span>
              </div>
            )}
            {badge && <div className="shrink-0">{badge}</div>}
          </div>
        )}
      </div>
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        data-slot="metric-card"
        className={cn(
          "bg-card rounded-card p-4 pt-3 shadow-card border border-border h-32 overflow-hidden relative text-left",
          "cursor-pointer hover:shadow-md transition-all",
          className
        )}
      >
        {inner}
      </button>
    )
  }

  return (
    <div
      data-slot="metric-card"
      className={cn(
        "bg-card rounded-card p-4 pt-3 shadow-card border border-border h-32 overflow-hidden relative",
        className
      )}
    >
      {inner}
    </div>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  tint = "primary",
  isActive,
  onClick,
  className,
}: {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
  tint?: MetricTint
  isActive?: boolean
  onClick?: () => void
  className?: string
}) {
  // StatCard maps `warning` → warm-styled icon box (cream/amber) so the card
  // stays soft even when warning is the alert-orange in other contexts.
  const iconTint: TintIconTint = tint === "warning" ? "warm" : tint
  const activeRing =
    !isActive ? "ring-0"
    : tint === "success"     ? "ring-2 ring-success"
    : tint === "warning"     ? "ring-2 ring-warning"
    : tint === "destructive" ? "ring-2 ring-destructive"
    : tint === "secondary"   ? "ring-2 ring-border-strong"
    : tint === "warm"   ? "ring-2 ring-warm-foreground"
    : tint === "info-soft"   ? "ring-2 ring-info-soft-foreground"
    : "ring-2 ring-primary"
  const interactive = onClick
    ? "cursor-pointer hover:shadow-md transition-all text-left"
    : ""
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      data-slot="stat-card"
      className={cn(
        "bg-card rounded-card shadow-card border border-border px-4 py-3 flex items-center gap-3 disabled:cursor-default",
        activeRing,
        interactive,
        className,
      )}
    >
      <div className="flex flex-col min-w-0 flex-1 text-left">
        <span className="text-base text-foreground font-semibold truncate">{label}</span>
        <span className="text-3xl font-bold leading-tight">{value}</span>
      </div>
      <TintIcon icon={Icon} tint={iconTint} size="lg" bordered />
    </button>
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
  MetricCard,
  SectionCard,
  StatCard,
}
export type { MetricTint, SectionTint }
