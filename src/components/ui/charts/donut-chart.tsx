import React from 'react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'

// Pure-SVG donut — a ring of proportional arcs drawn with the stroke-dash
// technique (one <circle> per segment, no path math, no recharts → safe to
// import anywhere, including Dashboard.tsx). Segments dim on hover via the
// shared `hovered`/`onHover` pair so a donut and its legend cross-highlight.
// Zero-count segments are skipped; an all-zero donut shows the empty track.

export interface DonutSegment { key: string; label: string; count: number; color: string }

interface Props {
  segments: DonutSegment[]
  /** Outer square size in px. */
  size?: number
  /** Ring thickness in px. */
  thickness?: number
  hovered?: string | null
  onHover?: (key: string | null) => void
  /** Big number in the hole (e.g. the total). */
  centerLabel?: React.ReactNode
  /** Caption under the center label. */
  centerSub?: React.ReactNode
  /** Tooltip body for a hovered arc — omit for no tooltip. */
  renderTip?: (seg: DonutSegment) => React.ReactNode
  className?: string
}

export function DonutChart({
  segments, size = 148, thickness = 20,
  hovered, onHover, centerLabel, centerSub, renderTip, className,
}: Props) {
  const total = segments.reduce((s, seg) => s + seg.count, 0)
  const c = size / 2
  const r = (size - thickness) / 2
  const circ = 2 * Math.PI * r
  const segs = segments.filter(s => s.count > 0)
  const dim = (k: string) => (hovered != null && hovered !== k ? 0.4 : 1)

  let acc = 0
  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      {/* -rotate-90 → arcs start at 12 o'clock and run clockwise. */}
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={c} cy={c} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={thickness} />
        {segs.map(seg => {
          const len = (seg.count / total) * circ
          const offset = -acc
          acc += len
          const arc = (
            <circle
              cx={c} cy={c} r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={thickness}
              strokeDasharray={`${len} ${circ - len}`}
              strokeDashoffset={offset}
              className="transition-opacity duration-150"
              style={{ opacity: dim(seg.key), cursor: 'default' }}
              onMouseEnter={() => onHover?.(seg.key)}
              onMouseLeave={() => onHover?.(null)}
            />
          )
          return renderTip ? (
            <Tooltip key={seg.key}>
              <TooltipTrigger asChild>{arc}</TooltipTrigger>
              <TooltipContent side="top">{renderTip(seg)}</TooltipContent>
            </Tooltip>
          ) : <React.Fragment key={seg.key}>{arc}</React.Fragment>
        })}
      </svg>
      {(centerLabel != null || centerSub != null) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          {centerLabel != null && <span className="text-2xl font-bold leading-none text-foreground">{centerLabel}</span>}
          {centerSub != null && <span className="mt-0.5 text-xs text-muted-foreground">{centerSub}</span>}
        </div>
      )}
    </div>
  )
}
