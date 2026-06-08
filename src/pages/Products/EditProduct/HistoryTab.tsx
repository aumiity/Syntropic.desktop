import { useEffect, useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, SortableTableHead,
} from '@/components/ui/table'
import { Pagination, type PageSize } from '@/components/ui/pagination'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Popover, PopoverTrigger, PopoverContent, PopoverHeader, PopoverTitle } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { MultiDatePicker, type MultiDateMode } from '@/components/ui/multi-date-picker'
import { SaleDetailDialog, type SaleDetail } from '@/components/dialogs/SaleDetailDialog'
import { PurchaseReceiptDialog } from '@/components/dialogs/PurchaseReceiptDialog'
import { VoidBillDialog } from '@/components/dialogs/VoidBillDialog'
import { useToast } from '@/components/ui/toast'
import { TintIcon } from '@/components/ui/tint-icon'
import { useNegativeStockBadge } from '@/stores/negativeStockBadge'
import { useManagerOverride } from '@/hooks/useManagerOverride'
import { formatDate, formatDateTime, cn } from '@/lib/utils'
import {
  History, RotateCcw, Info, StickyNote, Filter,
} from 'lucide-react'
import { MOVEMENT_META, type StockMovement, type MovementSortKey } from './shared'

const ALL_MOVEMENT_TYPES = Object.keys(MOVEMENT_META)

// Which document a movement's "ดูข้อมูล" button links to — decided by the
// movement TYPE, not merely whether an invoice_no happens to be attached.
// receive/purchase_return reference a GR; sale/sale_return reference a bill.
// adjust/expiry disposals reference no document → button stays muted, even
// though they sit on a lot that still carries its originating GR invoice_no.
const GR_LINK_TYPES = new Set(['receive', 'purchase_return'])
const SALE_LINK_TYPES = new Set(['sale', 'sale_return', 'sale_void'])

function movementDetailLink(m: StockMovement): { kind: 'sale' | 'gr'; invoice: string } | null {
  if (SALE_LINK_TYPES.has(m.movement_type) && m.sale_invoice_no) return { kind: 'sale', invoice: m.sale_invoice_no }
  if (GR_LINK_TYPES.has(m.movement_type) && m.gr_invoice_no) return { kind: 'gr', invoice: m.gr_invoice_no }
  return null
}

// Group movement types by label so types that share a label (e.g. `expired`
// and `near_expiry` both display as "หมดอายุ") collapse into a single filter
// checkbox that toggles all member types together.
const MOVEMENT_FILTER_GROUPS: { label: string; types: string[]; icon: typeof MOVEMENT_META[string]['icon'] }[] = (() => {
  const seen = new Map<string, { label: string; types: string[]; icon: typeof MOVEMENT_META[string]['icon'] }>()
  for (const [type, meta] of Object.entries(MOVEMENT_META)) {
    const existing = seen.get(meta.label)
    if (existing) existing.types.push(type)
    else seen.set(meta.label, { label: meta.label, types: [type], icon: meta.icon })
  }
  return Array.from(seen.values())
})()

interface Props {
  productId: number
  isNew: boolean
  /** True when this tab is the currently active one — gates lazy load. */
  active: boolean
}

export function HistoryTab({ productId, isNew, active }: Props) {
  const { toast } = useToast()

  // Server-side pagination + filtering. `movements` is the current page's
  // rows; `total` is the unpaginated count for the active filter set.
  const [movements, setMovements] = useState<StockMovement[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSize>(50)
  const [movementsLoading, setMovementsLoading] = useState(false)
  // Whitelist: types currently selected to show. Initialize as all types
  // (= no narrowing). Empty set = show none.
  const [movementTypeFilter, setMovementTypeFilter] = useState<Set<string>>(() => new Set(ALL_MOVEMENT_TYPES))
  const [movementSort, setMovementSort] = useState<{ by: MovementSortKey; dir: 'asc' | 'desc' }>({
    by: 'created_at', dir: 'desc',
  })
  const [movementDateMode, setMovementDateMode] = useState<MultiDateMode>('custom')
  const [movementDateFrom, setMovementDateFrom] = useState('')
  const [movementDateTo, setMovementDateTo] = useState('')

  // Sale/GR detail dialogs — only opened from history rows
  const [saleDetailInvoice, setSaleDetailInvoice] = useState<string | null>(null)
  const [saleDetailOpen, setSaleDetailOpen] = useState(false)
  const [grDetailInvoice, setGrDetailInvoice] = useState<string | null>(null)
  const [grDetailOpen, setGrDetailOpen] = useState(false)
  const [voidTarget, setVoidTarget] = useState<{ id: number; invoice_no: string } | null>(null)
  const overrideVoid = useManagerOverride()

  const loadMovements = useCallback(async () => {
    if (!productId || isNew) return
    // Manual "uncheck all" short-circuits the IPC — no need to ask the
    // backend for zero rows.
    if (movementTypeFilter.size === 0) {
      setMovements([])
      setTotal(0)
      return
    }
    setMovementsLoading(true)
    try {
      // Only send `movement_types` when the user has narrowed the set.
      // Sending the full whitelist is wasted bind params + a redundant IN clause.
      const isNarrowing = movementTypeFilter.size < ALL_MOVEMENT_TYPES.length
      const res = await window.api.products.stockMovements(productId, {
        page,
        pageSize: pageSize === 'all' ? 0 : pageSize,
        movement_types: isNarrowing ? Array.from(movementTypeFilter) : undefined,
        date_from: movementDateFrom || undefined,
        date_to: movementDateTo || undefined,
        sort_dir: movementSort.dir,
      }) as { rows: StockMovement[]; total: number }
      setMovements(res.rows)
      setTotal(res.total)
    } catch (err: any) {
      console.error('[stockMovements] failed:', err)
      toast({ title: 'โหลดประวัติไม่สำเร็จ', description: err?.message ?? String(err), variant: 'error' })
      setMovements([])
      setTotal(0)
    } finally {
      setMovementsLoading(false)
    }
  }, [productId, isNew, page, pageSize, movementTypeFilter, movementDateFrom, movementDateTo, movementSort.dir, toast])

  useEffect(() => {
    if (active) loadMovements()
  }, [active, loadMovements])

  // Manual reload — used after void/refresh button. Forces re-fetch of the
  // current page (loadMovements identity is stable for unchanged deps).
  const reloadMovements = () => { loadMovements() }

  const toggleMovementSort = (by: MovementSortKey) => {
    setMovementSort(prev => prev.by === by
      ? { by, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { by, dir: 'desc' })
    setPage(1)
  }

  const handleVoidBill = async (reason: string) => {
    if (!voidTarget) return
    const target = voidTarget
    overrideVoid.run(
      async (ov) => { await window.api.reports.voidSale(target.id, reason, ov) },
      {
        title: 'ยกเลิกบิล',
        onDone: () => {
          toast({ title: 'ยกเลิกบิลสำเร็จ', variant: 'success' })
          setVoidTarget(null)
          setSaleDetailOpen(false)
          setSaleDetailInvoice(null)
          reloadMovements()
          useNegativeStockBadge.getState().refresh()
        },
        onError: (e: any) => {
          toast({ title: 'ยกเลิกไม่สำเร็จ', description: e?.message ?? String(e), variant: 'destructive' })
          setVoidTarget(null)
        },
      },
    )
  }

  const openMovementDetail = (m: StockMovement) => {
    const link = movementDetailLink(m)
    if (!link) return
    if (link.kind === 'sale') {
      setSaleDetailInvoice(link.invoice)
      setSaleDetailOpen(true)
    } else {
      setGrDetailInvoice(link.invoice)
      setGrDetailOpen(true)
    }
  }

  return (
    <div className="pt-4 flex-1 min-h-0 flex flex-col">
      <div className="bg-card rounded-card shadow-card border border-border overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="px-4 h-12 shrink-0 flex items-center gap-3">
          <div className="flex items-center gap-3 shrink-0">
            <TintIcon icon={History} tint="neutral" size="sm" />
            <h3 className="text-lg font-semibold text-foreground">ประวัติเคลื่อนไหว</h3>
            <Badge variant="neutral-outline">{total.toLocaleString()}</Badge>
          </div>

          <MultiDatePicker
            mode={movementDateMode}
            from={movementDateFrom}
            to={movementDateTo}
            onChange={(m, f, t) => { setMovementDateMode(m); setMovementDateFrom(f); setMovementDateTo(t); setPage(1) }}
            className="shrink-0 ml-auto"
          />
          {(movementDateFrom || movementDateTo) && (
            <Button
              size="lg"
              variant="ghost"
              className="h-9 px-3 shrink-0"
              onClick={() => { setMovementDateFrom(''); setMovementDateTo(''); setPage(1) }}
            >
              ล้างวันที่
            </Button>
          )}

          {/* Type filter popover — replaces inline chips per standard spec.
              Whitelist semantics: empty set = show none, full set = show all.
              Initialized to full so the default state matches the checked UI. */}
          {(() => {
            const allOn = movementTypeFilter.size === ALL_MOVEMENT_TYPES.length
            const toggleAll = () => {
              setMovementTypeFilter(allOn ? new Set() : new Set(ALL_MOVEMENT_TYPES))
              setPage(1)
            }
            // Badge shows count only when filter is actively narrowing the view.
            // Count by group (UI-visible row count) not by raw type count, so
            // merged entries like "หมดอายุ" (expired + near_expiry) read as 1.
            const isNarrowing = movementTypeFilter.size < ALL_MOVEMENT_TYPES.length
            const activeGroupCount = MOVEMENT_FILTER_GROUPS.filter(g =>
              g.types.every(t => movementTypeFilter.has(t))
            ).length
            return (
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="lg" variant="elevated" className="h-9 w-9 p-0 shrink-0 relative" title="ตัวกรองประเภท">
                    <Filter className="size-4" />
                    {isNarrowing && (
                      <span className="absolute -top-1 -right-1 size-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                        {activeGroupCount}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-56">
                  <PopoverHeader className="flex-row items-center justify-between">
                    <PopoverTitle>ประเภทรายการ</PopoverTitle>
                    <Button
                      type="button"
                      variant="elevated"
                      size="xs"
                      onClick={toggleAll}
                      className="rounded-md"
                    >
                      {allOn ? 'ล้างทั้งหมด' : 'ทั้งหมด'}
                    </Button>
                  </PopoverHeader>
                  {MOVEMENT_FILTER_GROUPS.map(group => {
                    const allChecked = group.types.every(t => movementTypeFilter.has(t))
                    return (
                      <label key={group.label} className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                        <Checkbox
                          checked={allChecked}
                          onCheckedChange={v => {
                            setMovementTypeFilter(prev => {
                              const next = new Set(prev)
                              if (v === true) group.types.forEach(t => next.add(t))
                              else group.types.forEach(t => next.delete(t))
                              return next
                            })
                            setPage(1)
                          }}
                        />
                        <span className="text-sm">{group.label}</span>
                      </label>
                    )
                  })}
                </PopoverContent>
              </Popover>
            )
          })()}

          <Button
            size="lg"
            variant="elevated"
            className="h-9 w-9 p-0 shrink-0"
            onClick={reloadMovements}
            disabled={movementsLoading}
            title="รีเฟรช"
          >
            <RotateCcw className="size-4" />
          </Button>
        </div>

        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-[16px] border-r-[16px] border-card">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead className="min-w-32" field="created_at" sort={movementSort} onToggle={toggleMovementSort}>
                  วันเวลา
                </SortableTableHead>
                <TableHead className="min-w-28">ประเภท</TableHead>
                <TableHead className="min-w-32">Lot</TableHead>
                <TableHead className="min-w-28">วันหมดอายุ</TableHead>
                <TableHead className="min-w-28">เปลี่ยนแปลง</TableHead>
                <TableHead className="min-w-28">คงเหลือ</TableHead>
                <TableHead className="min-w-24">ดูข้อมูล</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movementsLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                    กำลังโหลด...
                  </TableCell>
                </TableRow>
              ) : (movements?.length ?? 0) === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-16">
                    <History className="size-10 mx-auto mb-2 opacity-30" />
                    {(movementDateFrom || movementDateTo || movementTypeFilter.size < ALL_MOVEMENT_TYPES.length)
                      ? 'ไม่มีรายการตามตัวกรอง'
                      : 'ยังไม่มีความเคลื่อนไหวสต็อค'}
                  </TableCell>
                </TableRow>
              ) : (movements ?? []).map(m => {
                const meta = MOVEMENT_META[m.movement_type] ?? {
                  label: m.movement_type,
                  variant: 'secondary' as const,
                  icon: Info,
                }
                const Icon = meta.icon
                const isPositive = m.qty_change > 0
                const detailLink = movementDetailLink(m)
                const hasDetail = detailLink != null
                return (
                  <TableRow key={m.id} className="[&_td]:py-2.5 [&_td]:font-medium">
                    <TableCell className="text-sm">{formatDateTime(m.created_at)}</TableCell>
                    <TableCell>
                      <Badge variant={meta.variant} className="rounded-md gap-1">
                        <Icon className="size-3" /> {meta.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm truncate" title={m.lot_number ?? undefined}>{m.lot_number ?? '—'}</TableCell>
                    <TableCell className="text-sm">{m.expiry_date ? formatDate(m.expiry_date) : '—'}</TableCell>
                    <TableCell className={cn(
                      'text-sm font-semibold',
                      isPositive ? 'text-success' : 'text-destructive',
                    )}>
                      {isPositive ? '+' : ''}{m.qty_change.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="text-muted-foreground">{m.qty_before.toLocaleString()}</span>
                      <span className="text-muted-foreground mx-1">→</span>
                      <span className="font-semibold text-foreground">{m.qty_after.toLocaleString()}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {m.note ? (
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                size="icon-lg"
                                variant="elevated"
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
                          <Button size="icon-lg" variant="elevated" disabled title="ไม่มีหมายเหตุ">
                            <StickyNote />
                          </Button>
                        )}
                        {hasDetail ? (
                          <Button
                            size="icon-lg"
                            variant="elevated"
                            onClick={() => openMovementDetail(m)}
                            title={`ดู ${detailLink?.invoice ?? ''}`}
                          >
                            <Info />
                          </Button>
                        ) : (
                          <Button size="icon-lg" variant="elevated" disabled title="ไม่มีบิล/เอกสาร">
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

        <div className="px-5 h-12 bg-card border-t border-border flex items-center justify-between gap-3 text-sm shrink-0">
          {(() => {
            const size = pageSize === 'all' ? Math.max(total, 1) : pageSize
            const start = total === 0 ? 0 : (page - 1) * size + 1
            const end = Math.min(page * size, total)
            const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(total / pageSize))
            return (
              <>
                <div className="flex items-center gap-2 text-muted-foreground shrink-0">
                  <span>จำนวนแถว</span>
                  <Select
                    value={String(pageSize)}
                    onValueChange={v => { setPageSize(v === 'all' ? 'all' : Number(v)); setPage(1) }}
                  >
                    <SelectTrigger variant="elevated" className="h-9 min-w-20">
                      <SelectValue>{pageSize === 'all' ? 'ทั้งหมด' : String(pageSize)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent className="min-w-28">
                      {[50, 100, 250, 500, 'all'].map(opt => (
                        <SelectItem key={String(opt)} value={String(opt)}>
                          {opt === 'all' ? 'ทั้งหมด' : String(opt)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span>
                    {movementsLoading
                      ? 'กำลังโหลด...'
                      : <>แสดง <span className="font-semibold text-foreground">{start.toLocaleString()}-{end.toLocaleString()}</span> / {total.toLocaleString()}</>}
                  </span>
                </div>
                <Pagination page={page} totalPages={totalPages} onPageChange={setPage} className="w-auto" />
              </>
            )
          })()}
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
      <VoidBillDialog
        target={voidTarget}
        onClose={() => setVoidTarget(null)}
        onConfirm={handleVoidBill}
      />
      {overrideVoid.dialog}
      <PurchaseReceiptDialog
        open={grDetailOpen}
        onOpenChange={(o) => {
          setGrDetailOpen(o)
          if (!o) setGrDetailInvoice(null)
        }}
        invoiceNo={grDetailInvoice}
        footerLeft={
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Info className="size-4 shrink-0" />
            <span>สามารถแก้ไขได้ในหน้าประวัติการรับสินค้า</span>
          </div>
        }
      />
    </div>
  )
}
