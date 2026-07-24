import { Button } from '@/components/ui/button'
import { Popover, PopoverTrigger, PopoverContent, PopoverHeader, PopoverTitle } from '@/components/ui/popover'
import { Filter, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

// Canonical "กรองสถานะ" control for table-card bars. One elevated icon button
// (h-8 w-8) that opens a single-select popover: ทั้งหมด / ใช้งาน / ปิดใช้งาน.
// Default selection is always 'all' (show everything) — callers map the chosen
// value onto their own data/query. Reference behaviour: Products/ProductsList.
export type StatusFilterValue = 'all' | 'enabled' | 'disabled'

const DEFAULT_OPTIONS: { value: StatusFilterValue; label: string }[] = [
  { value: 'all',      label: 'ทั้งหมด' },
  { value: 'enabled',  label: 'ใช้งาน' },
  { value: 'disabled', label: 'ปิดใช้งาน' },
]

export function StatusFilterButton<T extends string = StatusFilterValue>({
  value,
  onChange,
  options = DEFAULT_OPTIONS as { value: T; label: string }[],
  title = 'สถานะ',
  className,
}: {
  value: T
  onChange: (v: T) => void
  options?: { value: T; label: string }[]
  /** Popover header label. */
  title?: string
  /** Extra classes for the trigger button. */
  className?: string
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="lg" variant="elevated" className={cn('h-9 w-9 p-0 shrink-0', className)} title="ตัวกรอง">
          <Filter className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1 gap-0">
        <PopoverHeader className="px-2">
          <PopoverTitle>{title}</PopoverTitle>
        </PopoverHeader>
        {options.map(o => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors',
              value === o.value ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted',
            )}
          >
            <Check className={cn('size-4', value === o.value ? 'opacity-100' : 'opacity-0')} />
            <span className="flex-1 text-left">{o.label}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
