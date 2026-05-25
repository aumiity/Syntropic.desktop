import * as React from "react"

import { cn } from "@/lib/utils"
import { Sparkline } from "@/components/ui/charts/sparkline"

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
        "shadow-card",
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

type MetricTint = "primary" | "success" | "warning" | "destructive" | "secondary" | "warm" | "info-soft"
type SectionTint = MetricTint

function SectionCard({
  icon: Icon, title, tint = 'primary', right, children, className,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  tint?: SectionTint
  right?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  const iconBox =
    tint === 'success'     ? 'bg-success-soft text-success'
    : tint === 'warning'   ? 'bg-warning-soft text-warning-strong'
    : tint === 'destructive' ? 'bg-destructive-soft text-destructive'
    : tint === 'secondary' ? 'bg-muted text-muted-foreground'
    : tint === "warm"   ? "bg-warm text-warm-foreground"
    : tint === "info-soft"   ? "bg-info-soft text-info-soft-foreground"
    : 'bg-primary-soft text-primary'
  return (
    <div className={cn('bg-card rounded-card p-4 space-y-3 shadow-card', className)}>
      <div className="flex items-center gap-2.5">
        <span className={cn('grid place-items-center size-8 rounded-lg shrink-0', iconBox)}>
          <Icon className="size-4" />
        </span>
        <h3 className="text-base font-semibold text-foreground flex-1">{title}</h3>
        {right}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  unit,
  sub,
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
  const iconBox =
    tint === "success"     ? "bg-success-soft text-success"
    : tint === "warning"     ? "bg-warning-soft text-warning-strong"
    : tint === "destructive" ? "bg-destructive-soft text-destructive"
    : tint === "secondary"   ? "bg-muted text-muted-foreground"
    : tint === "warm"   ? "bg-warm text-warm-foreground"
    : tint === "info-soft"   ? "bg-info-soft text-info-soft-foreground"
    : "bg-primary-soft text-primary"
  const valColor =
    tint === "success"     ? "text-success"
    : tint === "warning"     ? "text-warning-strong"
    : tint === "destructive" ? "text-destructive"
    : "text-foreground"
  const accentColor =
    tint === "success"     ? "text-success"
    : tint === "warning"     ? "text-warning-strong"
    : tint === "destructive" ? "text-destructive"
    : tint === "secondary"   ? "text-muted-foreground"
    : tint === "warm"        ? "text-warm-foreground"
    : tint === "info-soft"   ? "text-info-soft-foreground"
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
          <div className={cn("text-sm font-semibold text-foreground truncate leading-tight", labelClassName)} title={label}>{label}</div>
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className={cn("text-lg font-bold leading-none truncate", valColor, valueClassName)} title={value}>{value}</span>
            {unit && <span className="text-sm font-semibold text-muted-foreground truncate" title={unit}>{unit}</span>}
            {badge && <span className="ml-auto shrink-0 self-center">{badge}</span>}
          </div>
          {sub && <div className={cn("text-sm font-semibold truncate leading-tight", accentColor, subClassName)} title={subTitle ?? sub}>{sub}</div>}
        </div>
        <span className={cn("grid place-items-center size-11 rounded-xl shrink-0", iconBox)}>
          <Icon className="size-7" />
        </span>
      </>
    )
    // py-2 (vs py-3 on StatCard) compensates for the extra 3rd line: a 2-line
    // StatCard at py-3 ≈ a 3-line MetricCard sm at py-2, so the two card
    // primitives render the same total height when sharing a grid row.
    const baseSm = "bg-card rounded-card shadow-card px-4 py-2 flex items-center gap-3 overflow-hidden"
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
      <span className={cn("absolute top-4 right-4 grid place-items-center size-11 rounded-xl z-10", iconBox)}>
        <Icon className="size-7" />
      </span>
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
      <div className="pr-14 min-w-0 relative z-10">
        <div className={cn("text-base font-bold text-foreground truncate", labelClassName)} title={label}>{label}</div>
        {/* Value scales with card width via container queries — `cqi` = 1% of
            the container's inline-size. At ~200px-wide cards on a tight 6-col
            grid the font shrinks toward the min (text-sm); at full width it
            caps at text-3xl. Pure CSS, no ResizeObserver. */}
        <div className="flex items-baseline gap-1.5 mt-1 min-w-0 [container-type:inline-size]">
          <span
            className={cn(
              "font-bold leading-none truncate",
              "text-[clamp(0.875rem,14cqi,1.875rem)]",
              valColor,
              valueClassName,
            )}
            title={value}
          >
            {value}
          </span>
          {unit && <span className="text-sm font-semibold text-muted-foreground truncate" title={unit}>{unit}</span>}
        </div>
        {sub && <div className={cn("font-semibold text-sm leading-tight truncate", accentColor, subClassName)} title={subTitle}>{sub}</div>}
        {badge && <div className="mt-1.5">{badge}</div>}
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
          "bg-card rounded-card p-4 shadow-card h-32 overflow-hidden relative text-left",
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
        "bg-card rounded-card p-4 shadow-card h-32 overflow-hidden relative",
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
  const iconBox =
    tint === "success"     ? "bg-success-soft text-success"
    : tint === "warning"     ? "bg-warm text-warm-foreground"
    : tint === "destructive" ? "bg-destructive-soft text-destructive"
    : tint === "secondary"   ? "bg-muted text-muted-foreground"
    : tint === "warm"   ? "bg-warm text-warm-foreground"
    : tint === "info-soft"   ? "bg-info-soft text-info-soft-foreground"
    : "bg-primary-soft text-primary"
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
        "bg-card rounded-card shadow-card px-4 py-3 flex items-center gap-3 disabled:cursor-default",
        activeRing,
        interactive,
        className,
      )}
    >
      <div className="flex flex-col min-w-0 flex-1 text-left">
        <span className="text-base text-foreground font-semibold truncate">{label}</span>
        <span className="text-3xl font-bold leading-tight">{value}</span>
      </div>
      <span className={cn("grid place-items-center size-11 rounded-xl shrink-0", iconBox)}>
        <Icon className="size-7" />
      </span>
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
