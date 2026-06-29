import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { formatCurrency } from '@/lib/utils'
import { Plus, CircleX, TriangleAlert } from 'lucide-react'
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
}: {
  cols: number
  rows: number
  cells: (TagCell | null)[]
  onAssignClick: (index: number) => void
  onRemove: (index: number) => void
}) {
  const total = cols * rows

  return (
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
              // min-w-0 = ปล่อยให้ grid track 1fr (=minmax(auto,1fr)) ไม่โตตามชื่อยาว
              // → ชื่อที่ overflow-x-clip ถูกตัด ปุ่มไม่ขยาย
              className="relative flex min-w-0 flex-col rounded-lg border border-border bg-card p-2 cursor-pointer hover:bg-surface-hover transition-colors"
              onClick={() => onAssignClick(i)}
            >
              {/* X (remove) floats top-right (absolute) and does NOT reserve
                  vertical space — content stays centered, never pushed down. The
                  no-barcode warning lives inline on the digits line below. */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRemove(i) }}
                className="absolute right-1 top-1 z-10 text-muted-foreground hover:text-destructive transition-colors"
                aria-label="ลบสินค้า"
              >
                <CircleX className="size-3.5" />
              </button>
              {/* 2 บรรทัด ซ้าย-ขวา: (1) ชื่อ · หน่วย  (2) เลขบาร์โค้ด · ราคา.
                  overflow-x-clip (ไม่ใช่ truncate) กันตัดวรรณยุกต์บนของไทย */}
              <div className="flex-1 min-h-0 flex flex-col justify-center gap-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 flex-1 text-sm font-semibold text-foreground overflow-x-clip overflow-y-visible whitespace-nowrap">{cell.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{cell.unit_name || '-'}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  {cell.barcode_source !== 'own' ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          onClick={(e) => e.stopPropagation()}
                          className="flex min-w-0 items-center gap-1 text-warning"
                          aria-label="คำเตือนบาร์โค้ด"
                        >
                          <TriangleAlert className="size-3.5 shrink-0" />
                          <span className="text-xs overflow-x-clip overflow-y-visible whitespace-nowrap">ไม่มีบาร์โค้ด</span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 text-sm" onClick={(e) => e.stopPropagation()}>
                        {FALLBACK_MSG[cell.barcode_source]}
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <span className="min-w-0 flex-1 text-xs text-muted-foreground overflow-x-clip overflow-y-visible whitespace-nowrap">{cell.barcode}</span>
                  )}
                  <span className="shrink-0 text-sm font-bold text-primary">{formatCurrency(cell.price)}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
  )
}

// Slice or pad a cell array to exactly `total` slots (preset change).
export function padCells(cells: (TagCell | null)[], total: number): (TagCell | null)[] {
  const next = cells.slice(0, total)
  while (next.length < total) next.push(null)
  return next
}
