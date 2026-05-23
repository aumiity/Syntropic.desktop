import { useId } from 'react'
import { ResponsiveContainer, AreaChart, Area } from 'recharts'

interface Props {
  data: number[]
  color?: string
  height?: number
  /** Smooth (monotone curve) vs sharp polyline. Smooth reads better at small sizes. */
  smooth?: boolean
}

/**
 * Tiny inline trend used as ambient chrome inside KPI cards. Strips all
 * recharts axes/grid/tooltips for a clean micro-chart. Color defaults to the
 * current text color via `currentColor` so it inherits the card's tint.
 */
export function Sparkline({
  data,
  color = 'currentColor',
  height = 28,
  smooth = true,
}: Props) {
  const gradId = useId().replace(/:/g, '') // SVG IDs can't contain ':' from React's useId
  if (data.length === 0) {
    return <div style={{ height }} />
  }
  const series = data.map((v, i) => ({ x: i, v }))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={series} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type={smooth ? 'monotone' : 'linear'}
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#${gradId})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
