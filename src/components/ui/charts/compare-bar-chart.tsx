import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, Cell,
} from 'recharts'
import { formatCurrency } from '@/lib/utils'

export interface CompareDatum {
  name: string
  current: number
  previous: number
}

function compactNumber(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`
  if (v <= -1_000_000) return `-${(Math.abs(v) / 1_000_000).toFixed(1)}M`
  if (v <= -1_000) return `-${(Math.abs(v) / 1_000).toFixed(0)}K`
  return v.toLocaleString()
}

// Highlight an individual bar (e.g. negative profit) by overriding fill.
function deltaFill(curr: number, prev: number, fallback: string): string {
  if (prev === 0) return fallback
  return curr >= prev ? fallback : 'hsl(var(--destructive))'
}

interface Props {
  data: CompareDatum[]
  height?: number
  /** Label for the "current" series (e.g. "ช่วงนี้"). */
  currentLabel?: string
  /** Label for the "previous" series (e.g. "ช่วงก่อน"). */
  previousLabel?: string
}

export function CompareBarChart({
  data, height = 280,
  currentLabel = 'ช่วงนี้', previousLabel = 'ช่วงก่อน',
}: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="name"
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
          formatter={(v) => formatCurrency(Number(v))}
          cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
        />
        <Legend wrapperStyle={{ fontSize: '13px', paddingTop: '8px' }} iconType="circle" />
        <Bar dataKey="previous" name={previousLabel} fill="hsl(var(--muted-foreground))" fillOpacity={0.55} radius={[4, 4, 0, 0]} />
        <Bar dataKey="current" name={currentLabel} radius={[4, 4, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={deltaFill(d.current, d.previous, 'hsl(var(--primary))')} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
