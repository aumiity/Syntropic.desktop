import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from './dialog'
import { Button } from './button'
import { Input } from './input'
import { Label } from './label'
import { Minus, Plus } from 'lucide-react'
import { motion } from 'framer-motion'
import { formatCurrency } from '@/lib/utils'

interface QtyDialogProps {
  open: boolean
  onClose: () => void
  /** Item name shown under the title. */
  itemName?: string
  /** Unit label (shown beside qty + in the stepper label). */
  unitName?: string
  /** Seeds the input each time the dialog opens. */
  initialQty: number
  /** For the running "รวม" strip — line total = unitPrice*qty - discount. */
  unitPrice?: number
  discount?: number
  /** For the "คงเหลือ" strip. Omit to hide the whole summary strip. */
  stockQty?: number
  onApply: (qty: number) => void
  /** Quick-pick chips under the stepper. Pass `[]` to hide the row entirely. */
  presets?: number[]
  minQty?: number
  /** Confirm button label (default "ตกลง" — e.g. "พิมพ์" for a print count). */
  applyLabel?: string
}

/**
 * Shared quantity stepper dialog, extracted from the POS cart qty modal. Owns
 * its own input state (seeded from `initialQty` on open); the consumer reacts
 * via `onApply(qty)`. Used by POS and the return dialog.
 */
export function QtyDialog({
  open, onClose, itemName, unitName, initialQty,
  unitPrice, discount = 0, stockQty,
  onApply, presets = [1, 5, 10, 20, 50], minQty = 1, applyLabel = 'ตกลง',
}: QtyDialogProps) {
  const [qtyInput, setQtyInput] = useState(String(initialQty))

  // Re-seed the field every time the dialog opens.
  useEffect(() => {
    if (open) setQtyInput(String(initialQty))
  }, [open, initialQty])

  const q = Math.max(minQty, parseFloat(qtyInput) || 0)
  const lineTotal = Math.max(0, (unitPrice ?? 0) * q - discount)
  const bump = (delta: number) => setQtyInput(v => String(Math.max(minQty, (parseFloat(v) || 0) + delta)))
  const apply = () => { onApply(q); onClose() }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      {open && (
        <DialogContent size="sm" divided onClose={onClose}>
          <DialogHeader>
            <DialogTitle className="text-2xl">จำนวน</DialogTitle>
            <div className="text-base font-semibold text-foreground overflow-x-clip overflow-y-visible">{itemName}</div>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {/* Summary strip — each half is independent: คงเหลือ shows only when
                stockQty is supplied, รวม only when unitPrice is. Omit both to hide
                the strip entirely. */}
            {(stockQty !== undefined || unitPrice !== undefined) && (
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2.5">
                {stockQty !== undefined && (
                  <div className="flex flex-col">
                    <span className="text-xs text-foreground-subtle">คงเหลือ</span>
                    <span className={`text-sm font-semibold ${(stockQty ?? 0) > 0 ? 'text-foreground' : 'text-destructive'}`}>
                      {stockQty} {unitName}
                    </span>
                  </div>
                )}
                {unitPrice !== undefined && (
                  <div className="flex flex-col items-end ml-auto">
                    <span className="text-xs text-foreground-subtle">รวม</span>
                    <span className="text-base font-semibold text-foreground">{formatCurrency(lineTotal)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Stepper */}
            <div className="space-y-1.5">
              <Label>จำนวน ({unitName})</Label>
              <div className="flex items-center gap-2">
                <Button variant="elevated" size="icon-xl" onClick={() => bump(-1)} className="shrink-0">
                  <Minus className="size-5" />
                </Button>
                <Input
                  type="number"
                  autoFocus
                  value={qtyInput}
                  min={minQty}
                  style={{ MozAppearance: 'textfield' }}
                  onFocus={e => e.currentTarget.select()}
                  onChange={e => setQtyInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') apply() }}
                  placeholder={String(minQty)}
                  className="h-11 flex-1 text-center text-3xl font-bold"
                />
                <Button variant="elevated" size="icon-xl" onClick={() => bump(1)} className="shrink-0">
                  <Plus className="size-5" />
                </Button>
              </div>
            </div>

            {/* Quick presets — segmented track with a sliding pill (shared-layout).
                Hidden entirely when no presets are supplied. */}
            {presets.length > 0 && (
            <div className="grid grid-cols-5 gap-1 rounded-lg bg-muted p-1">
              {presets.map(n => {
                const active = (parseFloat(qtyInput) || 0) === n
                return (
                  <Button key={n} variant="ghost" size="sm"
                    onClick={() => setQtyInput(String(n))}
                    className={`relative w-full h-9 text-sm font-semibold hover:bg-transparent active:scale-100 active:translate-y-0 ${active ? 'hover:text-primary-foreground text-primary-foreground' : 'text-foreground'}`}>
                    {active && (
                      <motion.div layoutId="qty-preset-pill" aria-hidden
                        className="absolute inset-0 rounded-md bg-primary shadow-sm"
                        transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }} />
                    )}
                    <span className="relative z-10">{n}</span>
                  </Button>
                )
              })}
            </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="elevated" size="xl" onClick={onClose}>ยกเลิก</Button>
            <Button size="xl" onClick={apply}>{applyLabel}</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}
