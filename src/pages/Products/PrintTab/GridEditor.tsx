import { Button } from '@/components/ui/button'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { formatCurrency } from '@/lib/utils'
import { Plus, X, TriangleAlert, ClipboardPaste, RefreshCcw } from 'lucide-react'
import type { TagCell } from '@/lib/tags/types'

const FALLBACK_MSG: Record<Exclude<TagCell['barcode_source'], 'own'>, string> = {
  none: 'หน่วยนี้ไม่มีบาร์โค้ดของตัวเอง — สติ๊กเกอร์จะพิมพ์เฉพาะชื่อและราคา (ไม่มีบาร์โค้ด)',
}

// Grid of cells shared by both print modes. cols×rows comes from the resolved
// preset; each cell either holds a TagCell or is an empty slot. Clicking a cell
// opens the search to assign/replace; the X removes it.
export function GridEditor({
  cols,
  rows,
  cells,
  onAssignClick,
  onRemove,
  onCopyFirst,
  onClearAll,
}: {
  cols: number
  rows: number
  cells: (TagCell | null)[]
  onAssignClick: (index: number) => void
  onRemove: (index: number) => void
  onCopyFirst: () => void
  onClearAll: () => void
}) {
  const total = cols * rows
  const hasAny = cells.some((c) => c != null)
  const firstFilled = cells[0] != null

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="primary-soft" size="lg" className="h-9" disabled={!firstFilled} onClick={onCopyFirst}>
          <ClipboardPaste className="size-4" /> วางทั้งหมด
        </Button>
        <Button variant="outline" size="lg" className="h-9" disabled={!hasAny} onClick={onClearAll}>
          <RefreshCcw className="size-4" /> ล้างทั้งหมด
        </Button>
      </div>

      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, minmax(72px, 1fr))` }}
      >
        {Array.from({ length: total }, (_, i) => {
          const cell = cells[i] ?? null
          if (!cell) {
            return (
              <button
                key={i}
                type="button"
                onClick={() => onAssignClick(i)}
                className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border-strong bg-card text-muted-foreground hover:bg-surface-hover transition-colors p-2"
              >
                <Plus className="size-5" />
                <span className="text-xs">เลือกสินค้า</span>
              </button>
            )
          }
          return (
            <div
              key={i}
              className="relative flex flex-col rounded-lg border border-border bg-card p-2 cursor-pointer hover:bg-surface-hover transition-colors"
              onClick={() => onAssignClick(i)}
            >
              {cell.barcode_source !== 'own' && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      className="absolute left-1.5 top-1.5 z-10 text-warning"
                      aria-label="คำเตือนบาร์โค้ด"
                    >
                      <TriangleAlert className="size-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 text-sm" onClick={(e) => e.stopPropagation()}>
                    {FALLBACK_MSG[cell.barcode_source]}
                  </PopoverContent>
                </Popover>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRemove(i) }}
                className="absolute right-1.5 top-1.5 z-10 text-muted-foreground hover:text-destructive transition-colors"
                aria-label="ลบสินค้า"
              >
                <X className="size-4" />
              </button>
              <div className="flex-1 min-h-0 flex flex-col justify-center pt-4">
                <div className="text-sm font-semibold text-foreground overflow-x-clip overflow-y-visible line-clamp-2">{cell.name}</div>
                <div className="text-xs text-muted-foreground">{cell.unit_name || '-'}</div>
                <div className="text-sm font-bold text-primary">{formatCurrency(cell.price)}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Slice or pad a cell array to exactly `total` slots (preset change).
export function padCells(cells: (TagCell | null)[], total: number): (TagCell | null)[] {
  const next = cells.slice(0, total)
  while (next.length < total) next.push(null)
  return next
}
