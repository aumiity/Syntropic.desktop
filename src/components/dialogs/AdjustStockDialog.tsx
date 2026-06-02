import { useState, useEffect, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PriceInput } from '@/components/ui/price-input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { DateInput } from '@/components/ui/date-input'
import { useToast } from '@/components/ui/toast'
import { getCurrentUserId } from '@/stores/userStore'
import { formatCurrency } from '@/lib/utils'
import type { ProductLot } from '@/types'
import {
  ArrowUpCircle, ArrowDownCircle, Minus,
  Layers, FolderInput, Info,
} from 'lucide-react'

// 'สินค้าหมดอายุ' is intentionally NOT here — expired goods go through the
// dedicated หน้าสินค้าหมดอายุ flow, not this manual stock adjustment.
const QUICK_REASONS = [
  'ปรับยอดให้ตรงระบบ',
  'สินค้าเสียหาย',
  'สินค้าสูญหาย',
  'ของแถม',
]

// Operator types the *target* stock; system computes delta.
// Direction (decrease/increase) drives the rest of the form:
//   decrease → auto-FEFO across lots, preview shows which lots get hit
//   increase → operator picks new-lot or merge-into-existing-lot mode
export interface AdjustStockTarget {
  id: number
  trade_name: string
  stock_qty: number
  unit_name?: string | null
}

export function AdjustStockDialog({
  target, onClose, onSaved,
}: {
  target: AdjustStockTarget | null
  onClose: () => void
  onSaved?: () => void
}) {
  const { toast } = useToast()
  const open = !!target

  const [adjustTarget, setAdjustTarget] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [adjusting, setAdjusting] = useState(false)
  const [productLots, setProductLots] = useState<ProductLot[]>([])
  const [lotsLoading, setLotsLoading] = useState(false)
  const [increaseMode, setIncreaseMode] = useState<'new' | 'existing'>('new')
  const [newLotNumber, setNewLotNumber] = useState('')
  const [newLotExpiry, setNewLotExpiry] = useState('')
  const [newLotCost, setNewLotCost] = useState('0')
  const [targetLotId, setTargetLotId] = useState<number | null>(null)
  const [addedCost, setAddedCost] = useState('0')

  // Re-init form + load lots whenever a new target is opened.
  useEffect(() => {
    if (!target) return
    setAdjustTarget(String(target.stock_qty))
    setAdjustNote('')
    setIncreaseMode('new')
    setNewLotNumber('')
    setNewLotExpiry('')
    setNewLotCost('0')
    setTargetLotId(null)
    setAddedCost('0')
    setProductLots([])
    setLotsLoading(true)
    window.api.products.getLots(target.id).then((lots: any) => {
      const active = ((lots ?? []) as ProductLot[]).filter(l => !l.is_cancelled)
      setProductLots(active)
      // Default target lot for "merge into existing" mode = most recent open lot.
      const openLots = active.filter(l => !l.is_closed && l.qty_on_hand > 0)
      const defaultTarget = openLots.length > 0
        ? openLots[openLots.length - 1].id
        : active.length > 0 ? active[active.length - 1].id : null
      setTargetLotId(defaultTarget)
    }).finally(() => setLotsLoading(false))
  }, [target])

  // Prefill ต้นทุน/หน่วย with the selected lot's current cost when merging into an
  // existing lot — the operator usually adds stock at the same cost, then tweaks
  // only if it differs. Re-runs when the picked lot (or mode) changes.
  useEffect(() => {
    if (increaseMode !== 'existing' || !targetLotId) return
    const lot = productLots.find(l => l.id === targetLotId)
    if (lot) setAddedCost(String(lot.cost_price ?? 0))
  }, [targetLotId, increaseMode, productLots])

  // Compute delta = target − current. Returns null when target is empty / invalid.
  const adjustDelta = (() => {
    if (!target) return null
    const s = adjustTarget.trim()
    if (s === '') return null
    const n = parseFloat(s)
    if (Number.isNaN(n) || n < 0) return null
    return n - target.stock_qty
  })()

  // FEFO preview for decrease — which lots will be hit, in what order.
  // Mirrors backend ORDER BY: expiry_date ASC NULLS LAST, then id ASC.
  const fefoPreview = useMemo(() => {
    if (adjustDelta === null || adjustDelta >= 0) return [] as Array<{ lot: ProductLot; deduct: number; qtyAfter: number }>
    const need = Math.abs(adjustDelta)
    const open = productLots
      .filter(l => !l.is_closed && !l.is_cancelled && l.qty_on_hand > 0)
      .sort((a, b) => {
        const ae = a.expiry_date || '9999-99-99'
        const be = b.expiry_date || '9999-99-99'
        return ae.localeCompare(be) || a.id - b.id
      })
    let remaining = need
    const out: Array<{ lot: ProductLot; deduct: number; qtyAfter: number }> = []
    for (const lot of open) {
      if (remaining <= 0) break
      const deduct = Math.min(remaining, lot.qty_on_hand)
      out.push({ lot, deduct, qtyAfter: lot.qty_on_hand - deduct })
      remaining -= deduct
    }
    return out
  }, [productLots, adjustDelta])

  // For "merge into existing lot" mode — preview the new lot cost (weighted avg
  // within the lot). Same formula as the backend; lets the operator see the
  // impact before confirming.
  const mergedLotPreview = useMemo(() => {
    if (adjustDelta === null || adjustDelta <= 0 || increaseMode !== 'existing' || !targetLotId) return null
    const lot = productLots.find(l => l.id === targetLotId)
    if (!lot) return null
    const addedC = parseFloat(addedCost)
    if (Number.isNaN(addedC) || addedC < 0) return null
    const newQtyReceived = (lot.qty_received ?? 0) + adjustDelta
    const newCost = newQtyReceived > 0
      ? ((lot.qty_received ?? 0) * (lot.cost_price ?? 0) + adjustDelta * addedC) / newQtyReceived
      : addedC
    return { lot, newQtyReceived, newCost }
  }, [adjustDelta, increaseMode, targetLotId, addedCost, productLots])

  // Available lots for "merge into existing" picker — non-cancelled.
  // Closed lots are also offered (reopening is supported by the backend),
  // but closed/zero-stock lots sort to the bottom for clarity.
  const mergeCandidates = useMemo(() => {
    return productLots
      .filter(l => !l.is_cancelled)
      .sort((a, b) => {
        const aClosed = a.is_closed ? 1 : 0
        const bClosed = b.is_closed ? 1 : 0
        if (aClosed !== bClosed) return aClosed - bClosed
        return b.id - a.id
      })
  }, [productLots])

  const selectedTargetLot = useMemo(() => {
    if (!targetLotId) return null
    return productLots.find(l => l.id === targetLotId) ?? null
  }, [targetLotId, productLots])

  const openLotsSummary = useMemo(() => {
    return productLots
      .filter(l => !l.is_closed && l.qty_on_hand > 0)
      .sort((a, b) => {
        const ae = a.expiry_date || '9999-99-99'
        const be = b.expiry_date || '9999-99-99'
        return ae.localeCompare(be) || a.id - b.id
      })
  }, [productLots])

  // Current weighted-average cost across on-hand lots (matches products.cost_price
  // valuation basis) + the on-hand qty it's averaged over.
  const currentAvg = useMemo(() => {
    const lots = productLots.filter(l => !l.is_cancelled && l.qty_on_hand > 0)
    const qty = lots.reduce((s, l) => s + l.qty_on_hand, 0)
    if (qty <= 0) return null
    return { qty, avg: lots.reduce((s, l) => s + l.qty_on_hand * (l.cost_price ?? 0), 0) / qty }
  }, [productLots])

  // For "create new lot" mode — preview how the product-level weighted-average
  // cost moves once this new lot is added (old → new), mirroring mergedLotPreview.
  const newLotAvgPreview = useMemo(() => {
    if (adjustDelta === null || adjustDelta <= 0 || increaseMode !== 'new') return null
    const addedC = parseFloat(newLotCost)
    if (Number.isNaN(addedC) || addedC < 0) return null
    const curQty = currentAvg?.qty ?? 0
    const curAvg = currentAvg?.avg ?? 0
    const newQty = curQty + adjustDelta
    const newAvg = newQty > 0 ? (curQty * curAvg + adjustDelta * addedC) / newQty : addedC
    return { curAvg, newAvg, hasCurrent: currentAvg !== null }
  }, [adjustDelta, increaseMode, newLotCost, currentAvg])

  const handleAdjust = async () => {
    if (!target) return
    if (adjustDelta === null) { toast({ title: 'กรุณาระบุจำนวนที่ถูกต้อง', variant: 'error' }); return }
    if (adjustDelta === 0) { toast({ title: 'จำนวนไม่เปลี่ยนแปลง', variant: 'error' }); return }
    if (!adjustNote.trim()) { toast({ title: 'กรุณาระบุหมายเหตุ', variant: 'error' }); return }

    const qty = Math.abs(adjustDelta)
    const payload: any = {
      qty,
      note: adjustNote.trim(),
      userId: getCurrentUserId(),
    }

    if (adjustDelta < 0) {
      const totalAvail = openLotsSummary.reduce((s, l) => s + l.qty_on_hand, 0)
      if (qty > totalAvail) {
        toast({ title: `จำนวนที่ลด (${qty}) มากกว่าสต็อกที่มี (${totalAvail})`, variant: 'error' })
        return
      }
      payload.mode = 'decrease'
    } else if (increaseMode === 'new') {
      const cost = parseFloat(newLotCost)
      if (newLotCost.trim() === '' || Number.isNaN(cost) || cost < 0) {
        toast({ title: 'ต้นทุน/หน่วยไม่ถูกต้อง', variant: 'error' })
        return
      }
      payload.mode = 'increase_new_lot'
      if (newLotNumber.trim()) payload.lot_number = newLotNumber.trim()
      payload.expiry_date = newLotExpiry || null
      payload.cost_price = cost
    } else {
      if (!targetLotId) { toast({ title: 'กรุณาเลือกล็อตปลายทาง', variant: 'error' }); return }
      const cost = parseFloat(addedCost)
      if (addedCost.trim() === '' || Number.isNaN(cost) || cost < 0) {
        toast({ title: 'ต้นทุน/หน่วยที่เพิ่มไม่ถูกต้อง', variant: 'error' })
        return
      }
      payload.mode = 'increase_existing_lot'
      payload.target_lot_id = targetLotId
      payload.added_cost_price = cost
    }

    setAdjusting(true)
    try {
      await window.api.products.adjustStock(target.id, payload)
      toast({ title: 'ปรับสต็อกสำเร็จ', variant: 'success' })
      onClose()
      onSaved?.()
    } catch (e: any) {
      toast({ title: 'ปรับสต็อกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally {
      setAdjusting(false)
    }
  }

  const formatExp = (iso?: string | null) => {
    if (!iso) return 'ไม่ระบุวันหมดอายุ'
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent
        size="xl"
        divided
        onClose={onClose}
        className="h-[660px] grid-rows-[auto_1fr_auto]"
      >
        <DialogHeader>
          <DialogTitle className="text-xl">ปรับสต็อก</DialogTitle>
          {target && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground truncate max-w-[60%]">{target.trade_name}</span>
            </div>
          )}
        </DialogHeader>
        <DialogBody className="flex flex-col overflow-y-auto min-h-0 scrollbar-thin">
          <div className="space-y-3">

            <div>
              <label className="block text-base font-medium mb-1">
                จำนวนสต็อกหลังปรับ <span className="text-destructive">*</span>
              </label>
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex flex-1 basis-0 items-center justify-center gap-1.5 rounded-lg border px-3 h-10 text-base font-semibold ${
                    adjustDelta === null
                      ? 'bg-card text-muted-foreground/60 border-border'
                      : adjustDelta > 0
                        ? 'bg-success-soft text-success border-success/30'
                        : adjustDelta < 0
                          ? 'bg-destructive-soft text-destructive border-destructive/30'
                          : 'bg-card text-muted-foreground border-border'
                  }`}
                >
                  {adjustDelta === null
                    ? '—'
                    : adjustDelta > 0
                      ? <><ArrowUpCircle className="size-4" /> +{adjustDelta.toLocaleString()}</>
                      : adjustDelta < 0
                        ? <><ArrowDownCircle className="size-4" /> {adjustDelta.toLocaleString()}</>
                        : <><Minus className="size-4" /> ไม่เปลี่ยน</>}
                </span>
                <Input
                  variant="elevated"
                  type="number"
                  value={adjustTarget}
                  onChange={e => setAdjustTarget(e.target.value)}
                  placeholder="0"
                  min={0}
                  className="h-10 rounded-lg text-lg font-semibold flex-1 basis-0 text-right"
                  autoFocus
                />
              </div>
            </div>

            {/* DECREASE — FEFO preview */}
            {adjustDelta !== null && adjustDelta < 0 && (
              <div className="rounded-card border border-destructive/30 bg-destructive-soft p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
                  <Info className="size-4" />
                  ระบบจะหักด้วย FEFO (ล็อตใกล้หมดอายุก่อน)
                </div>
                {fefoPreview.length > 0 ? (
                  <div className="space-y-1.5">
                    {fefoPreview.map(({ lot, deduct, qtyAfter }, i) => (
                      <div key={lot.id} className="flex items-center justify-between text-sm bg-destructive-soft rounded-lg px-3 py-2">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-destructive/15 text-xs font-bold text-destructive">{i + 1}</span>
                          <span className="font-semibold text-foreground truncate">{lot.lot_number}</span>
                          <span className="text-muted-foreground shrink-0">exp {formatExp(lot.expiry_date)}</span>
                        </span>
                        <span className="flex items-center gap-4 shrink-0">
                          <span>
                            <span className="text-muted-foreground">เดิม</span>{' '}
                            <span className="font-semibold text-foreground">{lot.qty_on_hand.toLocaleString()}</span>
                          </span>
                          <span className="text-destructive">
                            <span className="opacity-70">ลด</span>{' '}
                            <span className="font-bold">−{deduct.toLocaleString()}</span>
                          </span>
                          <span>
                            <span className="text-muted-foreground">คงเหลือ</span>{' '}
                            <span className="font-semibold text-foreground">{qtyAfter.toLocaleString()}</span>
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">ไม่มีล็อตที่จะหัก — ตรวจสอบจำนวนอีกครั้ง</div>
                )}
              </div>
            )}

            {/* INCREASE — mode picker + form */}
            {adjustDelta !== null && adjustDelta > 0 && (
              <div className="space-y-3">
                <div>
                  <label className="block text-base font-medium mb-2">ตัวเลือก</label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={increaseMode === 'new' ? 'success' : 'elevated'}
                      onClick={() => setIncreaseMode('new')}
                      className="h-10"
                    >
                      <Layers className="size-4" /> สร้างล็อตใหม่
                    </Button>
                    <Button
                      type="button"
                      variant={increaseMode === 'existing' ? 'success' : 'elevated'}
                      onClick={() => setIncreaseMode('existing')}
                      disabled={mergeCandidates.length === 0}
                      className="h-10"
                    >
                      <FolderInput className="size-4" /> เพิ่มเข้าล็อตเดิม
                    </Button>
                  </div>
                </div>

                {increaseMode === 'new' && (
                  <div className="rounded-card border border-success/30 bg-success-soft/30 p-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium mb-1 text-muted-foreground">หมายเลขล็อต</label>
                        <Input
                          variant="elevated"
                          value={newLotNumber}
                          onChange={e => setNewLotNumber(e.target.value)}
                          placeholder="ปล่อยว่างเพื่อ auto"
                          className="h-10 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1 text-muted-foreground">วันหมดอายุ</label>
                        <DateInput variant="elevated" className="h-10 w-full" value={newLotExpiry} onChange={setNewLotExpiry} placeholder="dd/mm/yyyy" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="flex items-center gap-1 text-sm font-medium mb-1 text-muted-foreground h-5">
                          <span>ต้นทุน/หน่วย</span>
                          <span className="text-destructive">*</span>
                          <span className="opacity-70">(ฟรี = 0)</span>
                        </label>
                        <PriceInput
                          variant="elevated"
                          value={newLotCost}
                          onChange={setNewLotCost}
                          className="h-10 rounded-lg text-sm text-left"
                        />
                      </div>
                      <div>
                        <label className="flex items-center gap-1.5 text-sm font-medium mb-1 text-muted-foreground h-5">
                          <Info className="size-3.5" />
                          <span>ต้นทุนเฉลี่ยใหม่</span>
                        </label>
                        <div className="h-10 px-3 flex items-center bg-card border border-border rounded-lg text-sm">
                          {newLotAvgPreview ? (
                            <span>
                              {newLotAvgPreview.hasCurrent && (
                                <><span className="text-muted-foreground">{formatCurrency(newLotAvgPreview.curAvg)}</span>{' → '}</>
                              )}
                              <span className="font-semibold text-foreground">{formatCurrency(newLotAvgPreview.newAvg)}</span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground/60">—</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {increaseMode === 'existing' && (
                  <div className="rounded-card border border-success/30 bg-success-soft/30 p-3 space-y-3">
                    {/* Lot picker — dropdown shows only lot_number; details live beside */}
                    <div className="grid grid-cols-2 gap-3 items-stretch">
                      <div>
                        <label className="block text-sm font-medium mb-1 text-muted-foreground">
                          เลือกล็อต <span className="text-destructive">*</span>
                        </label>
                        <Select
                          value={targetLotId ? String(targetLotId) : ''}
                          onValueChange={v => setTargetLotId(Number(v))}
                        >
                          <SelectTrigger variant="elevated" className="h-10 w-full rounded-lg text-sm">
                            <SelectValue placeholder="-- เลือกล็อต --" />
                          </SelectTrigger>
                          <SelectContent>
                            {mergeCandidates.map(l => (
                              <SelectItem key={l.id} value={String(l.id)}>
                                {l.lot_number}{l.is_closed ? ' (ปิด)' : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="min-h-10 px-3 py-1.5 flex flex-col justify-center gap-0.5 bg-card border border-border rounded-lg text-sm text-muted-foreground">
                        {selectedTargetLot ? (
                          <>
                            <div><span className="font-medium">หมดอายุ :</span> {formatExp(selectedTargetLot.expiry_date)}</div>
                            <div className="flex flex-wrap gap-x-4">
                              <span><span className="font-medium">คงเหลือ :</span> {selectedTargetLot.qty_on_hand.toLocaleString()}</span>
                              <span><span className="font-medium">ต้นทุน :</span> {formatCurrency(selectedTargetLot.cost_price)}</span>
                            </div>
                          </>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </div>
                    </div>

                    {/* Cost input + new-avg preview on the same row */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="flex items-center gap-1 text-sm font-medium mb-1 text-muted-foreground h-5">
                          <span>ต้นทุน/หน่วย</span>
                          <span className="text-destructive">*</span>
                          <span className="opacity-70">(ฟรี = 0)</span>
                        </label>
                        <PriceInput
                          variant="elevated"
                          value={addedCost}
                          onChange={setAddedCost}
                          className="h-10 rounded-lg text-sm text-left"
                        />
                      </div>
                      <div>
                        <label className="flex items-center gap-1.5 text-sm font-medium mb-1 text-muted-foreground h-5">
                          <Info className="size-3.5" />
                          <span>ต้นทุนเฉลี่ยใหม่</span>
                        </label>
                        <div className="h-10 px-3 flex items-center bg-card border border-border rounded-lg text-sm">
                          {mergedLotPreview ? (
                            <span>
                              <span className="text-muted-foreground">{formatCurrency(mergedLotPreview.lot.cost_price)}</span>
                              {' → '}
                              <span className="font-semibold text-foreground">{formatCurrency(mergedLotPreview.newCost)}</span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground/60">—</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Note section — pinned to the bottom (mt-auto) so its position stays
              put across modes. Dialog height is fixed; shorter modes show the gap
              above the note, taller content scrolls within the body. */}
          <div className="mt-auto pt-3">
            <label className="block text-base font-medium mb-2">หมายเหตุ <span className="text-destructive">*</span></label>
            <div className="flex flex-wrap gap-2 mb-2">
              {QUICK_REASONS.map(r => (
                <Button
                  key={r}
                  type="button"
                  size="lg"
                  variant={adjustNote === r ? 'info-soft' : 'elevated'}
                  onClick={() => setAdjustNote(r)}
                >
                  {r}
                </Button>
              ))}
            </div>
            <Input
              variant="elevated"
              value={adjustNote}
              onChange={e => setAdjustNote(e.target.value)}
              placeholder="เหตุผลการปรับสต็อก หรือเลือกจากปุ่มด้านบน"
              className="h-10 rounded-lg"
              onKeyDown={e => { if (e.key === 'Enter') handleAdjust() }}
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="elevated" size="xl" onClick={onClose}>ยกเลิก</Button>
          <Button
            onClick={handleAdjust}
            disabled={adjusting || adjustDelta === null || adjustDelta === 0 || lotsLoading}
            variant={adjustDelta !== null && adjustDelta < 0 ? 'destructive' : 'success'}
            size="xl"
          >
            {adjusting ? 'กำลังบันทึก...' : 'ยืนยัน'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
