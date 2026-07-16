import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { PriceInput } from '@/components/ui/price-input'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, SortableTableHead,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Popover, PopoverTrigger, PopoverContent, PopoverHeader, PopoverTitle,
} from '@/components/ui/popover'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { DateInput } from '@/components/ui/date-input'
import { FormField } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { TintIcon } from '@/components/ui/tint-icon'
import { getCurrentUserId } from '@/stores/userStore'
import { useManagerOverride } from '@/hooks/useManagerOverride'
import { formatCurrency, formatDate, formatExpiry, cn, toIntegerInput } from '@/lib/utils'
import dayjs from 'dayjs'
import { Edit, Package, Filter, Check, Clock, ClockFading, ClockAlert, Info } from 'lucide-react'
import type { ProductLot } from '@/types'
import type { FullProduct } from './shared'

const Field = FormField
const unitSuffix = (u: string) => <span className="font-normal normal-case text-muted-foreground"> ({u})</span>

type SortField = 'lot_number' | 'expiry_date' | 'cost_price' | 'status'
type SortDir = 'asc' | 'desc'
interface SortState { by: SortField; dir: SortDir }

type LotStatus = 'active' | 'closed' | 'cancelled'
type StatusFilter = 'all' | LotStatus

// "หมด" (qty=0, !is_closed) is collapsed into "ปิด" — same semantic
// (lot has no usable stock); the qty=0 + !is_closed combo is only a legacy
// edge case since `is_closed` auto-toggles when qty crosses 0.
const getLotStatus = (lot: ProductLot): LotStatus => {
  if (lot.is_cancelled) return 'cancelled'
  if (lot.is_closed || !Number(lot.qty_on_hand)) return 'closed'
  return 'active'
}

// Sort rank: usable first → closed → cancelled (asc puts the most relevant
// rows at the top).
const STATUS_RANK: Record<LotStatus, number> = { active: 0, closed: 1, cancelled: 2 }

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all',       label: 'ทั้งหมด' },
  { value: 'active',    label: 'ใช้งาน' },
  { value: 'closed',    label: 'ปิด' },
  { value: 'cancelled', label: 'ยกเลิก' },
]

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
  const overrideLot = useManagerOverride()
  // Lot edit confirm modal — extra step to prevent accidental saves
  const [confirmLot, setConfirmLot] = useState<ProductLot | null>(null)

  // Default to expiry desc (newest lots first) + only "ใช้งาน" — operators
  // viewing this tab usually want to confirm/edit the lots they just received,
  // which sit at the far-future end of the expiry timeline.
  const [sort, setSort] = useState<SortState>({ by: 'expiry_date', dir: 'desc' })
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')

  const toggleSort = (field: SortField) => {
    setSort(s => s.by === field
      ? { by: field, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { by: field, dir: 'asc' })
  }

  const totalStock = (product.lots ?? [])
    .filter(l => !l.is_cancelled)
    .reduce((sum, l) => sum + (Number(l.qty_on_hand) || 0), 0)

  const displayLots = useMemo(() => {
    const all = product.lots ?? []
    const filtered = statusFilter === 'all'
      ? all
      : all.filter(l => getLotStatus(l) === statusFilter)
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      if (sort.by === 'cost_price') {
        return ((Number(a.cost_price) || 0) - (Number(b.cost_price) || 0)) * dir
      }
      if (sort.by === 'status') {
        return (STATUS_RANK[getLotStatus(a)] - STATUS_RANK[getLotStatus(b)]) * dir
      }
      const av = (sort.by === 'lot_number' ? a.lot_number : a.expiry_date) ?? ''
      const bv = (sort.by === 'lot_number' ? b.lot_number : b.expiry_date) ?? ''
      return av.localeCompare(bv) * dir
    })
  }, [product.lots, sort, statusFilter])

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
    const lotId = editingLotId
    const data = {
      lot_number: lotEditForm.lot_number || undefined,
      expiry_date: lotEditForm.expiry_date || null,
      manufactured_date: lotEditForm.manufactured_date || null,
      qty_on_hand: parseFloat(lotEditForm.qty_on_hand),
      cost_price: parseFloat(lotEditForm.cost_price),
      user_id: getCurrentUserId(),
    }
    setLotSaving(true)
    const mode = overrideLot.run(
      async (ov) => { await window.api.products.updateLot(lotId, data, ov) },
      {
        permKey: 'stock.adjust',
        title: 'แก้ไขล็อต',
        onDone: async () => {
          setLotSaving(false)
          toast({ title: 'บันทึกล็อตสำเร็จ', variant: 'success' })
          setConfirmLot(null)
          setEditingLotId(null)
          await onRefresh()
        },
        onError: (e: any) => {
          setLotSaving(false)
          toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
        },
      },
    )
    if (mode !== 'inline') setLotSaving(false)
  }

  return (
    <div className="pt-4 flex-1 min-h-0 flex flex-col">
      <div className="bg-card rounded-card shadow-card border border-border overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="px-4 h-12 shrink-0 flex items-center gap-3">
          <div className="flex items-center gap-3 shrink-0">
            <TintIcon icon={Package} tint="neutral" size="sm" />
            <h3 className="text-lg font-semibold text-foreground">ล็อต</h3>
            <Badge variant="neutral">{displayLots.length}</Badge>
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button size="lg" variant="elevated" className="h-9 w-9 p-0 shrink-0 ml-auto" title="ตัวกรอง">
                <Filter className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-1 gap-0">
              <PopoverHeader className="px-2">
                <PopoverTitle>สถานะ</PopoverTitle>
              </PopoverHeader>
              {STATUS_OPTIONS.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setStatusFilter(o.value)}
                  className={cn(
                    'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors',
                    statusFilter === o.value ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted',
                  )}
                >
                  <Check className={cn('size-4', statusFilter === o.value ? 'opacity-100' : 'opacity-0')} />
                  <span className="flex-1 text-left">{o.label}</span>
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-[16px] border-r-[16px] border-card">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead field="lot_number" sort={sort} onToggle={toggleSort} className="min-w-28">Lot No.</SortableTableHead>
                <TableHead className="min-w-32">ผู้จัดจำหน่าย</TableHead>
                <SortableTableHead field="expiry_date" sort={sort} onToggle={toggleSort} className="min-w-24">วันหมดอายุ</SortableTableHead>
                <SortableTableHead field="cost_price" sort={sort} onToggle={toggleSort} className="min-w-24">ราคาทุน</SortableTableHead>
                <TableHead className="min-w-20">รับเข้า</TableHead>
                <TableHead className="min-w-20">คงเหลือ</TableHead>
                <SortableTableHead field="status" sort={sort} onToggle={toggleSort} className="min-w-24">สถานะ</SortableTableHead>
                <TableHead className="min-w-16">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayLots.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-16">
                    <Package className="size-10 mx-auto mb-2 opacity-30" />
                    {(product.lots?.length ?? 0) === 0 ? 'ยังไม่มีล็อต' : 'ไม่พบล็อตที่ตรงเงื่อนไข'}
                  </TableCell>
                </TableRow>
              ) : displayLots.map(lot => {
                return (
                  <TableRow key={lot.id} className="[&_td]:py-2.5 [&_td]:font-medium">
                    <TableCell className="text-sm font-semibold">{lot.lot_number}</TableCell>
                    <TableCell className="text-sm">{(lot as any).supplier_name ?? '—'}</TableCell>
                    <TableCell className="text-sm">
                      {(() => {
                        if (!lot.expiry_date) return <span className="text-muted-foreground">—</span>
                        const days = dayjs(lot.expiry_date).diff(dayjs(), 'day')
                        const dateStr = formatDate(lot.expiry_date)
                        const tip = days < 0
                          ? `หมดอายุแล้ว ${Math.abs(days).toLocaleString()} วัน`
                          : `เหลืออีก ${days.toLocaleString()} วัน`
                        // 3 buckets: expired (<0) · near-expiry (<90d, "ต่ำกว่า 3 เดือน") · normal
                        const badge = days < 0 ? (
                          <Badge variant="destructive-outline" className="rounded-md gap-1 text-sm">
                            <ClockAlert className="size-4" /> {dateStr}
                          </Badge>
                        ) : days < 90 ? (
                          <Badge variant="amber-outline" className="rounded-md gap-1 text-sm">
                            <ClockFading className="size-4" /> {dateStr}
                          </Badge>
                        ) : (
                          <Badge variant="success-outline" className="rounded-md gap-1 text-sm">
                            <Clock className="size-4" /> {dateStr}
                          </Badge>
                        )
                        // Wrap in <span> — Badge has no forwardRef, so Radix
                        // Tooltip's asChild can't attach the ref it needs.
                        return (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex cursor-help">{badge}</span>
                            </TooltipTrigger>
                            <TooltipContent side="top" align="center">{tip}</TooltipContent>
                          </Tooltip>
                        )
                      })()}
                    </TableCell>
                    <TableCell className="text-sm">{formatCurrency(lot.cost_price)}</TableCell>
                    <TableCell className="text-sm">{lot.qty_received}</TableCell>
                    <TableCell className="text-sm font-semibold">{lot.qty_on_hand}</TableCell>
                    <TableCell>
                      {lot.is_cancelled
                        ? <Badge variant="destructive-outline" className="rounded-md">ยกเลิก</Badge>
                        : (lot.is_closed || lot.qty_on_hand === 0)
                        ? <Badge variant="mutedborder" className="rounded-md">ปิด</Badge>
                        : <Badge variant="success-outline" className="rounded-md">ใช้งาน</Badge>}
                    </TableCell>
                    <TableCell>
                      {!lot.is_cancelled && (
                        <Button size="icon-lg" variant="elevated" onClick={() => startEditLot(lot)} tooltip="แก้ไข">
                          <Edit />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
        <div className="px-5 h-12 bg-card border-t border-border text-sm text-muted-foreground shrink-0 flex items-center justify-between gap-3">
          <span className="truncate">การเปลี่ยนจำนวนคงเหลือจะบันทึกในประวัติการเคลื่อนไหวสต็อกอัตโนมัติ</span>
          <span className="shrink-0">
            คงเหลือรวม <span className="font-semibold text-foreground">{totalStock.toLocaleString()}</span> {baseUnit}
          </span>
        </div>
      </div>

      {/* ======================== EDIT LOT DIALOG ======================== */}
      {(() => {
        const lot = editingLotId !== null ? product?.lots?.find(l => l.id === editingLotId) ?? null : null
        return (
          <Dialog open={editingLotId !== null} onOpenChange={open => { if (!open && !lotSaving) setEditingLotId(null) }}>
            <DialogContent size="lg" divided onClose={() => { if (!lotSaving) setEditingLotId(null) }}>
              <DialogHeader>
                <DialogTitle className="text-xl">แก้ไขล็อต</DialogTitle>
              </DialogHeader>
              <DialogBody className="space-y-4">
                {/* Read-only context */}
                <div className="rounded-lg bg-muted/50 border border-border">
                  <div className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-sm text-muted-foreground shrink-0">ผู้จัดจำหน่าย</span>
                    <span className="text-sm font-semibold text-foreground overflow-x-clip overflow-y-visible text-right">{(lot as any)?.supplier_name ?? '—'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-sm text-muted-foreground shrink-0">จำนวนที่รับเข้า</span>
                    <span className="text-sm font-semibold text-foreground">
                      {lot?.qty_received ?? 0} <span className="font-normal text-muted-foreground">{baseUnit}</span>
                    </span>
                  </div>
                </div>

                <Field label="Lot No.">
                  <Input variant="elevated" value={lotEditForm.lot_number}
                    onChange={e => setLotEditForm(f => ({ ...f, lot_number: e.target.value }))} />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="วันที่ผลิต">
                    <DateInput variant="elevated" value={lotEditForm.manufactured_date}
                      onChange={v => setLotEditForm(f => ({ ...f, manufactured_date: v }))} />
                  </Field>
                  <Field label="วันหมดอายุ">
                    <DateInput variant="elevated" value={lotEditForm.expiry_date}
                      onChange={v => setLotEditForm(f => ({ ...f, expiry_date: v }))} />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="ราคาทุน">
                    <PriceInput variant="elevated" value={lotEditForm.cost_price}
                      onChange={v => setLotEditForm(f => ({ ...f, cost_price: v }))} />
                  </Field>
                  <Field label={<>จำนวนคงเหลือ{unitSuffix(baseUnit)}</>}>
                    <Input variant="elevated" type="number" value={lotEditForm.qty_on_hand}
                      onChange={e => setLotEditForm(f => ({ ...f, qty_on_hand: toIntegerInput(e.target.value) }))}
                      className="text-right" min={0} step={1} />
                  </Field>
                </div>

                <div className="flex items-start gap-1.5 rounded-lg border border-info/30 bg-info-soft p-2.5 text-sm text-info-soft-foreground">
                  <Info className="size-4 shrink-0 mt-0.5" />
                  <span>การเปลี่ยนจำนวนคงเหลือจะบันทึกในประวัติการเคลื่อนไหวสต็อกอัตโนมัติ</span>
                </div>
              </DialogBody>
              <DialogFooter>
                <Button variant="elevated" size="xl" onClick={() => setEditingLotId(null)} disabled={lotSaving}>ยกเลิก</Button>
                <Button size="xl" onClick={handleSaveLot} disabled={lotSaving}>บันทึก</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )
      })()}

      {/* Confirm lot edit — shows diff (before → after) for each changed field */}
      <ConfirmDialog
        open={!!confirmLot}
        onOpenChange={open => { if (!open && !lotSaving) setConfirmLot(null) }}
        title="ยืนยันการแก้ไขล็อต"
        description="การแก้ไขจะถูกบันทึกในประวัติการเคลื่อนไหวสต็อกและไม่สามารถย้อนกลับได้ทันที"
        cancelLabel="ยกเลิก"
        confirmLabel={lotSaving ? 'กำลังบันทึก...' : 'ยืนยันการแก้ไข'}
        busy={lotSaving}
        onConfirm={confirmSaveLot}
        content={confirmLot && (
          <div className="space-y-3">
            <div className="rounded-card border bg-card shadow-sm px-4 py-3">
              <div className="text-sm text-muted-foreground">ล็อต</div>
              <div className="font-semibold text-sm">{confirmLot.lot_number}</div>
            </div>
            <div className="space-y-2">
              {getLotEditChanges(confirmLot).map((c, i) => (
                <div key={i} className="flex items-baseline gap-2 text-sm">
                  <span className="w-28 shrink-0 text-muted-foreground">{c.label}</span>
                  <span className="text-foreground-subtle line-through">{c.before}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-semibold">{c.after}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      />
      {overrideLot.dialog}
    </div>
  )
}
