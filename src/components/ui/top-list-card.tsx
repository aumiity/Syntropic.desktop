import type { LucideIcon } from 'lucide-react'
import { Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface TopListCardItem {
  /** 1-based rank — renders a left-side rank badge when set. */
  rank?: number
  /** Primary label (left). */
  label: string
  /** Optional secondary line under the label (e.g. "x 120 ชิ้น"). */
  sub?: string
  /** Right-side value (already-formatted string like "฿1,234" or a number). */
  value: string | number
  /** Optional accent badge after the value (e.g. margin %, severity tag). */
  badge?: string
  /** Tailwind class for value color (e.g. "text-success", "text-destructive"). */
  valueClassName?: string
  /** Click handler — turns the row into a button (drill-down). */
  onClick?: () => void
}

interface TopListCardProps {
  items: TopListCardItem[]
  emptyIcon?: LucideIcon
  emptyText?: string
  /** Cap on inner scroll. Default 280px. Pass 0 to disable. */
  maxHeight?: number
  /** Override on the outer ul (rare — mostly for spacing tweaks). */
  className?: string
}

export function TopListCard({
  items,
  emptyIcon: EmptyIcon = Inbox,
  emptyText = 'ไม่มีข้อมูล',
  maxHeight = 280,
  className,
}: TopListCardProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-sm text-muted-foreground py-16">
        <EmptyIcon className="size-10 mb-2 opacity-30" />
        {emptyText}
      </div>
    )
  }

  const scrollStyle = maxHeight > 0 ? { maxHeight } : undefined

  return (
    <ul
      className={cn('divide-y divide-border overflow-y-auto scrollbar-thin', className)}
      style={scrollStyle}
    >
      {items.map((it, i) => {
        const body = (
          <div className="flex items-center gap-3 py-2 px-1">
            {it.rank != null && (
              <span className="shrink-0 size-7 rounded-lg bg-muted text-foreground-subtle text-sm font-semibold flex items-center justify-center">
                {it.rank}
              </span>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm text-foreground truncate">{it.label}</div>
              {it.sub && (
                <div className="text-xs text-muted-foreground truncate">{it.sub}</div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={cn('text-sm font-semibold text-foreground', it.valueClassName)}>
                {it.value}
              </span>
              {it.badge && (
                <span className="text-xs text-muted-foreground">{it.badge}</span>
              )}
            </div>
          </div>
        )
        return (
          <li key={i}>
            {it.onClick ? (
              <button
                type="button"
                onClick={it.onClick}
                className="w-full text-left hover:bg-primary-soft/60 transition-colors rounded-md"
              >
                {body}
              </button>
            ) : body}
          </li>
        )
      })}
    </ul>
  )
}
