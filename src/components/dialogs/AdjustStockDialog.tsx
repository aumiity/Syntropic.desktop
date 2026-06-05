import { useState, useEffect, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PriceInput } from '@/components/ui/price-input'
import { DateInput } from '@/components/ui/date-input'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, SortableTableHead } from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
import { getCurrentUserId } from '@/stores/userStore'
import { formatCurrency, cn } from '@/lib/utils'
import type { ProductLot } from '@/types'
import {
  ArrowUpCircle, ArrowDownCircle, Minus,
  Info, Check,
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
  // Last paid cost (products.last_cost_price) — prefills the new-lot cost field.
  last_cost_price?: number | null
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
  const [lotQuery, setLotQuery] = useState('')
  const [newLotExpiry, setNewLotExpiry] = useState('')
  const [costInput, setCostInput] = useState('0')
  const [lotSort, setLotSort] = useState<{ by: 'lot_number' | 'expiry_date' | 'qty_on_hand'; dir: 'asc' | 'desc' }>({ by: 'expiry_date', dir: 'asc' })

  // Re-init form + load lots whenever a new target is opened.
  useEffect(() => {
    if (!target) return
    setAdjustTarget(String(target.stock_qty))
    setAdjustNote('')
    setLotQuery('')
    setNewLotExpiry('')
    // Prefill cost with the last paid cost (the new-lot default). Switches to the
    // matched lot's cost once the operator picks an existing lot (effect below).
    setCostInput(String(target.last_cost_price ?? 0))
    setProductLots([])
    setLotsLoading(true)
    window.api.products.getLots(target.id).then((lots: any) => {
      const active = ((lots ?? []) as ProductLot[]).filter(l => !l.is_cancelled)
      setProductLots(active)
    }).finally(() => setLotsLoading(false))
    // Key on target.id (NOT the whole object): callers pass a fresh inline object
    // literal each render, so depending on `target` would re-init the form on every
    // re-render — including the re-render a toast triggers. That wiped the operator's
    // input whenever validation/backend errored (dup lot no., missing note, …).
    // Re-init only when a genuinely different product is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.id])

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

  // The lot-number box is the single source of truth for the increase target:
  //   - exact match to an existing lot → merge into it (existing mode)
  //   - anything else / blank          → create a new lot (new mode)
  // Selection is DERIVED from the text, never stored, so editing the text instantly
  // drops a stale selection — no "stuck" existing lot.
  const matchedLot = useMemo(() => {
    const q = lotQuery.trim().toLowerCase()
    if (!q) return null
    return mergeCandidates.find(l => l.lot_number.trim().toLowerCase() === q) ?? null
  }, [lotQuery, mergeCandidates])

  // Lots shown in the picker table, filtered by the typed lot number then sorted
  // by the clicked column header. Missing expiry dates sort to the end (far-future).
  const filteredLots = useMemo(() => {
    const q = lotQuery.trim().toLowerCase()
    const base = q ? mergeCandidates.filter(l => l.lot_number.toLowerCase().includes(q)) : mergeCandidates
    const dir = lotSort.dir === 'asc' ? 1 : -1
    return [...base].sort((a, b) => {
      if (lotSort.by === 'lot_number') return a.lot_number.localeCompare(b.lot_number) * dir
      if (lotSort.by === 'qty_on_hand') return (a.qty_on_hand - b.qty_on_hand) * dir
      const ae = a.expiry_date || '9999-99-99'
      const be = b.expiry_date || '9999-99-99'
      return ae.localeCompare(be) * dir
    })
  }, [lotQuery, mergeCandidates, lotSort])

  const toggleLotSort = (field: 'lot_number' | 'expiry_date' | 'qty_on_hand') =>
    setLotSort(s => s.by === field
      ? { by: field, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { by: field, dir: 'asc' })

  // Prefill cost: the matched lot's cost when merging, else the last paid cost for
  // a new lot. Keyed on the matched lot id so manual edits survive keystrokes that
  // don't change which lot is matched.
  useEffect(() => {
    if (matchedLot) setCostInput(String(matchedLot.cost_price ?? 0))
    else if (target) setCostInput(String(target.last_cost_price ?? 0))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedLot?.id])

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

  // Product-level weighted-average cost preview (old → new) once `adjustDelta`
  // units are added at `costInput`. Same number whether the target is a new lot or
  // an existing one — it's what the operator cares about: the resulting avg cost.
  const avgPreview = useMemo(() => {
    if (adjustDelta === null || adjustDelta <= 0) return null
    const addedC = parseFloat(costInput)
    if (Number.isNaN(addedC) || addedC < 0) return null
    const curQty = currentAvg?.qty ?? 0
    const curAvg = currentAvg?.avg ?? 0
    const newQty = curQty + adjustDelta
    const newAvg = newQty > 0 ? (curQty * curAvg + adjustDelta * addedC) / newQty : addedC
    return { curAvg, newAvg, hasCurrent: currentAvg !== null }
  }, [adjustDelta, costInput, currentAvg])

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
    } else {
      // Increase: merge into the matched lot if the typed number is an exact
      // match, otherwise create a new lot.
      const cost = parseFloat(costInput)
      if (costInput.trim() === '' || Number.isNaN(cost) || cost < 0) {
        toast({ title: 'ต้นทุน/หน่วยไม่ถูกต้อง', variant: 'error' })
        return
      }
      if (matchedLot) {
        payload.mode = 'increase_existing_lot'
        payload.target_lot_id = matchedLot.id
        payload.added_cost_price = cost
      } else {
        payload.mode = 'increase_new_lot'
        const ln = lotQuery.trim()
        if (ln) payload.lot_number = ln
        payload.expiry_date = newLotExpiry || null
        payload.cost_price = cost
      }
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
        className="h-[770px] grid-rows-[auto_1fr_auto]"
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
                <div className="h-[316px] overflow-y-auto scrollbar-thin pr-1">
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
              </div>
            )}

            {/* INCREASE — cost first, then the lot picker. The lot-number box is
                the single source of truth: an exact match merges into that lot,
                anything else creates a new lot. */}
            {adjustDelta !== null && adjustDelta > 0 && (
              <div className="space-y-3">
                {/* Cost + resulting average — no frame, kept compact */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="flex items-center gap-1 text-sm font-medium mb-1 text-muted-foreground h-5">
                        <span>ต้นทุน/หน่วย</span>
                        <span className="text-destructive">*</span>
                        <span className="opacity-70">{matchedLot ? '(ทุนล็อตเดิม)' : '(ทุนล่าสุด)'}</span>
                      </label>
                      <PriceInput
                        variant="elevated"
                        value={costInput}
                        onChange={setCostInput}
                        className="h-10 rounded-lg text-sm text-left"
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-1.5 text-sm font-medium mb-1 text-muted-foreground h-5">
                        <Info className="size-3.5" />
                        <span>ต้นทุนเฉลี่ยใหม่</span>
                      </label>
                      <div className="h-10 px-3 flex items-center bg-muted border border-border rounded-lg text-sm">
                        {avgPreview ? (
                          <span>
                            {avgPreview.hasCurrent && (
                              <><span className="text-muted-foreground">{formatCurrency(avgPreview.curAvg)}</span>{' → '}</>
                            )}
                            <span className="font-semibold text-foreground">{formatCurrency(avgPreview.newAvg)}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </div>
                    </div>
                  </div>

                {/* Lot picker — no frame/title, kept compact */}
                <div className="space-y-3">

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1 text-muted-foreground">เลขที่ล็อต</label>
                      <Input
                        variant="elevated"
                        value={lotQuery}
                        onChange={e => setLotQuery(e.target.value)}
                        placeholder="เว้นว่างเพื่อสร้างเลขอัตโนมัติ"
                        className="h-10 w-full rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1 text-muted-foreground">วันหมดอายุ</label>
                      {matchedLot ? (
                        <div className="h-10 px-3 flex items-center bg-muted border border-border rounded-lg text-sm text-muted-foreground">
                          {formatExp(matchedLot.expiry_date)}
                        </div>
                      ) : (
                        <DateInput variant="elevated" className="h-10 w-full" value={newLotExpiry} onChange={setNewLotExpiry} placeholder="dd/mm/yyyy" />
                      )}
                    </div>
                  </div>

                  <Table containerClassName="h-[208px] rounded-lg border border-border">
                    <TableHeader>
                      <TableRow>
                        <SortableTableHead field="lot_number" sort={lotSort} onToggle={toggleLotSort}>เลขที่ล็อต</SortableTableHead>
                        <SortableTableHead field="expiry_date" sort={lotSort} onToggle={toggleLotSort}>วันหมดอายุ</SortableTableHead>
                        <SortableTableHead field="qty_on_hand" align="right" sort={lotSort} onToggle={toggleLotSort}>คงเหลือ</SortableTableHead>
                        <TableHead>สถานะ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLots.map(l => {
                        const selected = matchedLot?.id === l.id
                        const depleted = l.is_closed || l.qty_on_hand <= 0
                        return (
                          <TableRow
                            key={l.id}
                            onClick={() => setLotQuery(l.lot_number)}
                            data-state={selected ? 'selected' : undefined}
                            className="cursor-pointer"
                          >
                            <TableCell className="font-medium text-foreground">
                              <span className="flex items-center gap-1.5">
                                {selected && <Check className="size-3.5 text-primary" />}
                                {l.lot_number}
                              </span>
                            </TableCell>
                            <TableCell>{formatExp(l.expiry_date)}</TableCell>
                            <TableCell className="text-right">{l.qty_on_hand.toLocaleString()}</TableCell>
                            <TableCell>
                              {depleted
                                ? <Badge variant="destructive">หมด</Badge>
                                : <Badge variant="success-outline">ใช้งาน</Badge>}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                      {filteredLots.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                            ไม่พบล็อตที่ตรงกับ "{lotQuery.trim()}" — จะถูกสร้างเป็นล็อตใหม่
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
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
