import React, { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { SearchInput } from '@/components/ui/input'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, SortableTableHead,
} from '@/components/ui/table'
import { Pagination, type PageSize } from '@/components/ui/pagination'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Popover, PopoverTrigger, PopoverContent, PopoverHeader, PopoverTitle } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/components/ui/toast'
import { getCurrentUserId } from '@/stores/userStore'
import { usePagePrefs } from '@/hooks/usePagePrefs'
import { formatCurrency } from '@/lib/utils'
import type { ManageOutletContext } from './index'
import { PackageX, ClockAlert, Settings2, CalendarClock, Filter, Check } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type FilterType = 'expired' | 30 | 90 | 180
type SortField = 'trade_name' | 'expiry_date' | 'total_cost'
type SortDir = 'asc' | 'desc'

interface ExpiryCounts { expired: number; d30: number; d90: number; d180: number }
const EMPTY_COUNTS: ExpiryCounts = { expired: 0, d30: 0, d90: 0, d180: 0 }

interface ExpiringLot {
  lot_id: number
  lot_number: string
  expiry_date: string | null
  qty_on_hand: number
  cost_price: number
  total_cost: number
  product_id: number
  trade_name: string
  unit_name: string
  category_name: string | null
  supplier_name: string | null
  days_remaining: number | null
}

interface Category { id: number; name: string }

// Plain render functions (NOT components — keeps page file free of local JSX components)
function renderDays(days: number | null) {
  if (days === null) return <span className="text-foreground-subtle">—</span>
  if (days <= 0) return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center text-destructive cursor-help">
          <ClockAlert className="size-5" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" align="center">
        <div className="font-semibold text-destructive">หมดอายุแล้ว</div>
        <div className="text-muted-foreground font-normal">
          ล็อตนี้เกินวันหมดอายุไปแล้ว
        </div>
      </TooltipContent>
    </Tooltip>
  )
  if (days <= 30) return <span className="text-destructive font-medium">{days} วัน</span>
  if (days <= 60) return <span className="text-warning-strong font-medium">{days} วัน</span>
  if (days <= 90) return <span className="text-warning">{days} วัน</span>
  return <span className="text-muted-foreground">{days} วัน</span>
}

function renderExpiryDate(date: string | null, days: number | null) {
  if (!date) return <span className="text-foreground-subtle">—</span>
  const formatted = new Date(date).toLocaleDateString('th-TH', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
  const isExpired = (days ?? 1) < 0
  return <span className={isExpired ? 'text-destructive font-medium' : 'text-sm'}>{formatted}</span>
}

interface ExpiryPrefs {
  pageSize: PageSize
  sort: { by: SortField; dir: SortDir }
  showColLot: boolean
  showColExpiry: boolean
  showColDays: boolean
  showColQty: boolean
  showColUnit: boolean
  showColCost: boolean
  showColSupplier: boolean
}

const EXPIRY_DEFAULTS: ExpiryPrefs = {
  pageSize: 50,
  sort: { by: 'expiry_date', dir: 'asc' },
  showColLot: true,
  showColExpiry: true,
  showColDays: false,
  showColQty: true,
  showColUnit: true,
  showColCost: true,
  showColSupplier: false,
}

export default function ManageExpiryPage() {
  const { toast } = useToast()
  const { setSummary } = useOutletContext<ManageOutletContext>()

  const [prefs, setPrefs] = usePagePrefs<ExpiryPrefs>('expiry', EXPIRY_DEFAULTS)

  // filter (90/30/180/expired) and categoryId are NOT persisted — they're
  // primary navigation in this view and reset per session.
  const [filter, setFilter] = useState<FilterType>(90)
  const [categoryId, setCategoryId] = useState<string>('0')
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<ExpiringLot[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)

  const [confirmingLot, setConfirmingLot] = useState<ExpiringLot | null>(null)
  const [expiring, setExpiring] = useState(false)

  // Column visibility (ชื่อสินค้า + จัดการ always shown) — persisted
  const showColLot = prefs.showColLot
  const showColExpiry = prefs.showColExpiry
  const showColDays = prefs.showColDays
  const showColQty = prefs.showColQty
  const showColUnit = prefs.showColUnit
  const showColCost = prefs.showColCost
  const showColSupplier = prefs.showColSupplier

  // Server-side pagination + sort. Filter switching, sort, and search all
  // refetch — paginated payload keeps the page snappy even at 10k+ lots.
  const [page, setPage] = useState(1)
  const pageSize = prefs.pageSize
  const setPageSize = (v: PageSize) => setPrefs({ pageSize: v })
  const [total, setTotal] = useState(0)
  const [totalCost, setTotalCost] = useState(0)
  const [counts, setCounts] = useState<ExpiryCounts>(EMPTY_COUNTS)
  const totalPages = Math.ceil(total / (pageSize as number))

  const sort = prefs.sort
  const setSort = (next: { by: SortField; dir: SortDir } | ((prev: { by: SortField; dir: SortDir }) => { by: SortField; dir: SortDir })) => {
    setPrefs({ sort: typeof next === 'function' ? next(prefs.sort) : next })
  }
  const toggleSort = (field: SortField) => {
    setSort(s => s.by === field
      ? { by: field, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { by: field, dir: field === 'trade_name' ? 'asc' : 'desc' })
  }

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const res = await (window.api.reports as any).expiringLots({
        filter,
        category_id: categoryId !== '0' ? Number(categoryId) : undefined,
        q: q.trim() || undefined,
        page: p,
        limit: pageSize,
        sort_by: sort.by,
        sort_dir: sort.dir.toUpperCase(),
      }) as { rows: ExpiringLot[]; total: number; total_cost: number; counts: ExpiryCounts }
      setRows(res.rows ?? [])
      setTotal(res.total ?? 0)
      setTotalCost(res.total_cost ?? 0)
      setCounts(res.counts ?? EMPTY_COUNTS)
      setPage(p)
    } catch (e: any) {
      toast(e?.message ?? 'โหลดข้อมูลไม่สำเร็จ', 'error')
    } finally {
      setLoading(false)
    }
  }, [filter, categoryId, q, pageSize, sort])

  useEffect(() => {
    window.api.settings.allCategories().then((c: any) => setCategories(c))
  }, [])

  // Debounced auto-load on filter/category/search/sort/pageSize change. Resets
  // to page 1 — switching filter on page 5 would otherwise show "no data" if
  // the new set is smaller.
  useEffect(() => {
    const t = setTimeout(() => { load(1) }, 300)
    return () => clearTimeout(t)
  }, [load])

  const handleExpire = async () => {
    const lot = confirmingLot
    if (!lot) return
    setExpiring(true)
    try {
      const res = await window.api.products.expireLot(lot.lot_id, getCurrentUserId()) as { classification: 'expired' | 'near_expiry' }
      const label = res?.classification === 'near_expiry' ? 'ใกล้หมดอายุ' : 'หมดอายุ'
      toast(`ตัดออกล็อต ${lot.lot_number} (${lot.trade_name}) — ${label} สำเร็จ`, 'success')
      setConfirmingLot(null)
      load(page)
    } catch (e: any) {
      toast(e?.message ?? 'ตัดออกไม่สำเร็จ', 'error')
    } finally {
      setExpiring(false)
    }
  }

  // Passive MetricCard snapshot of the q/category set. The time-range filter
  // lives in the filter strip's Filter popover (no onClick → ManageLayout
  // renders MetricCard instead of the clickable StatCard).
  useEffect(() => {
    setSummary([
      { label: 'หมดอายุแล้ว', value: counts.expired.toLocaleString(), icon: ClockAlert, tint: 'destructive2', sub: 'ล็อต', subClassName: 'text-base text-foreground' },
      { label: '≤ 30 วัน',     value: counts.d30.toLocaleString(),     icon: ClockAlert, tint: 'warm',         sub: 'ล็อต', subClassName: 'text-base text-foreground' },
      { label: '≤ 90 วัน',     value: counts.d90.toLocaleString(),     icon: ClockAlert, tint: 'info-soft',    sub: 'ล็อต', subClassName: 'text-base text-foreground' },
      { label: '≤ 180 วัน',    value: counts.d180.toLocaleString(),    icon: ClockAlert, tint: 'primary',      sub: 'ล็อต', subClassName: 'text-base text-foreground' },
    ])
  }, [counts, setSummary])

  // Clear slot summary on unmount — prevents stale cards leaking into the next
  // tab (esp. NegativeStock which has no summary of its own to overwrite).
  useEffect(() => {
    return () => setSummary(null)
  }, [setSummary])

  return (
    <>
      {/* List card */}
      <div className="flex flex-1 flex-col min-h-0 bg-card rounded-card shadow-card border border-border overflow-hidden">
        <div className="px-4 h-14 shrink-0 flex items-center gap-3">
          <div className="flex items-center gap-3 shrink-0">
            <span className="grid place-items-center size-8 rounded-lg border border-border bg-card shadow-sm">
              <CalendarClock className="size-4 text-foreground" />
            </span>
            <h3 className="text-lg font-semibold text-foreground">ใกล้หมดอายุ</h3>
            <Badge variant="neutral-outline">{total.toLocaleString()}</Badge>
          </div>

          <SearchInput
            variant="elevated"
            wrapperClassName="w-72 shrink-0 ml-auto"
            className="h-9"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="ชื่อสินค้า, Lot No..."
          />

          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger variant="elevated" className="h-9 w-44 shrink-0">
              <SelectValue placeholder="ทุกหมวดหมู่" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">ทุกหมวดหมู่</SelectItem>
              {categories.map(c => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Time-range filter popover — was previously the clickable summary cards */}
          {(() => {
            const RANGE_OPTIONS: { value: FilterType; label: string }[] = [
              { value: 'expired', label: 'หมดอายุแล้ว' },
              { value: 30,        label: '≤ 30 วัน' },
              { value: 90,        label: '≤ 90 วัน' },
              { value: 180,       label: '≤ 180 วัน' },
            ]
            return (
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="lg" variant="elevated" className="h-9 w-9 p-0 shrink-0" title="ตัวกรองช่วงเวลา">
                    <Filter className="size-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-56 p-1 gap-0">
                  <PopoverHeader className="px-2">
                    <PopoverTitle>ช่วงเวลา</PopoverTitle>
                  </PopoverHeader>
                  {RANGE_OPTIONS.map(o => (
                    <button
                      key={String(o.value)}
                      type="button"
                      onClick={() => setFilter(o.value)}
                      className={cn(
                        'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors',
                        filter === o.value ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted',
                      )}
                    >
                      <Check className={cn('size-4', filter === o.value ? 'opacity-100' : 'opacity-0')} />
                      <span className="flex-1 text-left">{o.label}</span>
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            )
          })()}

          <Popover>
            <PopoverTrigger asChild>
              <Button size="lg" variant="elevated" className="h-9 w-9 p-0 shrink-0" title="จัดการตาราง">
                <Settings2 className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56">
              <PopoverHeader>
                <PopoverTitle>จัดการตาราง</PopoverTitle>
              </PopoverHeader>
              <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={showColLot} onCheckedChange={v => setPrefs({ showColLot: v === true })} />
                <span className="text-sm">ล็อต</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={showColExpiry} onCheckedChange={v => setPrefs({ showColExpiry: v === true })} />
                <span className="text-sm">วันหมดอายุ</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={showColDays} onCheckedChange={v => setPrefs({ showColDays: v === true })} />
                <span className="text-sm">วันคงเหลือ</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={showColQty} onCheckedChange={v => setPrefs({ showColQty: v === true })} />
                <span className="text-sm">คงเหลือ</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={showColUnit} onCheckedChange={v => setPrefs({ showColUnit: v === true })} />
                <span className="text-sm">หน่วย</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={showColCost} onCheckedChange={v => setPrefs({ showColCost: v === true })} />
                <span className="text-sm">ทุนรวม</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={showColSupplier} onCheckedChange={v => setPrefs({ showColSupplier: v === true })} />
                <span className="text-sm">ผู้จัดจำหน่าย</span>
              </label>
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-[16px] border-r-[16px] border-card">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead field="trade_name" sort={sort} onToggle={toggleSort} className="min-w-[220px]">ชื่อสินค้า</SortableTableHead>
                {showColLot && <TableHead className="min-w-20">ล็อต</TableHead>}
                {showColExpiry && <SortableTableHead field="expiry_date" sort={sort} onToggle={toggleSort} className="min-w-20">วันหมดอายุ</SortableTableHead>}
                {showColDays && <TableHead className="text-center min-w-12 w-12">วันคงเหลือ</TableHead>}
                {showColQty && <TableHead className="text-right min-w-14">คงเหลือ</TableHead>}
                {showColUnit && <TableHead className="min-w-8">หน่วย</TableHead>}
                {showColCost && <SortableTableHead field="total_cost" align="right" sort={sort} onToggle={toggleSort} className="min-w-14">ทุนรวม</SortableTableHead>}
                {showColSupplier && <TableHead className="min-w-[140px]">ผู้จัดจำหน่าย</TableHead>}
                <TableHead className="text-center min-w-14">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={2 + (showColLot ? 1 : 0) + (showColExpiry ? 1 : 0) + (showColDays ? 1 : 0) + (showColQty ? 1 : 0) + (showColUnit ? 1 : 0) + (showColCost ? 1 : 0) + (showColSupplier ? 1 : 0)} className="text-center text-muted-foreground py-16">กำลังโหลด...</TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2 + (showColLot ? 1 : 0) + (showColExpiry ? 1 : 0) + (showColDays ? 1 : 0) + (showColQty ? 1 : 0) + (showColUnit ? 1 : 0) + (showColCost ? 1 : 0) + (showColSupplier ? 1 : 0)} className="text-center text-muted-foreground py-16">
                    <PackageX className="size-10 mx-auto mb-2 opacity-30" />
                    ไม่พบล็อตตามเงื่อนไขที่เลือก
                  </TableCell>
                </TableRow>
              ) : rows.map(lot => {
                const isExpired = (lot.days_remaining ?? 1) < 0
                return (
                  <TableRow key={lot.lot_id} className={cn('[&_td]:py-2.5 [&_td]:font-medium', isExpired && 'bg-destructive-soft/30')}>
                    <TableCell className="max-w-[220px] text-sm truncate" title={lot.trade_name}>
                      {lot.trade_name}
                    </TableCell>
                    {showColLot && (
                      <TableCell className="text-sm text-muted-foreground">
                        {lot.lot_number || <span className="text-foreground-subtle">—</span>}
                      </TableCell>
                    )}
                    {showColExpiry && (
                      <TableCell className="text-sm">
                        {renderExpiryDate(lot.expiry_date, lot.days_remaining)}
                      </TableCell>
                    )}
                    {showColDays && (
                      <TableCell className="text-center text-sm">
                        {renderDays(lot.days_remaining)}
                      </TableCell>
                    )}
                    {showColQty && (
                      <TableCell className="text-right text-sm font-semibold">
                        {lot.qty_on_hand.toLocaleString()}
                      </TableCell>
                    )}
                    {showColUnit && (
                      <TableCell className="text-sm text-muted-foreground">
                        {lot.unit_name || <span className="text-foreground-subtle">—</span>}
                      </TableCell>
                    )}
                    {showColCost && (
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {formatCurrency(lot.total_cost)}
                      </TableCell>
                    )}
                    {showColSupplier && (
                      <TableCell className="max-w-[160px] text-sm text-muted-foreground truncate" title={lot.supplier_name ?? ''}>
                        {lot.supplier_name || <span className="text-foreground-subtle">—</span>}
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex justify-center">
                        <Button
                          size="icon-lg"
                          variant="elevated"
                          title="ตัดออก"
                          onClick={() => setConfirmingLot(lot)}
                        >
                          <PackageX />
                        </Button>
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
            const size = pageSize as number
            const start = total === 0 ? 0 : (page - 1) * size + 1
            const end = Math.min(page * size, total)
            return (
              <div className="flex items-center gap-2 text-muted-foreground shrink-0">
                <span>จำนวนแถว</span>
                <Select value={String(pageSize)} onValueChange={v => setPageSize(Number(v))}>
                  <SelectTrigger variant="elevated" className="h-9 min-w-20">
                    <SelectValue>{String(pageSize)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent className="min-w-28">
                    {[50, 100, 250, 500].map(opt => (
                      <SelectItem key={opt} value={String(opt)}>{String(opt)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span>
                  {loading
                    ? 'กำลังโหลด...'
                    : <>แสดง <span className="font-semibold text-foreground">{start.toLocaleString()}-{end.toLocaleString()}</span></>}
                </span>
                <span className="ml-3">
                  มูลค่าทั้งหมด <span className="font-semibold text-foreground ml-1">฿{formatCurrency(totalCost)}</span>
                </span>
              </div>
            )
          })()}
          <Pagination page={page} totalPages={totalPages} onPageChange={load} className="w-auto" />
        </div>
      </div>

      <ConfirmDialog
        open={confirmingLot !== null}
        onOpenChange={(v) => { if (!v && !expiring) setConfirmingLot(null) }}
        variant="destructive"
        title="ยืนยันการตัดออก"
        description={confirmingLot && (
          <div className="space-y-3">
            <div className="rounded-lg bg-muted px-3 py-2.5 space-y-1.5">
              <div className="text-sm font-semibold text-foreground">{confirmingLot.trade_name}</div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted-foreground">ล็อต</dt>
                <dd>{confirmingLot.lot_number || '—'}</dd>
                <dt className="text-muted-foreground">จำนวน</dt>
                <dd className="">{confirmingLot.qty_on_hand.toLocaleString()} {confirmingLot.unit_name || ''}</dd>
                <dt className="text-muted-foreground">มูลค่าทุน</dt>
                <dd className="">฿{formatCurrency(confirmingLot.total_cost)}</dd>
              </dl>
            </div>
            <p className="text-destructive font-medium">การดำเนินการนี้ย้อนกลับไม่ได้</p>
          </div>
        )}
        confirmLabel={expiring ? 'กำลังตัด...' : 'ยืนยันตัดออก'}
        cancelLabel="ยกเลิก"
        onConfirm={handleExpire}
      />
    </>
  )
}
