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

type MetricTint = "primary-soft" | "success-soft" | "warning-soft" | "destructive-soft" | "neutral" | "amber-soft" | "info-soft" | "info" | "violet-soft"
type SectionTint = MetricTint

function SectionCard({
  icon: Icon, title, tint = 'primary-soft', right, children, className, fill = false,
}: {
  icon?: React.ComponentType<{ className?: string }>
  /** Optional — omit (with no icon/right) for a headerless card: the header row
      is skipped entirely so there's no empty top space. */
  title?: React.ReactNode
  /** SectionCard forwards tint straight to TintIcon, so it accepts the full
      TintIcon palette (e.g. teal/violet) — not just the MetricCard subset. */
  tint?: TintIconTint
  right?: React.ReactNode
  children: React.ReactNode
  className?: string
  /** Stretch the card to its grid-row height and let the body fill the leftover space. */
  fill?: boolean
}) {
  const hasHeader = Icon || title != null || right != null
  return (
    <div className={cn('bg-card rounded-card p-4 space-y-3 shadow-card border border-border', fill && 'flex flex-col h-full', className)}>
      {hasHeader && (
        <div className="flex items-center gap-2.5">
          {Icon && <TintIcon icon={Icon} tint={tint as TintIconTint} size="sm" bordered />}
          {title != null && <h3 className="text-base font-semibold text-foreground flex-1">{title}</h3>}
          {right}
        </div>
      )}
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
  tint = "primary-soft",
  size = "default",
  sparkline,
  sparklineColor,
  onClick,
  isActive,
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
  /** When clickable, renders a tinted ring to mark this card as the active
      selection (e.g. a status-filter shortcut). Ignored without `onClick`. */
  isActive?: boolean
  className?: string
  labelClassName?: string
  valueClassName?: string
  subClassName?: string
}) {
  const valColor =
    tint === "success-soft"     ? "text-success"
    : tint === "warning-soft"     ? "text-warning-soft-foreground"
    : tint === "destructive-soft" ? "text-destructive"
    : "text-foreground"
  const accentColor =
    tint === "success-soft"     ? "text-success"
    : tint === "warning-soft"     ? "text-warning-soft-foreground"
    : tint === "destructive-soft" ? "text-destructive"
    : tint === "neutral"   ? "text-muted-foreground"
    : tint === "amber-soft"        ? "text-amber-strong"
    : tint === "info-soft"   ? "text-info-soft-foreground"
    : tint === "info"        ? "text-info-soft-foreground"
    : tint === "violet-soft"      ? "text-violet-strong"
    : "text-primary"
  // Active-selection ring — only meaningful on the clickable (button) variant.
  // Ring color tracks the card tint so the highlight matches its accent.
  const activeRing =
    !isActive ? ""
    : tint === "success-soft"     ? "ring-2 ring-success"
    : tint === "warning-soft"     ? "ring-2 ring-warning"
    : tint === "destructive-soft" ? "ring-2 ring-destructive"
    : tint === "neutral"   ? "ring-2 ring-border-strong"
    : tint === "amber-soft"       ? "ring-2 ring-amber-strong"
    : tint === "violet-soft"      ? "ring-2 ring-violet-strong"
    : tint === "info-soft"   ? "ring-2 ring-info-soft-foreground"
    : tint === "info"        ? "ring-2 ring-info-soft-foreground"
    : "ring-2 ring-primary"

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
          className={cn(baseSm, "cursor-pointer hover:shadow-md transition-all text-left w-full", activeRing, className)}
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
          activeRing,
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
  tint = "primary-soft",
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
  // StatCard maps `warning` → warm-styled icon box (amber/gold) so the card
  // stays soft even when warning is the alert-orange in other contexts.
  const iconTint: TintIconTint = tint === "warning-soft" ? "amber-soft" : tint
  const activeRing =
    !isActive ? "ring-0"
    : tint === "success-soft"     ? "ring-2 ring-success"
    : tint === "warning-soft"     ? "ring-2 ring-warning"
    : tint === "destructive-soft" ? "ring-2 ring-destructive"
    : tint === "neutral"   ? "ring-2 ring-border-strong"
    : tint === "amber-soft"   ? "ring-2 ring-amber-strong"
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

// MetricStrip — a row of KPI cells JOINED into one bordered panel: a single outer
// border + rounded corners, cells split by internal vertical dividers (no gaps).
// Each cell: inline icon + label, a big value, then an optional colored delta with
// a muted comparison note. Distinct from MetricCard (standalone card, tinted icon
// box) — use when several KPIs should read as one connected band.
interface MetricStripItem {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
  /** Tint for the TintIcon box beside the label — same palette as MetricCard /
      SectionCard. Defaults to "primary". */
  tint?: TintIconTint
  /** Color token class for the VALUE, e.g. "text-success" / "text-destructive"
      — use for sign-meaningful figures (profit/margin). Defaults to foreground. */
  valueClassName?: string
  /** Small inline element after the value on the same baseline (e.g. a margin
      "39.7%"). Defaults to muted; colorize via `valueSuffixClassName`. */
  valueSuffix?: React.ReactNode
  /** Color token class for `valueSuffix`, e.g. "text-success". Defaults to muted. */
  valueSuffixClassName?: string
  /** Muted supplementary sub line. ReactNode so callers can bold parts (e.g.
      the numbers) while keeping units in the muted weight. */
  note?: React.ReactNode
  /** Trend value on the trend line, e.g. "+27.9%". The WHOLE trend line (value +
      compare + icon) is colored via `deltaClassName`. */
  delta?: string
  /** Color token class for the trend line, e.g. "text-success" / "text-destructive". */
  deltaClassName?: string
  /** Label after the delta on the trend line, e.g. "vs เดือนก่อน". */
  compare?: string
  /** Trailing direction icon for the trend line (TrendingUp / TrendingDown). */
  deltaIcon?: React.ComponentType<{ className?: string }>
}
function MetricStrip({
  items,
  className,
}: {
  items: MetricStripItem[]
  className?: string
}) {
  return (
    <div
      data-slot="metric-strip"
      className={cn(
        "flex divide-x divide-border rounded-card border border-border bg-card shadow-card overflow-hidden h-[9.2rem]",
        className,
      )}
    >
      {items.map((it, i) => {
        const Icon = it.icon
        const DeltaIcon = it.deltaIcon
        // Long values (e.g. ฿12,345,678.90) step the font DOWN instead of being
        // truncated — a KPI figure must always stay fully readable.
        const vlen = String(it.value).length
        const valueSize = vlen >= 14 ? 'text-xl' : vlen >= 11 ? 'text-2xl' : 'text-3xl'
        return (
          <div key={i} className="flex-1 min-w-0 px-5 py-4 flex items-start gap-3">
            {/* Text column: label pinned top, value+delta grouped at the bottom —
                justify-between balances them across the card's fixed height. The
                tinted icon sits top-right (size lg, matching MetricCard). */}
            <div className="flex-1 min-w-0 h-full flex flex-col justify-between gap-3">
              {/* overflow-x-clip (not truncate) so Thai upper tone marks aren't cut */}
              <span className="text-base font-bold text-foreground overflow-x-clip overflow-y-visible whitespace-nowrap text-ellipsis" title={it.label}>{it.label}</span>
              <div className="flex flex-col gap-1 min-w-0">
              <div className="flex items-baseline gap-1.5 min-w-0">
                <div className={cn(valueSize, "font-bold text-foreground leading-none whitespace-nowrap overflow-x-clip", it.valueClassName)} title={it.value}>{it.value}</div>
                {it.valueSuffix != null && (
                  <span className={cn("text-sm font-semibold shrink-0 whitespace-nowrap", it.valueSuffixClassName ?? "text-muted-foreground")}>{it.valueSuffix}</span>
                )}
              </div>
              {/* Sub line 1 — trend: the whole line takes the delta color, with a
                  trailing up/down icon. */}
              {it.delta && (
                <span className={cn("text-sm inline-flex items-center gap-1.5 min-w-0 whitespace-nowrap font-semibold", it.deltaClassName)}>
                  <span title={it.delta}>{it.delta}</span>
                  {it.compare && <span className="font-normal opacity-80 overflow-x-clip overflow-y-visible text-ellipsis">{it.compare}</span>}
                  {DeltaIcon && <DeltaIcon className="size-4 shrink-0" />}
                </span>
              )}
              {/* Sub line 2 — muted supplementary figure (callers may bold parts) */}
              {it.note && (
                <span className="text-sm text-muted-foreground min-w-0 overflow-x-clip overflow-y-visible whitespace-nowrap text-ellipsis">{it.note}</span>
              )}
              </div>
            </div>
            <TintIcon icon={Icon} tint={it.tint ?? "primary-soft"} size="lg" bordered />
          </div>
        )
      })}
    </div>
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
  MetricStrip,
  SectionCard,
  StatCard,
}
export type { MetricTint, SectionTint, MetricStripItem }
