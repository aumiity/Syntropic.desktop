import { ZoomIn, ZoomOut } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ZoomControlProps {
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  className?: string
}

export function ZoomControl({ value, min, max, step, onChange, className }: ZoomControlProps) {
  // Round to 0.01 (not 0.1) so quarter steps (0.25) land exactly — e.g. 1.0→1.25
  // instead of drifting to 1.3. Backward-compatible with 0.5-step callers
  // (1.0/1.5/2.0 are unchanged).
  const roundZoom = (next: number) => Math.round(next * 100) / 100

  return (
    <div className={cn('inline-flex h-9 items-stretch overflow-hidden rounded-lg shadow-sm', className)}>
      <Button
        type="button"
        size="lg"
        variant="elevated"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, roundZoom(value - step)))}
        className="h-9 w-9 rounded-l-lg rounded-r-none border-r-0 px-0 shadow-none hover:shadow-none"
        title="ซูมออก"
      >
        <ZoomOut className="size-4" />
      </Button>
      <Button
        type="button"
        variant="elevated"
        size="lg"
        onClick={() => onChange(1)}
        className="h-9 w-14 rounded-none px-0 text-muted-foreground shadow-none hover:shadow-none"
        title="รีเซ็ตเป็นขนาดจริง (100%)"
      >
        {Math.round(value * 100)}%
      </Button>
      <Button
        type="button"
        size="lg"
        variant="elevated"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, roundZoom(value + step)))}
        className="h-9 w-9 rounded-l-none rounded-r-lg border-l-0 px-0 shadow-none hover:shadow-none"
        title="ซูมเข้า"
      >
        <ZoomIn className="size-4" />
      </Button>
    </div>
  )
}
