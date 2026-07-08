import { useId } from 'react'
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  ReferenceLine, ReferenceArea,
} from 'recharts'

// One measurement series on an env chart: a smooth daily-average area/line
// (`avgKey`) plus a red breach marker (`breachKey`) that is non-null only on
// days a reading fell outside the GPP band — so the trend stays readable and
// breaches still pop. `name` heads the legend/tooltip; `color` is a
// `hsl(var(--token))` string (semantic token, never a literal).
export interface EnvSeries {
  avgKey: string
  breachKey: string
  name: string
  color: string
}

export interface EnvTrendDatum {
  day: number
  [key: string]: number | null
}

interface Props {
  data: EnvTrendDatum[]
  series: EnvSeries[]
  /** Upper GPP limit — a red dashed reference line (temp/humidity charts). */
  threshold?: { y: number; label: string }
  /** Safe band — a green tinted area between y1..y2 (fridge chart). */
  band?: { y1: number; y2: number }
  yDomain: [number, number]
  unit: string
  height?: number
}

const DESTRUCTIVE = 'hsl(var(--destructive))'
const SUCCESS = 'hsl(var(--success))'

function fmt(v: number, unit: string): string {
  const n = v % 1 === 0 ? String(v) : parseFloat(v.toFixed(1)).toString()
  return `${n} ${unit}`
}

// White elevated tooltip: day header, one colored row per series, and a red
// "หลุดเกณฑ์" flag when that day carried a breach for the series.
function EnvTooltip({ active, payload, label, series, unit }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload ?? {}
  return (
    <div className="rounded-lg bg-card text-foreground border border-border shadow-xl overflow-hidden text-sm min-w-[150px]">
      <div className="px-3 py-1.5 text-center font-medium border-b border-border">วันที่ {label}</div>
      <div className="px-3 py-2 space-y-1">
        {series.map((s: EnvSeries, i: number) => {
          const v = d[s.avgKey]
          const bad = d[s.breachKey] != null
          return (
            <div key={i} className="flex items-center gap-2 whitespace-nowrap">
              <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
              <span className="text-muted-foreground flex-1">{s.name}</span>
              <span className="font-semibold">{v == null ? '—' : fmt(v, unit)}</span>
              {bad && <span className="text-xs font-semibold text-destructive">หลุดเกณฑ์</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Env measurement chart — daily-average curves per zone, a GPP threshold line or
// safe band, and red breach dots. One y-scale only (temp OR humidity OR fridge,
// never mixed) so it never becomes a dual-axis chart.
export function EnvTrendChart({ data, series, threshold, band, yDomain, unit, height = 220 }: Props) {
  const uid = useId().replace(/:/g, '')
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 12, right: 12, bottom: 4, left: -8 }}>
        <defs>
          {series.map(s => (
            <linearGradient key={s.avgKey} id={`env-${uid}-${s.avgKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.18} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>

        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />

        {/* Safe band (fridge) sits UNDER the curves. */}
        {band && (
          <ReferenceArea y1={band.y1} y2={band.y2} fill={SUCCESS} fillOpacity={0.1} stroke="none" ifOverflow="extendDomain" />
        )}
        {/* Upper GPP limit — red dashed line + label. */}
        {threshold && (
          <ReferenceLine
            y={threshold.y}
            stroke={DESTRUCTIVE}
            strokeDasharray="5 4"
            strokeWidth={1.5}
            ifOverflow="extendDomain"
            label={{ value: threshold.label, position: 'insideTopRight', fill: DESTRUCTIVE, fontSize: 11, dy: -2 }}
          />
        )}

        <XAxis
          dataKey="day"
          tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval={2}
        />
        <YAxis
          domain={yDomain}
          tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
          width={40}
          tickFormatter={(v) => String(v)}
        />
        <Tooltip
          content={<EnvTooltip series={series} unit={unit} />}
          cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1, strokeDasharray: '4 4' }}
        />

        {/* Average curve per series. */}
        {series.map(s => (
          <Area
            key={s.avgKey}
            type="monotone"
            dataKey={s.avgKey}
            name={s.name}
            stroke={s.color}
            strokeWidth={2.5}
            fill={`url(#env-${uid}-${s.avgKey})`}
            connectNulls
            dot={false}
            activeDot={{ r: 5, strokeWidth: 2, stroke: s.color, fill: 'hsl(var(--card))' }}
          />
        ))}
        {/* Breach markers — red dots only on out-of-range days (no connecting line). */}
        {series.map(s => (
          <Line
            key={s.breachKey}
            type="monotone"
            dataKey={s.breachKey}
            stroke="transparent"
            connectNulls={false}
            isAnimationActive={false}
            dot={{ r: 4, fill: DESTRUCTIVE, stroke: 'hsl(var(--card))', strokeWidth: 1.5 }}
            activeDot={{ r: 5, fill: DESTRUCTIVE, stroke: 'hsl(var(--card))', strokeWidth: 1.5 }}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
