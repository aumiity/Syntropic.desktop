import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { PriceInput } from '@/components/ui/price-input'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from '@/components/ui/dialog'
import { DateInput } from '@/components/ui/date-input'
import { FormField } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { getCurrentUserId } from '@/stores/userStore'
import { formatCurrency, formatExpiry, getExpiryStatus } from '@/lib/utils'
import { Edit, Package } from 'lucide-react'
import type { ProductLot } from '@/types'
import type { FullProduct } from './shared'

const Field = FormField
const unitSuffix = (u: string) => <span className="font-normal normal-case text-muted-foreground"> ({u})</span>

interface Props {
  product: FullProduct
  productId: number
  baseUnit: string
  onRefresh: () => Promise<void> | void
}

export function LotsTab({ product, productId, baseUnit, onRefresh }: Props) {
  const { toast } = useToast()

  const [editingLotId, setEditingLotId] = useState<number | null>(null)
  const [lotEditForm, setLotEditForm] = useState<{
    lot_number: string; expiry_date: string; manufactured_date: string
    qty_on_hand: string; cost_price: string
  }>({ lot_number: '', expiry_date: '', manufactured_date: '', qty_on_hand: '', cost_price: '' })
  const [lotSaving, setLotSaving] = useState(false)
  // Lot edit confirm modal — extra step to prevent accidental saves
  const [confirmLot, setConfirmLot] = useState<ProductLot | null>(null)

  const activeLotList = (product.lots ?? []).filter(l => !l.is_cancelled)
  const totalStock = activeLotList.reduce((sum, l) => sum + (Number(l.qty_on_hand) || 0), 0)

  const startEditLot = (lot: ProductLot) => {
    setEditingLotId(lot.id)
    setLotEditForm({
      lot_number: lot.lot_number ?? '',
      expiry_date: lot.expiry_date ?? '',
      manufactured_date: (lot as any).manufactured_date ?? '',
      qty_on_hand: String(lot.qty_on_hand ?? 0),
      cost_price: String(lot.cost_price ?? 0),
    })
  }

  // "Check" button on the lot row — validates and opens the confirm modal.
  // If nothing actually changed, just exit edit mode (no modal, no IPC call).
  const handleSaveLot = () => {
    if (!editingLotId) return

    // Validate qty/cost explicitly — never silently coerce blank/NaN to 0.
    // `parseFloat('') || 0` would turn an accidentally cleared field into an
    // adjust_out that wipes stock to zero (or sets cost to 0), with no undo.
    if (lotEditForm.qty_on_hand.trim() === '' || Number.isNaN(parseFloat(lotEditForm.qty_on_hand)) || parseFloat(lotEditForm.qty_on_hand) < 0) {
      toast({ title: 'กรุณาระบุจำนวนคงเหลือที่ถูกต้อง', variant: 'error' })
      return
    }
    if (lotEditForm.cost_price.trim() === '' || Number.isNaN(parseFloat(lotEditForm.cost_price)) || parseFloat(lotEditForm.cost_price) < 0) {
      toast({ title: 'กรุณาระบุราคาทุนที่ถูกต้อง', variant: 'error' })
      return
    }

    const lot = product?.lots?.find(l => l.id === editingLotId)
    if (!lot) return

    if (getLotEditChanges(lot).length === 0) {
      setEditingLotId(null)
      return
    }
    setConfirmLot(lot)
  }

  // Diff for the confirm modal — only includes fields whose value actually changed.
  const getLotEditChanges = (lot: ProductLot) => {
    const changes: { label: string; before: string; after: string }[] = []
    if ((lot.lot_number ?? '') !== lotEditForm.lot_number) {
      changes.push({ label: 'Lot No.', before: lot.lot_number || '—', after: lotEditForm.lot_number || '—' })
    }
    if ((lot.expiry_date ?? '') !== lotEditForm.expiry_date) {
      changes.push({
        label: 'วันหมดอายุ',
        before: lot.expiry_date ? formatExpiry(lot.expiry_date) : '—',
        after: lotEditForm.expiry_date ? formatExpiry(lotEditForm.expiry_date) : '—',
      })
    }
    const oldMfg = (lot as any).manufactured_date ?? ''
    if (oldMfg !== lotEditForm.manufactured_date) {
      changes.push({
        label: 'วันผลิต',
        before: oldMfg ? formatExpiry(oldMfg) : '—',
        after: lotEditForm.manufactured_date ? formatExpiry(lotEditForm.manufactured_date) : '—',
      })
    }
    const newQty = parseFloat(lotEditForm.qty_on_hand)
    if (Number(lot.qty_on_hand) !== newQty) {
      changes.push({ label: 'จำนวนคงเหลือ', before: String(lot.qty_on_hand), after: String(newQty) })
    }
    const newCost = parseFloat(lotEditForm.cost_price)
    if (Number(lot.cost_price) !== newCost) {
      changes.push({ label: 'ราคาทุน', before: formatCurrency(lot.cost_price), after: formatCurrency(newCost) })
    }
    return changes
  }

  const confirmSaveLot = async () => {
    if (!editingLotId) return
    setLotSaving(true)
    try {
      await window.api.products.updateLot(editingLotId, {
        lot_number: lotEditForm.lot_number || undefined,
        expiry_date: lotEditForm.expiry_date || null,
        manufactured_date: lotEditForm.manufactured_date || null,
        qty_on_hand: parseFloat(lotEditForm.qty_on_hand),
        cost_price: parseFloat(lotEditForm.cost_price),
        user_id: getCurrentUserId(),
      })
      toast({ title: 'บันทึกล็อตสำเร็จ', variant: 'success' })
      setConfirmLot(null)
      setEditingLotId(null)
      await onRefresh()
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally {
      setLotSaving(false)
    }
  }

  return (
    <div className="pt-4 flex-1 min-h-0 flex flex-col">
      <div className="bg-card rounded-card shadow-card overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="px-5 py-2.5 text-sm font-semibold text-muted-foreground shrink-0 flex items-center gap-2 h-12">
          <Edit className="size-4 shrink-0" />
          <span>คลิกไอคอนแก้ไขเพื่อแก้ข้อมูลล็อตโดยตรง — การเปลี่ยนจำนวนคงเหลือจะบันทึกในประวัติการเคลื่อนไหวสต็อกอัตโนมัติ</span>
        </div>
        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-8 border-r-8 border-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-28">Lot No.</TableHead>
                <TableHead className="min-w-32">ผู้จัดจำหน่าย</TableHead>
                <TableHead className="min-w-24">วันหมดอายุ</TableHead>
                <TableHead className="min-w-20 text-right">ราคาทุน</TableHead>
                <TableHead className="min-w-20 text-right">รับเข้า</TableHead>
                <TableHead className="min-w-20 text-right">คงเหลือ</TableHead>
                <TableHead className="min-w-20 text-center">สถานะ</TableHead>
                <TableHead className="min-w-16 text-center">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(product.lots?.length ?? 0) === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-16">
                    <Package className="size-10 mx-auto mb-2 opacity-30" />
                    ยังไม่มีล็อต
                  </TableCell>
                </TableRow>
              ) : product.lots.map(lot => {
                const expStatus = getExpiryStatus(lot.expiry_date)

                return (
                  <TableRow key={lot.id} className="hover:bg-primary-soft/60 transition-colors">
                    <TableCell className="font-mono text-sm font-semibold">{lot.lot_number}</TableCell>
                    <TableCell className="text-sm">{(lot as any).supplier_name ?? '—'}</TableCell>
                    <TableCell className="text-sm tabular-nums">
                      <span className={
                        expStatus === 'expired' ? 'text-destructive font-semibold' :
                        expStatus === 'danger'  ? 'text-warning-strong font-semibold' :
                        expStatus === 'warning' ? 'text-warning' : ''
                      }>
                        {formatExpiry(lot.expiry_date)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{formatCurrency(lot.cost_price)}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{lot.qty_received}</TableCell>
                    <TableCell className="text-right text-sm font-semibold tabular-nums">{lot.qty_on_hand}</TableCell>
                    <TableCell className="text-center">
                      {lot.is_cancelled
                        ? <Badge variant="destructive" className="text-xs rounded-md">ยกเลิก</Badge>
                        : lot.is_closed
                        ? <Badge variant="secondary" className="text-xs rounded-md">ปิด</Badge>
                        : lot.qty_on_hand === 0
                        ? <Badge variant="secondary" className="text-xs rounded-md">หมด</Badge>
                        : <Badge variant="success" className="text-xs rounded-md">ใช้งาน</Badge>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center">
                        {!lot.is_cancelled && (
                          <Button size="icon-lg" variant="outline" onClick={() => startEditLot(lot)} title="แก้ไข">
                            <Edit />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
        <div className="px-5 py-2.5 border-t border-border text-sm text-muted-foreground shrink-0 flex items-center justify-between h-12">
          <span>ทั้งหมด <span className="font-semibold text-foreground tabular-nums">{product.lots?.length ?? 0}</span> ล็อต</span>
          <span className="flex items-center gap-3">
            <span>ใช้งาน <span className="font-semibold text-success tabular-nums">{activeLotList.length}</span></span>
            <span>คงเหลือรวม <span className="font-semibold text-foreground tabular-nums">{totalStock.toLocaleString()}</span> {baseUnit}</span>
          </span>
        </div>
      </div>

      {/* ======================== EDIT LOT DIALOG ======================== */}
      {(() => {
        const lot = editingLotId !== null ? product?.lots?.find(l => l.id === editingLotId) ?? null : null
        return (
          <Dialog open={editingLotId !== null} onOpenChange={open => { if (!open && !lotSaving) setEditingLotId(null) }}>
            <DialogContent size="lg" onClose={() => { if (!lotSaving) setEditingLotId(null) }}>
              <DialogHeader>
                <DialogTitle className="text-xl">แก้ไขล็อต</DialogTitle>
              </DialogHeader>
              <DialogBody className="space-y-4">
                {/* Read-only context */}
                <div className="rounded-lg bg-muted px-3 py-2 flex items-center justify-between">
                  <div>
                    <div className="text-sm text-muted-foreground">ผู้จัดจำหน่าย</div>
                    <div className="text-sm font-semibold text-foreground">{(lot as any)?.supplier_name ?? '—'}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-muted-foreground">รับเข้า</div>
                    <div className="text-sm font-semibold text-foreground tabular-nums">
                      {lot?.qty_received ?? 0} <span className="font-normal text-muted-foreground">{baseUnit}</span>
                    </div>
                  </div>
                </div>

                <Field label="Lot No.">
                  <Input value={lotEditForm.lot_number}
                    onChange={e => setLotEditForm(f => ({ ...f, lot_number: e.target.value }))}
                    className="font-mono" />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="วันที่ผลิต">
                    <DateInput value={lotEditForm.manufactured_date}
                      onChange={v => setLotEditForm(f => ({ ...f, manufactured_date: v }))} />
                  </Field>
                  <Field label="วันหมดอายุ">
                    <DateInput value={lotEditForm.expiry_date}
                      onChange={v => setLotEditForm(f => ({ ...f, expiry_date: v }))} />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="ราคาทุน">
                    <PriceInput value={lotEditForm.cost_price}
                      onChange={v => setLotEditForm(f => ({ ...f, cost_price: v }))} />
                  </Field>
                  <Field label={<>จำนวนคงเหลือ{unitSuffix(baseUnit)}</>}>
                    <Input type="number" value={lotEditForm.qty_on_hand}
                      onChange={e => setLotEditForm(f => ({ ...f, qty_on_hand: e.target.value }))}
                      className="text-right tabular-nums" min={0} />
                  </Field>
                </div>

                <p className="text-sm text-muted-foreground">
                  การเปลี่ยนจำนวนคงเหลือจะบันทึกในประวัติการเคลื่อนไหวสต็อกอัตโนมัติ
                </p>
              </DialogBody>
              <DialogFooter>
                <Button variant="destructive2" size="xl" onClick={() => setEditingLotId(null)} disabled={lotSaving}>ยกเลิก</Button>
                <Button size="xl" onClick={handleSaveLot} disabled={lotSaving}>บันทึก</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )
      })()}

      {/* Confirm lot edit — shows diff (before → after) for each changed field */}
      <Dialog open={!!confirmLot} onOpenChange={open => { if (!open && !lotSaving) setConfirmLot(null) }}>
        <DialogContent size="sm" onClose={() => { if (!lotSaving) setConfirmLot(null) }}>
          <DialogHeader>
            <DialogTitle className="text-xl">ยืนยันการแก้ไขล็อต</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            {confirmLot && (
              <>
                <div className="bg-muted rounded-card px-4 py-3">
                  <div className="text-sm text-muted-foreground">ล็อต</div>
                  <div className="font-mono font-semibold text-sm">{confirmLot.lot_number}</div>
                </div>
                <div className="space-y-2">
                  {getLotEditChanges(confirmLot).map((c, i) => (
                    <div key={i} className="flex items-baseline gap-2 text-sm">
                      <span className="w-28 shrink-0 text-muted-foreground">{c.label}</span>
                      <span className="text-foreground-subtle tabular-nums line-through">{c.before}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-semibold tabular-nums">{c.after}</span>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  การแก้ไขจะถูกบันทึกในประวัติการเคลื่อนไหวสต็อกและไม่สามารถย้อนกลับได้ทันที
                </p>
              </>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="destructive2" size="xl" onClick={() => setConfirmLot(null)} disabled={lotSaving}>ยกเลิก</Button>
            <Button size="xl" onClick={confirmSaveLot} disabled={lotSaving} autoFocus>
              {lotSaving ? 'กำลังบันทึก...' : 'ยืนยันการแก้ไข'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
