import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { CalendarDays } from 'lucide-react'
import type { Granularity } from './granularity-tabs'

const LABELS: Record<Granularity, string> = {
  hour: 'รายชั่วโมง',
  day: 'รายวัน',
  week: 'รายสัปดาห์',
  month: 'รายเดือน',
  year: 'รายปี',
}

export function GranularitySelect({
  value, onChange,
}: {
  value: Granularity
  onChange: (g: Granularity) => void
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Granularity)}>
      <SelectTrigger className="h-8 w-36 gap-1.5 bg-muted hover:bg-muted-hover rounded-lg text-sm font-medium">
        <CalendarDays className="size-4 text-muted-foreground" />
        <SelectValue>{LABELS[value]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="hour">{LABELS.hour}</SelectItem>
        <SelectItem value="day">{LABELS.day}</SelectItem>
        <SelectItem value="week">{LABELS.week}</SelectItem>
        <SelectItem value="month">{LABELS.month}</SelectItem>
        <SelectItem value="year">{LABELS.year}</SelectItem>
      </SelectContent>
    </Select>
  )
}
