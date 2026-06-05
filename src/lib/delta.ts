import { TrendingUp, TrendingDown } from 'lucide-react'
import type React from 'react'

export interface DeltaResult {
  /** Display string for MetricCard.sub — e.g. "12.3%" or "ใหม่ในช่วงนี้". No glyphs. */
  sub: string
  /** Tailwind color class for the sub line — pass to MetricCard.subClassName. */
  cls: string
  /** Icon for MetricCard.subIcon. `null` when there is no direction (e.g. "new in period"). */
  icon: React.ComponentType<{ className?: string }> | null
}

// Convention: TrendingUp + success when curr ≥ prev, TrendingDown + destructive
// when curr < prev. Pass `invert: true` for cost-style metrics where lower is
// better (e.g. expenses) — the arrow still tracks real direction, only the
// color flips so a rise reads red and a drop reads green.
export function delta(
  curr: number,
  prev: number | undefined | null,
  opts?: { invert?: boolean },
): DeltaResult | null {
  if (prev == null) return null
  if (prev === 0 && curr === 0) return null
  if (prev === 0) return { sub: 'ใหม่ในช่วงนี้', cls: opts?.invert ? 'text-destructive' : 'text-success', icon: null }
  const pct = ((curr - prev) / Math.abs(prev)) * 100
  const up = pct >= 0
  const good = opts?.invert ? !up : up
  return {
    sub: `${Math.abs(pct).toFixed(1)}%`,
    cls: good ? 'text-success' : 'text-destructive',
    icon: up ? TrendingUp : TrendingDown,
  }
}
