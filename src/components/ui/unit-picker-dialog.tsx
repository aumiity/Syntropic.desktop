import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from './dialog'
import { Button } from './button'
import { Check } from 'lucide-react'
import { formatCurrency, cn } from '@/lib/utils'

// Shared "เลือกหน่วย" picker used by POS and Purchase.
// The base unit is the row whose `id === -1` (callers synthesize it on top of
// the non-base variants). It renders the "หลัก" badge instead of the per-base
// pricing block.
export interface UnitPickerOption {
  id: number
  unit_name?: string
  qty_per_base?: number
  price_retail?: number
}

interface UnitPickerDialogProps<T extends UnitPickerOption> {
  open: boolean
  onClose: () => void
  /** Product name shown under the title. */
  productName?: string
  /** Full unit list, base row (id=-1) first. */
  units: T[]
  /** Currently selected unit name — highlights the matching row. */
  activeUnitName?: string
  onSelect: (unit: T) => void
}

export function UnitPickerDialog<T extends UnitPickerOption>({
  open, onClose, productName, units, activeUnitName, onSelect,
}: UnitPickerDialogProps<T>) {
  const baseUnitName = units.find(u => u.id === -1)?.unit_name ?? ''
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      {open && (
        <DialogContent size="md" divided onClose={onClose}>
          <DialogHeader>
            <DialogTitle className="text-2xl">เลือกหน่วย</DialogTitle>
            <div className="text-base font-semibold text-foreground">{productName || '-'}</div>
          </DialogHeader>
          <DialogBody>
            <div className="grid gap-2.5 max-h-[28rem] overflow-y-auto scrollbar-thin p-0.5">
              {units.length === 0 ? (
                <div className="text-sm text-center text-foreground-subtle py-6">ไม่มีหน่วยให้เลือก</div>
              ) : units.map(u => {
                const active = activeUnitName === u.unit_name
                const isBase = u.id === -1
                const qpb = u.qty_per_base ?? 0
                const perBase = qpb > 0 ? (u.price_retail ?? 0) / qpb : 0
                return (
                  <Button key={u.id} variant="elevated"
                    onClick={() => onSelect(u)}
                    className={cn(
                      "w-full h-auto flex flex-col items-stretch justify-start gap-3 text-left p-4 rounded-xl border-2 transition-all",
                      active
                        ? "border-primary bg-primary-soft/50 hover:bg-primary-soft/50 shadow-card"
                        : "hover:border-border-strong",
                    )}>
                    {/* Header — unit name + base/packaging subtitle, selected check on the right */}
                    <div className="flex items-start gap-3 w-full">
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <span className="block text-xl font-bold text-foreground">{u.unit_name ?? '-'}</span>
                        <div className={cn("text-sm font-medium", isBase ? "text-warning-strong" : "text-primary")}>
                          {isBase ? 'หน่วยหลัก' : `บรรจุ ${qpb} ${baseUnitName}`}
                        </div>
                      </div>
                      {active && (
                        <span className="grid place-items-center size-7 rounded-full bg-primary text-primary-foreground shrink-0">
                          <Check className="size-4" strokeWidth={3} />
                        </span>
                      )}
                    </div>
                    {/* Metrics — selling price (+ per-base equivalent for variants) */}
                    <div className="w-full border-t border-border/60 pt-2.5 flex items-center justify-between text-sm font-normal">
                      <span className="text-muted-foreground">ราคาขาย</span>
                      <div className="flex items-baseline gap-2">
                        {!isBase && perBase > 0 && (
                          <span className="text-xs text-muted-foreground">({formatCurrency(perBase)} / {baseUnitName})</span>
                        )}
                        <span className="text-base font-semibold text-foreground">{formatCurrency(u.price_retail ?? 0)}</span>
                      </div>
                    </div>
                  </Button>
                )
              })}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button className="w-32 h-10 text-base" onClick={onClose}>ปิด</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}
