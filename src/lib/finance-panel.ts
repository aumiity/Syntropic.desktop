// Shared pure helpers for the Manage finance overview panels (Sales + Purchases).
// Extracted so both pages compute the trend line, comparison label, previous
// window, and chart granularity identically. No component state, no JSX — just
// date math + delta-to-MetricStrip-field mapping.
import type React from 'react'
import { TrendingUp } from 'lucide-react'
import { type MultiDateMode } from '@/components/ui/multi-date-picker'
import { type Granularity } from '@/components/ui/charts/granularity-tabs'
import { delta } from '@/lib/delta'
import dayjs from 'dayjs'

// Turn delta()'s magnitude + direction into the MetricStrip trend fields: a
// signed string + color + the trailing up/down icon. null delta → no trend line.
export function trendOf(d: ReturnType<typeof delta>): { delta?: string; deltaClassName?: string; deltaIcon?: React.ComponentType<{ className?: string }> } {
  if (!d) return {}
  const sign = d.icon === TrendingUp ? '+' : d.icon ? '-' : ''
  return { delta: `${sign}${d.sub}`, deltaClassName: d.cls, deltaIcon: d.icon ?? undefined }
}

// Comparison window + label adapt to the date-picker mode: day → yesterday,
// month → same dates last calendar month, year → last year, custom → the
// equal-length window before the range (backend default, no explicit prev).
export function compareLabelForMode(mode: MultiDateMode): string {
  switch (mode) {
    case 'day': return 'vs เมื่อวาน'
    case 'month': return 'vs เดือนก่อน'
    case 'year': return 'vs ปีก่อน'
    default: return 'vs ช่วงก่อน'
  }
}
export function prevWindowForMode(mode: MultiDateMode, from: string, to: string): { prev_from?: string; prev_to?: string } {
  const f = dayjs(from), t = dayjs(to)
  const fmt = (x: dayjs.Dayjs) => x.format('YYYY-MM-DD')
  switch (mode) {
    case 'day': return { prev_from: fmt(f.subtract(1, 'day')), prev_to: fmt(f.subtract(1, 'day')) }
    case 'month': return { prev_from: fmt(f.subtract(1, 'month')), prev_to: fmt(t.subtract(1, 'month')) }
    case 'year': return { prev_from: fmt(f.subtract(1, 'year')), prev_to: fmt(t.subtract(1, 'year')) }
    default: return {} // custom → backend equal-length window
  }
}

// Bucket granularity for the chart, derived from the page's date mode — always a
// unit SMALLER than the selected period so the period shows multiple bars (day →
// hours, month → days, year → months). The chart uses the page's own date range.
export function granularityForMode(mode: MultiDateMode): Granularity {
  switch (mode) {
    case 'day': return 'hour'
    case 'month': return 'day'
    case 'year': return 'month'
    default: return 'day'
  }
}
