import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, SortableTableHead,
} from '@/components/ui/table'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { SaleDetailDialog, type SaleDetail } from '@/components/dialogs/SaleDetailDialog'
import { PurchaseReceiptDialog } from '@/components/dialogs/PurchaseReceiptDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { formatDateTime, cn } from '@/lib/utils'
import {
  History, RotateCcw, Info, StickyNote,
} from 'lucide-react'
import { MOVEMENT_META, type StockMovement, type MovementSortKey } from './shared'

interface Props {
  productId: number
  isNew: boolean
  /** True when this tab is the currently active one — gates lazy load. */
  active: boolean
}

export function HistoryTab({ productId, isNew, active }: Props) {
  const { toast } = useToast()

  const [movements, setMovements] = useState<StockMovement[] | null>(null)
  const [movementsLoading, setMovementsLoading] = useState(false)
  const [movementTypeFilter, setMovementTypeFilter] = useState<Set<string>>(new Set())
  const [movementSort, setMovementSort] = useState<{ by: MovementSortKey; dir: 'asc' | 'desc' }>({
    by: 'created_at', dir: 'desc',
  })
  const [movementDateFrom, setMovementDateFrom] = useState('')
  const [movementDateTo, setMovementDateTo] = useState('')

  // Sale/GR detail dialogs — only opened from history rows
  const [saleDetailInvoice, setSaleDetailInvoice] = useState<string | null>(null)
  const [saleDetailOpen, setSaleDetailOpen] = useState(false)
  const [grDetailInvoice, setGrDetailInvoice] = useState<string | null>(null)
  const [grDetailOpen, setGrDetailOpen] = useState(false)
  const [voidTarget, setVoidTarget] = useState<{ id: number; invoice_no: string } | null>(null)

  // Lazy load on first activation. `movements === null` is the "not loaded yet" marker.
  useEffect(() => {
    if (!active || isNew || !productId) return
    if (movements !== null) return
    setMovementsLoading(true)
    window.api.products.stockMovements(productId, { limit: 500 })
      .then((rows: any) => setMovements(rows as StockMovement[]))
      .catch(err => {
        console.error('[stockMovements] failed:', err)
        toast({ title: 'โหลดประวัติไม่สำเร็จ', description: err?.message ?? String(err), variant: 'destructive' })
        setMovements([])
      })
      .finally(() => setMovementsLoading(false))
  }, [active, productId, isNew, movements, toast])

  const reloadMovements = () => {
    if (!productId) return
    setMovementsLoading(true)
    window.api.products.stockMovements(productId, { limit: 500 })
      .then((rows: any) => setMovements(rows as StockMovement[]))
      .catch(err => {
        console.error('[stockMovements] failed:', err)
        toast({ title: 'โหลดประวัติไม่สำเร็จ', description: err?.message ?? String(err), variant: 'destructive' })
        setMovements([])
      })
      .finally(() => setMovementsLoading(false))
  }

  const filteredMovements = useMemo(() => {
    const filtered = (movements ?? []).filter(m => {
      if (movementTypeFilter.size > 0 && !movementTypeFilter.has(m.movement_type)) return false
      if (movementDateFrom || movementDateTo) {
        // stock_movements.created_at format = 'YYYY-MM-DD HH:MM:SS' so the
        // first 10 chars are the date — lexical compare matches calendar order
        const day = m.created_at.slice(0, 10)
        if (movementDateFrom && day < movementDateFrom) return false
        if (movementDateTo && day > movementDateTo) return false
      }
      return true
    })
    const mul = movementSort.dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      const cmp = a.created_at.localeCompare(b.created_at)
      if (cmp !== 0) return mul * cmp
      return mul * (a.id - b.id)
    })
  }, [movements, movementTypeFilter, movementSort, movementDateFrom, movementDateTo])

  const toggleMovementSort = (by: MovementSortKey) => {
    setMovementSort(prev => prev.by === by
      ? { by, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { by, dir: 'desc' })
  }

  const handleVoidBill = async (reason: string) => {
    if (!voidTarget) return
    try {
      await window.api.reports.voidSale(voidTarget.id, reason)
      toast({ title: 'ยกเลิกบิลสำเร็จ', variant: 'success' })
      setVoidTarget(null)
      setSaleDetailOpen(false)
      setSaleDetailInvoice(null)
      reloadMovements()
    } catch (e: any) {
      toast({ title: 'ยกเลิกไม่สำเร็จ', description: e?.message ?? String(e), variant: 'destructive' })
      setVoidTarget(null)
    }
  }

  const openMovementDetail = (m: StockMovement) => {
    if (m.sale_invoice_no) {
      setSaleDetailInvoice(m.sale_invoice_no)
      setSaleDetailOpen(true)
    } else if (m.gr_invoice_no) {
      setGrDetailInvoice(m.gr_invoice_no)
      setGrDetailOpen(true)
    }
  }

  return (
    <div className="pt-4 flex-1 min-h-0 flex flex-col">
      <div className="bg-card rounded-card shadow-card overflow-hidden flex-1 min-h-0 flex flex-col">
        {/* Date range bar */}
        <div className="h-14 px-2 flex items-center gap-3 shrink-0">
          <span className="text-sm font-semibold text-muted-foreground shrink-0">ช่วงวันที่:</span>
          <DateRangePicker
            from={movementDateFrom}
            to={movementDateTo}
            onChange={(f, t) => { setMovementDateFrom(f); setMovementDateTo(t) }}
            className="h-9 w-72"
          />
          {(movementDateFrom || movementDateTo) && (
            <Button
              size="lg"
              variant="ghost"
              className="px-3 shrink-0"
              onClick={() => { setMovementDateFrom(''); setMovementDateTo('') }}
            >
              ล้างวันที่
            </Button>
          )}
        </div>
        {/* Filter bar: chips on the left, bulk actions on the right */}
        <div className="h-14 px-2 flex items-center gap-3 shrink-0">
          <span className="text-sm font-semibold text-muted-foreground shrink-0">ตัวกรอง:</span>
          <div className="flex flex-wrap items-center gap-1.5 flex-1">
            {Object.entries(MOVEMENT_META).map(([type, meta]) => {
              const active = movementTypeFilter.has(type)
              return (
                <Button
                  key={type}
                  size="lg"
                  variant={active ? meta.variant : 'outline'}
                  className="px-3"
                  onClick={() => {
                    setMovementTypeFilter(prev => {
                      const next = new Set(prev)
                      if (next.has(type)) next.delete(type)
                      else next.add(type)
                      return next
                    })
                  }}
                >
                  {meta.label}
                </Button>
              )
            })}
          </div>
          <Button
            size="lg"
            variant="ghost"
            className="px-3 shrink-0"
            onClick={() => setMovementTypeFilter(new Set())}
            disabled={movementTypeFilter.size === 0}
          >
            ล้างตัวกรอง
          </Button>
        </div>

        {/* Table — min-w-X on each column matches the lots tab pattern:
            columns size to content with a floor; container scrolls
            horizontally only below the cumulative min-width. */}
        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-8 border-r-8 border-card">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead className="min-w-32" field="created_at" sort={movementSort} onToggle={toggleMovementSort}>
                  วันเวลา
                </SortableTableHead>
                <TableHead className="min-w-28 text-center">ประเภท</TableHead>
                <TableHead className="min-w-40 text-center">Lot</TableHead>
                <TableHead className="min-w-28 text-right">เปลี่ยนแปลง</TableHead>
                <TableHead className="min-w-28 text-right">คงเหลือ</TableHead>
                <TableHead className="min-w-40 text-center">ดูข้อมูล</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movementsLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                    กำลังโหลด...
                  </TableCell>
                </TableRow>
              ) : filteredMovements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-16">
                    <History className="size-10 mx-auto mb-2 opacity-30" />
                    {movements && movements.length > 0
                      ? 'ไม่มีรายการตามตัวกรอง'
                      : 'ยังไม่มีความเคลื่อนไหวสต็อค'}
                  </TableCell>
                </TableRow>
              ) : filteredMovements.map(m => {
                const meta = MOVEMENT_META[m.movement_type] ?? {
                  label: m.movement_type,
                  variant: 'secondary' as const,
                  icon: Info,
                }
                const Icon = meta.icon
                const isPositive = m.qty_change > 0
                const hasDetail = Boolean(m.sale_invoice_no || m.gr_invoice_no)
                return (
                  <TableRow key={m.id} className="hover:bg-primary-soft/60 transition-colors">
                    <TableCell className="text-sm tabular-nums">{formatDateTime(m.created_at)}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={meta.variant} className="rounded-md gap-1">
                        <Icon className="size-3" /> {meta.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm font-mono truncate text-center" title={m.lot_number ?? undefined}>{m.lot_number ?? '—'}</TableCell>
                    <TableCell className={cn(
                      'text-right text-sm font-semibold tabular-nums',
                      isPositive ? 'text-success' : 'text-destructive',
                    )}>
                      {isPositive ? '+' : ''}{m.qty_change.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      <span className="text-muted-foreground">{m.qty_before.toLocaleString()}</span>
                      <span className="text-muted-foreground mx-1">→</span>
                      <span className="font-semibold text-foreground">{m.qty_after.toLocaleString()}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {m.note ? (
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                size="icon-lg"
                                variant="warm"
                                title="ดูหมายเหตุ"
                              >
                                <StickyNote />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent align="center" className="w-80 max-w-[90vw]">
                              <div className="text-sm whitespace-pre-wrap break-words">{m.note}</div>
                            </PopoverContent>
                          </Popover>
                        ) : (
                          <Button size="icon-lg" variant="outline" disabled title="ไม่มีหมายเหตุ">
                            <StickyNote />
                          </Button>
                        )}
                        {hasDetail ? (
                          <Button
                            size="icon-lg"
                            variant="primary-soft"
                            onClick={() => openMovementDetail(m)}
                            title={`ดู ${m.sale_invoice_no ?? m.gr_invoice_no}`}
                          >
                            <Info />
                          </Button>
                        ) : (
                          <Button size="icon-lg" variant="outline" disabled title="ไม่มีบิล/เอกสาร">
                            <Info />
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

        {/* Bottom strip — action left, count right (showcase) */}
        <div className="px-5 h-12 bg-card border-t border-border text-sm text-muted-foreground shrink-0 flex items-center justify-between gap-3">
          <Button size="lg" variant="outline" onClick={reloadMovements} disabled={movementsLoading} className="px-3 shrink-0">
            <RotateCcw className="size-4" /> รีเฟรช
          </Button>
          <span className="shrink-0">
            พบ{' '}
            <span className="font-semibold text-foreground tabular-nums">
              {filteredMovements.length}
            </span>
            {movements && movementTypeFilter.size > 0 ? <> / {movements.length}</> : null}
            {' '}รายการ
            {movements && movements.length >= 500 && (
              <span className="ml-2 text-warning-strong">(แสดงล่าสุด 500 รายการ)</span>
            )}
          </span>
        </div>
      </div>

      <SaleDetailDialog
        open={saleDetailOpen}
        onOpenChange={(o) => {
          setSaleDetailOpen(o)
          if (!o) {
            setSaleDetailInvoice(null)
            // Lot qty may have changed if a void happened inside the dialog
            reloadMovements()
          }
        }}
        invoiceNo={saleDetailInvoice}
        onVoidRequest={(sale: SaleDetail) => {
          setVoidTarget({ id: sale.id, invoice_no: sale.invoice_no })
          setSaleDetailOpen(false)
        }}
      />
      <ConfirmDialog
        open={!!voidTarget}
        onOpenChange={open => { if (!open) setVoidTarget(null) }}
        title="ยกเลิกบิล"
        description={`ต้องการยกเลิกบิล ${voidTarget?.invoice_no}? สต็อกจะถูกคืนกลับอัตโนมัติ`}
        confirmLabel="ยกเลิกบิล"
        variant="destructive"
        requireReason
        reasonLabel="เหตุผลการยกเลิก"
        reasonPresets={['คีย์รายการผิด', 'ราคาผิด', 'ลูกค้ายกเลิก', 'ลูกค้าคืนสินค้า', 'บิลซ้ำ']}
        onConfirm={reason => handleVoidBill(reason ?? '')}
      />
      <PurchaseReceiptDialog
        open={grDetailOpen}
        onOpenChange={(o) => {
          setGrDetailOpen(o)
          if (!o) setGrDetailInvoice(null)
        }}
        invoiceNo={grDetailInvoice}
      />
    </div>
  )
}
