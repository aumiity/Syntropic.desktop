import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from './dialog'
import { Button } from './button'
import { Badge } from './badge'
import { formatCurrency } from '@/lib/utils'

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
        <DialogContent size="sm" onClose={onClose}>
          <DialogHeader>
            <DialogTitle className="text-2xl">เลือกหน่วย</DialogTitle>
            <div className="text-base font-semibold text-foreground">{productName || '-'}</div>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-1.5 max-h-80 overflow-y-auto scrollbar-thin">
              {units.length === 0 ? (
                <div className="text-sm text-center text-foreground-subtle py-6">ไม่มีหน่วยให้เลือก</div>
              ) : units.map(u => {
                const active = activeUnitName === u.unit_name
                const isBase = u.id === -1
                const qpb = u.qty_per_base ?? 0
                const perBase = qpb > 0 ? (u.price_retail ?? 0) / qpb : 0
                return (
                  <Button key={u.id} variant="warm"
                    onClick={() => onSelect(u)}
                    className={`w-full min-h-16 h-auto px-5 py-4 rounded-xl transition-colors ${active ? 'font-bold border-warm-foreground border-2' : ''}`}>
                    <div className="flex items-center w-full gap-3">
                      <span className="flex-1 text-left text-2xl">{u.unit_name ?? ''}</span>
                      {isBase ? (
                        <Badge variant="tertiary" className="rounded-lg">หลัก</Badge>
                      ) : (
                        <div className="flex flex-col items-end gap-1 text-sm font-normal leading-normal">
                          <span>บรรจุ {qpb} {baseUnitName}</span>
                          {(u.price_retail ?? 0) > 0 && (
                            <span className="text-muted-foreground">คิดเป็น {formatCurrency(perBase)} / {baseUnitName}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </Button>
                )
              })}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="tertiary" className="w-32 h-10 text-base" onClick={onClose}>ปิด</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}
