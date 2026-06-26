import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

export type Granularity = 'hour' | 'day' | 'week' | 'month' | 'year'

const LABELS: Record<Granularity, string> = {
  hour: 'ชั่วโมง',
  day: 'วัน',
  week: 'สัปดาห์',
  month: 'เดือน',
  year: 'ปี',
}

const ORDER: Granularity[] = ['hour', 'day', 'week', 'month', 'year']

export function GranularityTabs({
  value, onChange, options = ORDER,
}: {
  value: Granularity
  onChange: (g: Granularity) => void
  /** Subset of granularities to show (in order). Defaults to all five. */
  options?: Granularity[]
}) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as Granularity)}>
      <TabsList variant="segmented">
        {options.map(g => (
          <TabsTrigger key={g} value={g} className="text-sm px-3">{LABELS[g]}</TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
