import { useState } from 'react'
import dayjs from 'dayjs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from './dialog'
import { Button } from './button'
import { Badge } from './badge'
import { Toggle } from './switch'
import { Check, ClockAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

// Shared "เลือกล็อต" picker. Rendered as a Dialog (NOT a Popover) on purpose:
// a Popover is portaled to document.body, so when opened from inside another
// Dialog the parent's scroll-lock (react-remove-scroll) blocks the lot list
// from scrolling. A Dialog body lives inside the allow-listed node and scrolls.
export interface LotPickerOption {
  id: number
  lot_number?: string | null
  expiry_date?: string | null
  qty_on_hand: number
  is_closed?: number
}

interface LotPickerDialogProps<T extends LotPickerOption> {
  open: boolean
  onClose: () => void
  /** Product name shown under the title. */
  productName?: string
  /** Lots to choose from. */
  lots: T[]
  /** Currently selected lot id — highlights the matching row. */
  activeLotId?: number
  /** Title/verb override (e.g. "เลือกล็อตที่จะคืนเข้า"). */
  title?: string
  onSelect: (lot: T) => void
}

// A lot is hidden by default once it's closed or sold out — the toggle reveals them.
const isDepleted = (lot: LotPickerOption) => lot.is_closed === 1 || lot.qty_on_hand <= 0

export function LotPickerDialog<T extends LotPickerOption>({
  open, onClose, productName, lots, activeLotId, title = 'เลือกล็อต', onSelect,
}: LotPickerDialogProps<T>) {
  const [showDepleted, setShowDepleted] = useState(false)
  // Always keep the active lot visible so the current selection never disappears.
  const visibleLots = lots.filter(l => showDepleted || !isDepleted(l) || l.id === activeLotId)
  const hiddenCount = lots.length - lots.filter(l => !isDepleted(l) || l.id === activeLotId).length
  // Nothing to reveal → keep the switch visible (predictable) but disabled.
  const anyDepleted = lots.some(isDepleted)

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      {open && (
        <DialogContent size="sm" divided onClose={onClose}>
          <DialogHeader>
            <DialogTitle className="text-2xl">{title}</DialogTitle>
            <div className="text-base font-semibold text-foreground">{productName || '-'}</div>
          </DialogHeader>
          <DialogBody>
            <Toggle
              framed
              disabled={!anyDepleted}
              className="w-full justify-between mb-2.5"
              label={`แสดงล็อตที่ปิด${!showDepleted && hiddenCount > 0 ? ` (${hiddenCount})` : ''}`}
              checked={showDepleted}
              onChange={setShowDepleted}
            />
            <div className="grid gap-2.5 max-h-[28rem] overflow-y-auto scrollbar-thin p-0.5">
              {visibleLots.length === 0 ? (
                <div className="text-sm text-center text-foreground-subtle py-6">ไม่มีล็อตให้เลือก</div>
              ) : visibleLots.map(lot => {
                const active = activeLotId === lot.id
                const depleted = isDepleted(lot)
                const expiry = lot.expiry_date ? dayjs(lot.expiry_date).format('DD/MM/YYYY') : '—'
                return (
                  <Button key={lot.id} variant="elevated"
                    onClick={() => onSelect(lot)}
                    className={cn(
                      "w-full h-auto flex flex-col items-stretch justify-start gap-2.5 text-left p-4 rounded-xl border-2 transition-all",
                      active
                        ? "border-primary bg-primary-soft/50 hover:bg-primary-soft/50 shadow-card"
                        : "hover:border-border-strong",
                      depleted && !active && "opacity-70",
                    )}>
                    {/* Header — lot number, selected check on the right */}
                    <div className="flex items-center gap-2 w-full">
                      <span className="flex-1 min-w-0 text-lg font-bold text-foreground truncate">
                        Lot {lot.lot_number || '—'}
                      </span>
                      {depleted && (
                        <Badge variant="neutral-outline" className="shrink-0">ปิด/หมด</Badge>
                      )}
                      {active && (
                        <span className="grid place-items-center size-7 rounded-full bg-primary text-primary-foreground shrink-0">
                          <Check className="size-4" strokeWidth={3} />
                        </span>
                      )}
                    </div>
                    {/* Meta — expiry + qty badge */}
                    <div className="w-full border-t border-border/60 pt-2.5 flex items-center justify-between gap-2 text-sm font-normal text-muted-foreground">
                      <span className="flex items-center gap-2 min-w-0">
                        <ClockAlert className="size-4 shrink-0" />
                        <span className="truncate">{expiry}</span>
                      </span>
                      <Badge variant={active ? 'default' : 'secondary'} className="shrink-0 text-sm">
                        คงเหลือ {lot.qty_on_hand}
                      </Badge>
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
