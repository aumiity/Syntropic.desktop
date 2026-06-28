import { useId } from 'react'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import dayjs from 'dayjs'
import { formatCurrency } from '@/lib/utils'
import type { Granularity } from './granularity-tabs'

export interface TrendDatum {
  date: string
  sales_net: number
  sales_cost: number
  sales_profit: number
  bill_count?: number
  purchase_total?: number
  purchase_count?: number
}

/** How tooltip + Y-axis render a value: full currency, or a plain integer count. */
type ValueFormat = 'currency' | 'int'

function fmtValue(v: number, vf: ValueFormat): string {
  return vf === 'int' ? Math.round(v).toLocaleString() : formatCurrency(v)
}

// Compact Y-axis ticks: counts plain, money abbreviated (190k / 1.2M) so the
// axis stays narrow.
function formatAxisTick(v: number, vf: ValueFormat): string {
  if (vf === 'int') return v.toLocaleString()
  const a = Math.abs(v)
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (a >= 1_000) return `${Math.round(v / 1_000)}k`
  return v.toLocaleString()
}

function formatBucket(key: string, granularity: Granularity): string {
  if (granularity === 'year') return dayjs(`${key}-01-01`).format('BBBB')
  if (granularity === 'month') return dayjs(`${key}-01`).format('MMM BB')
  if (granularity === 'week') {
    const m = key.match(/W(\d+)/)
    return m ? `W${m[1]}` : key
  }
  if (granularity === 'hour') return dayjs(key).format('HH:mm')
  return dayjs(key).format('D MMM')
}

// White elevated tooltip. Header is the bucket label; rows show colored dot +
// series name + currency value. The profit row also carries the margin %
// (profit ÷ sales) for that bucket.
function ChartTooltip({ active, payload, label, granularity, valueFormat = 'currency' }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload ?? {}
  const margin = d.sales_net > 0 ? (d.sales_profit / d.sales_net) * 100 : 0
  return (
    <div className="rounded-lg bg-card text-foreground border border-border shadow-xl overflow-hidden text-sm min-w-[160px]">
      <div className="px-3 py-1.5 text-center font-medium border-b border-border">
        {formatBucket(label, granularity)}
      </div>
      <div className="px-3 py-2 space-y-1">
        {payload.map((p: any, i: number) => (
          <div key={i} className="flex items-center gap-2 whitespace-nowrap">
            <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
            <span className="text-muted-foreground flex-1">{p.name}</span>
            <span className="font-semibold">{fmtValue(p.value, valueFormat)}</span>
            {p.dataKey === 'sales_profit' && d.sales_net > 0 && (
              <span className="text-muted-foreground">({margin.toFixed(1)}%)</span>
            )}
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
  /** 'area' (default) = filled curves; 'bar' = vertical bars. */
  variant?: 'area' | 'bar'
  /** Bar variant only — series to plot. Defaults to ยอดขาย + กำไร. Pass a single
      entry for a one-metric chart (e.g. just จำนวนบิล). */
  bars?: { key: string; name: string; color: string }[]
  /** How tooltip + Y-axis format values (bar variant). */
  valueFormat?: ValueFormat
}

export function TrendChart({ data, granularity, height = 300, variant = 'area', bars, valueFormat = 'currency' }: Props) {
  const uid = useId().replace(/:/g, '')
  const gSales = `tc-sales-${uid}`
  const gProfit = `tc-profit-${uid}`

  // Shared axis + tooltip config so the two variants stay visually identical
  // apart from the series shape.
  const xAxis = (
    <XAxis
      dataKey="date"
      tickFormatter={(v) => formatBucket(v, granularity)}
      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
      tickLine={false}
      axisLine={false}
      tickMargin={8}
    />
  )

  if (variant === 'bar') {
    const barList = bars ?? [
      { key: 'sales_net', name: 'ยอดขาย', color: 'hsl(var(--primary))' },
      { key: 'sales_profit', name: 'กำไร', color: 'hsl(var(--primary-soft-border))' },
    ]
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 16, right: 16, bottom: 4, left: 4 }} barGap={2} barCategoryGap="28%">
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
          {xAxis}
          <YAxis
            tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={(v) => formatAxisTick(v, valueFormat)}
          />
          <Tooltip
            content={<ChartTooltip granularity={granularity} valueFormat={valueFormat} />}
            cursor={{ fill: 'hsl(var(--muted))', fillOpacity: 0.4 }}
          />
          {barList.map((bar) => (
            <Bar key={bar.key} dataKey={bar.key} name={bar.name} fill={bar.color} radius={[5, 5, 0, 0]} maxBarSize={40} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 16, right: 16, bottom: 4, left: 0 }}>
        <defs>
          <linearGradient id={gSales} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="hsl(var(--primary))" stopOpacity={0.22} />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
          <linearGradient id={gProfit} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="hsl(var(--info-soft-foreground))" stopOpacity={0.22} />
            <stop offset="100%" stopColor="hsl(var(--info-soft-foreground))" stopOpacity={0} />
          </linearGradient>
        </defs>
        {/* Grid lines removed — reference dashboard look is just the curves. */}
        <XAxis
          dataKey="date"
          tickFormatter={(v) => formatBucket(v, granularity)}
          tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        {/* YAxis stays mounted so recharts has a scale to map values to pixels;
            `hide` drops the tick labels + axis line so the chart sits flush. */}
        <YAxis hide />
        <Tooltip
          content={<ChartTooltip granularity={granularity} />}
          cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1, strokeDasharray: '4 4' }}
        />
        <Area
          type="monotone" dataKey="sales_net" name="ยอดขาย"
          stroke="hsl(var(--primary))" strokeWidth={3}
          fill={`url(#${gSales})`}
          dot={false}
          activeDot={{ r: 5, strokeWidth: 2.5, stroke: 'hsl(var(--primary))', fill: 'hsl(var(--card))' }}
        />
        <Area
          type="monotone" dataKey="sales_profit" name="กำไร"
          stroke="hsl(var(--info-soft-foreground))" strokeWidth={3}
          fill={`url(#${gProfit})`}
          dot={false}
          activeDot={{ r: 5, strokeWidth: 2.5, stroke: 'hsl(var(--info-soft-foreground))', fill: 'hsl(var(--card))' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
