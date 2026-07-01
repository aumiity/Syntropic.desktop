import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid,
} from 'recharts'
import { formatCurrency } from '@/lib/utils'
import type { Granularity } from './granularity-tabs'
import { formatBucket, type TrendDatum } from './trend-chart'

// Diverging trend — sales bars rise ABOVE the zero line (cost in the brand
// color with profit stacked at the base in green), purchase bars drop BELOW as
// negative values, with a center zero line + a real (signed) Y axis. Built on
// recharts BarChart (one shared stackId → up + down aligned in one column) so a single time axis carries
// ขาย · ซื้อ · กำไร at once — the existing TrendChart can't stack or cross zero.

export type DivergingMode = 'all' | 'sales' | 'purchase' | 'profit'

// Each datum is augmented with the cost-only portion (sales_net − profit) and
// the negated purchase total so recharts can stack/dip without re-deriving.
interface DivergingDatum extends TrendDatum {
  sales_cost_only: number
  purchase_neg: number
}

// Signed, abbreviated axis tick (no ฿ symbol): -150k below zero, 200k above.
function formatAxisTick(v: number): string {
  const a = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (a >= 1_000_000) return `${sign}${(a / 1_000_000).toFixed(1)}M`
  if (a >= 1_000) return `${sign}${Math.round(a / 1_000)}k`
  return `${sign}${a.toLocaleString()}`
}

// White elevated tooltip — shows the REAL (un-negated) figures per bucket,
// filtered to whatever the current mode plots.
function DivergingTooltip({ active, payload, label, granularity, mode }: any) {
  if (!active || !payload?.length) return null
  const d: DivergingDatum = payload[0]?.payload ?? {}
  const margin = d.sales_net > 0 ? (d.sales_profit / d.sales_net) * 100 : 0
  const rows: { name: string; value: number; color: string; extra?: string }[] = []
  if (mode === 'all' || mode === 'sales') {
    rows.push({ name: 'ยอดขาย', value: d.sales_net ?? 0, color: 'hsl(var(--primary))' })
  }
  if (mode === 'all' || mode === 'profit') {
    rows.push({ name: 'กำไร', value: d.sales_profit ?? 0, color: 'hsl(var(--success))', extra: d.sales_net > 0 ? `(${margin.toFixed(1)}%)` : undefined })
  }
  if (mode === 'all' || mode === 'purchase') {
    rows.push({ name: 'ยอดซื้อ', value: d.purchase_total ?? 0, color: 'hsl(var(--info))' })
  }
  return (
    <div className="rounded-lg bg-card text-foreground border border-border shadow-xl overflow-hidden text-sm min-w-[160px]">
      <div className="px-3 py-1.5 text-center font-medium border-b border-border">
        {formatBucket(label, granularity)}
      </div>
      <div className="px-3 py-2 space-y-1">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2 whitespace-nowrap">
            <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
            <span className="text-muted-foreground flex-1">{r.name}</span>
            <span className="font-semibold">{formatCurrency(r.value)}</span>
            {r.extra && <span className="text-muted-foreground">{r.extra}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

interface Props {
  data: TrendDatum[]
  granularity: Granularity
  /** Number (px) or a percent like "100%" to fill a flex/grid parent. */
  height?: number | `${number}%`
  /** all = both directions; sales = up bars only; purchase = down bars only;
      profit = only the green profit bar (up). */
  mode?: DivergingMode
}

export function DivergingTrendChart({ data, granularity, height = 300, mode = 'all' }: Props) {
  const rows: DivergingDatum[] = data.map((d) => ({
    ...d,
    sales_cost_only: Math.max(0, (d.sales_net ?? 0) - (d.sales_profit ?? 0)),
    purchase_neg: -(d.purchase_total ?? 0),
  }))

  const showDown = mode === 'all' || mode === 'purchase'

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 16, right: 16, bottom: 4, left: 4 }} barCategoryGap="28%" stackOffset="sign">
        {/* Per-bar HARD half-split: left half paler, right half full color, with a
            crisp edge at the midpoint (two stops at 50%). objectBoundingBox units →
            each bar splits down its own middle. */}
        <defs>
          {[['gradSales', '--primary'], ['gradProfit', '--success'], ['gradPurchase', '--info']].map(([id, token]) => (
            <linearGradient key={id} id={id} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={`hsl(var(${token}))`} stopOpacity={0.45} />
              <stop offset="50%" stopColor={`hsl(var(${token}))`} stopOpacity={0.45} />
              <stop offset="50%" stopColor={`hsl(var(${token}))`} stopOpacity={1} />
              <stop offset="100%" stopColor={`hsl(var(${token}))`} stopOpacity={1} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="date"
          tickFormatter={(v) => formatBucket(v, granularity)}
          tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <YAxis
          tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={formatAxisTick}
        />
        <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} />
        <Tooltip
          content={<DivergingTooltip granularity={granularity} mode={mode} />}
          cursor={{ fill: 'hsl(var(--muted))', fillOpacity: 0.4 }}
        />
        {/* All bars share ONE stackId so up (positive) + down (negative) align in
            the same column. 'all' = sales split into profit (green base) + cost
            (brand top); 'sales' = the FULL sales_net as one brand bar (profit lives
            in its own mode); 'profit' = profit only. */}
        {mode === 'all' && (
          <Bar dataKey="sales_profit" name="กำไร" stackId="a" fill="url(#gradProfit)" stroke="hsl(var(--success))" strokeWidth={1} radius={[0, 0, 0, 0]} maxBarSize={32} />
        )}
        {mode === 'all' && (
          <Bar dataKey="sales_cost_only" name="ยอดขาย" stackId="a" fill="url(#gradSales)" stroke="hsl(var(--primary))" strokeWidth={1} radius={[5, 5, 0, 0]} maxBarSize={32} />
        )}
        {mode === 'sales' && (
          <Bar dataKey="sales_net" name="ยอดขาย" stackId="a" fill="url(#gradSales)" stroke="hsl(var(--primary))" strokeWidth={1} radius={[5, 5, 0, 0]} maxBarSize={32} />
        )}
        {mode === 'profit' && (
          <Bar dataKey="sales_profit" name="กำไร" stackId="a" fill="url(#gradProfit)" stroke="hsl(var(--success))" strokeWidth={1} radius={[5, 5, 0, 0]} maxBarSize={32} />
        )}
        {/* Purchases drop below the zero line (negative values). For a negative
            bar recharts flips the radius order, so [5,5,0,0] rounds the BOTTOM
            (far/plunging end) — the head points down. */}
        {showDown && (
          <Bar dataKey="purchase_neg" name="ยอดซื้อ" stackId="a" fill="url(#gradPurchase)" stroke="hsl(var(--info))" strokeWidth={1} radius={[5, 5, 0, 0]} maxBarSize={32} />
        )}
      </BarChart>
    </ResponsiveContainer>
  )
}
