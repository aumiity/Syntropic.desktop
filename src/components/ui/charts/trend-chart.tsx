import { useId } from 'react'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
} from 'recharts'
import dayjs from 'dayjs'
import { formatCurrency } from '@/lib/utils'
import type { Granularity } from './granularity-tabs'

export interface TrendDatum {
  date: string
  sales_net: number
  sales_cost: number
  sales_profit: number
  purchase_total?: number
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

// Dark pill tooltip à la modern dashboards (Linear / Vercel-style). Header is
// the bucket label; rows show colored dot + series name + currency value.
function ChartTooltip({ active, payload, label, granularity }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg bg-foreground text-background shadow-xl overflow-hidden text-sm min-w-[140px]">
      <div className="px-3 py-1.5 text-center font-medium border-b border-background/15">
        {formatBucket(label, granularity)}
      </div>
      <div className="px-3 py-2 space-y-1">
        {payload.map((p: any, i: number) => (
          <div key={i} className="flex items-center gap-2 whitespace-nowrap">
            <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
            <span className="text-background/70 flex-1">{p.name}</span>
            <span className="font-semibold">{formatCurrency(p.value)}</span>
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
  /** 'area' (default) = filled curves; 'bar' = grouped vertical bars. */
  variant?: 'area' | 'bar'
}

export function TrendChart({ data, granularity, height = 300, variant = 'area' }: Props) {
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
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 16, right: 16, bottom: 4, left: 0 }} barGap={2} barCategoryGap="22%">
          {xAxis}
          {/* domain [0, dataMax] (no "nice" rounding) so the tallest bar reaches
              the top of the plot — bars fill the full chart height. */}
          <YAxis hide domain={[0, 'dataMax']} />
          <Tooltip
            content={<ChartTooltip granularity={granularity} />}
            cursor={{ fill: 'hsl(var(--muted))', fillOpacity: 0.4 }}
          />
          <Bar dataKey="sales_net" name="ยอดขาย" fill="hsl(var(--primary))" radius={[5, 5, 0, 0]} maxBarSize={40} />
          <Bar dataKey="sales_profit" name="กำไร" fill="hsl(var(--info-soft-foreground))" radius={[5, 5, 0, 0]} maxBarSize={40} />
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
