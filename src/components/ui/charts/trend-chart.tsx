import {
  ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
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

// Compact axis label: 12,345 → 12K, 1,234,567 → 1.2M.
// Long currency strings squash chart width if rendered on the Y-axis directly.
function compactNumber(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`
  if (v <= -1_000_000) return `-${(Math.abs(v) / 1_000_000).toFixed(1)}M`
  if (v <= -1_000) return `-${(Math.abs(v) / 1_000).toFixed(0)}K`
  return v.toLocaleString()
}

function formatBucket(key: string, granularity: Granularity): string {
  if (granularity === 'year') return dayjs(`${key}-01-01`).format('BBBB')
  if (granularity === 'month') return dayjs(`${key}-01`).format('MMM BB')
  if (granularity === 'week') {
    // "2026-W21" — recharts ticks are crowded with these so we shorten.
    const m = key.match(/W(\d+)/)
    return m ? `W${m[1]}` : key
  }
  return dayjs(key).format('D MMM')
}

interface Props {
  data: TrendDatum[]
  granularity: Granularity
  height?: number
  showPurchases?: boolean
}

export function TrendChart({ data, granularity, height = 300, showPurchases = false }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="date"
          tickFormatter={(v) => formatBucket(v, granularity)}
          tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={{ stroke: 'hsl(var(--border))' }}
          axisLine={{ stroke: 'hsl(var(--border))' }}
        />
        <YAxis
          tickFormatter={compactNumber}
          tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={{ stroke: 'hsl(var(--border))' }}
          axisLine={{ stroke: 'hsl(var(--border))' }}
          width={50}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 'var(--radius-control)',
            fontSize: '13px',
          }}
          labelFormatter={(v) => formatBucket(v, granularity)}
          formatter={(v) => formatCurrency(Number(v))}
        />
        <Legend
          wrapperStyle={{ fontSize: '13px', paddingTop: '8px' }}
          iconType="circle"
        />
        {showPurchases && (
          <Bar dataKey="purchase_total" name="ยอดซื้อ" fill="hsl(var(--info-soft-foreground))" fillOpacity={0.4} radius={[4, 4, 0, 0]} />
        )}
        <Line type="monotone" dataKey="sales_net" name="ยอดขายสุทธิ" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
        <Line type="monotone" dataKey="sales_cost" name="ต้นทุน" stroke="hsl(var(--warning-strong))" strokeWidth={2} dot={false} activeDot={{ r: 4 }} strokeDasharray="4 4" />
        <Line type="monotone" dataKey="sales_profit" name="กำไร" stroke="hsl(var(--success))" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
