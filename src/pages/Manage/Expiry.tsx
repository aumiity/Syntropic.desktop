import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, SortableTableHead,
} from '@/components/ui/table'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { useToast } from '@/components/ui/toast'
import { getCurrentUserId } from '@/stores/userStore'
import { formatCurrency } from '@/lib/utils'
import type { ManageOutletContext } from './index'
import { Search, PackageX, ClockAlert } from 'lucide-react'

type FilterType = 'expired' | 30 | 90 | 365
type SortField = 'trade_name' | 'expiry_date' | 'total_cost'
type SortDir = 'asc' | 'desc'

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

export default function ManageExpiryPage() {
  const { toast } = useToast()
  const { setSummary } = useOutletContext<ManageOutletContext>()

  const [filter, setFilter] = useState<FilterType>(90)
  const [categoryId, setCategoryId] = useState<string>('0')
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<ExpiringLot[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)

  const [confirmingLot, setConfirmingLot] = useState<ExpiringLot | null>(null)
  const [expiring, setExpiring] = useState(false)

  const [sort, setSort] = useState<{ by: SortField; dir: SortDir }>({ by: 'expiry_date', dir: 'asc' })
  const toggleSort = (field: SortField) => {
    setSort(s => s.by === field
      ? { by: field, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { by: field, dir: field === 'trade_name' ? 'asc' : 'desc' })
  }

  // Always load all expiring lots; cards filter client-side so all
  // 5 counts stay accurate without re-querying per card click.
  const trackedRows = useMemo(() => rows.filter(r => r.expiry_date !== null), [rows])

  const filteredRows = useMemo(() => {
    if (filter === 'expired') return trackedRows.filter(r => (r.days_remaining ?? 1) < 0)
    return trackedRows.filter(r => (r.days_remaining ?? 9999) <= filter)
  }, [trackedRows, filter])

  const sortedRows = useMemo(() => {
    const arr = [...filteredRows]
    const { by, dir } = sort
    const mul = dir === 'asc' ? 1 : -1
    arr.sort((a, b) => {
      if (by === 'trade_name') {
        return a.trade_name.localeCompare(b.trade_name, 'th') * mul
      }
      if (by === 'expiry_date') {
        // null expiry → always pushed to the end regardless of direction
        if (a.expiry_date === b.expiry_date) return 0
        if (a.expiry_date === null) return 1
        if (b.expiry_date === null) return -1
        return (a.expiry_date < b.expiry_date ? -1 : 1) * mul
      }
      // total_cost
      return (a.total_cost - b.total_cost) * mul
    })
    return arr
  }, [filteredRows, sort])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await (window.api.reports as any).expiringLots({
        filter: 'all',
        category_id: categoryId !== '0' ? Number(categoryId) : undefined,
        q: q.trim() || undefined,
      }) as ExpiringLot[]
      setRows(data)
    } catch (e: any) {
      toast(e?.message ?? 'โหลดข้อมูลไม่สำเร็จ', 'error')
    } finally {
      setLoading(false)
    }
  }, [categoryId, q])

  useEffect(() => {
    window.api.settings.allCategories().then((c: any) => setCategories(c))
  }, [])

  // Debounced auto-load on filter/category/search change
  useEffect(() => {
    const t = setTimeout(() => { load() }, 300)
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
      setRows(r => r.filter(x => x.lot_id !== lot.lot_id))
    } catch (e: any) {
      toast(e?.message ?? 'ตัดออกไม่สำเร็จ', 'error')
    } finally {
      setExpiring(false)
    }
  }

  const totalLots = filteredRows.length
  const totalCost = filteredRows.reduce((s, r) => s + r.total_cost, 0)

  // Filter-bucketed counts (derived from full data; not affected by current filter)
  const count30 = trackedRows.filter(r => (r.days_remaining ?? 9999) <= 30).length
  const count90 = trackedRows.filter(r => (r.days_remaining ?? 9999) <= 90).length
  const count365 = trackedRows.filter(r => (r.days_remaining ?? 9999) <= 365).length
  const countExpired = trackedRows.filter(r => (r.days_remaining ?? 1) < 0).length

  useEffect(() => {
    setSummary([
      {
        label: 'หมดอายุแล้ว', value: countExpired.toLocaleString(), icon: ClockAlert, tint: 'destructive',
        onClick: () => setFilter('expired'), isActive: filter === 'expired',
      },
      {
        label: '≤ 30 วัน', value: count30.toLocaleString(), icon: ClockAlert, tint: 'warm',
        onClick: () => setFilter(30), isActive: filter === 30,
      },
      {
        label: '≤ 90 วัน', value: count90.toLocaleString(), icon: ClockAlert, tint: 'info-soft',
        onClick: () => setFilter(90), isActive: filter === 90,
      },
      {
        label: '≤ 1 ปี', value: count365.toLocaleString(), icon: ClockAlert, tint: 'primary',
        onClick: () => setFilter(365), isActive: filter === 365,
      },
    ])
  }, [count30, count90, count365, countExpired, filter, setSummary])

  // Clear slot summary on unmount — prevents stale cards leaking into the next
  // tab (esp. NegativeStock which has no summary of its own to overwrite).
  useEffect(() => {
    return () => setSummary(null)
  }, [setSummary])

  return (
    <>
      {/* List card */}
      <div className="flex flex-1 flex-col min-h-0 bg-card rounded-card shadow-card overflow-hidden">
        <div className="px-2 h-14 shrink-0 flex items-center gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="ชื่อสินค้า, Lot No..."
              className="h-10 pl-9 rounded-lg text-sm bg-input"
            />
          </div>

          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="h-10 w-44 shrink-0">
              <SelectValue placeholder="ทุกหมวดหมู่" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">ทุกหมวดหมู่</SelectItem>
              {categories.map(c => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-8 border-r-8 border-card">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead field="trade_name" sort={sort} onToggle={toggleSort} className="min-w-[220px]">ชื่อสินค้า</SortableTableHead>
                <TableHead className="min-w-20">ล็อต</TableHead>
                <SortableTableHead field="expiry_date" sort={sort} onToggle={toggleSort} className="min-w-24">วันหมดอายุ</SortableTableHead>
                <TableHead className="text-center min-w-24">วันคงเหลือ</TableHead>
                <TableHead className="text-right min-w-16">คงเหลือ</TableHead>
                <TableHead className="min-w-16">หน่วย</TableHead>
                <SortableTableHead field="total_cost" align="right" sort={sort} onToggle={toggleSort} className="min-w-24">ทุนรวม</SortableTableHead>
                <TableHead className="min-w-[140px]">ผู้จัดจำหน่าย</TableHead>
                <TableHead className="text-center min-w-20">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-16">กำลังโหลด...</TableCell>
                </TableRow>
              ) : sortedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-16">
                    <PackageX className="size-10 mx-auto mb-2 opacity-30" />
                    ไม่พบล็อตตามเงื่อนไขที่เลือก
                  </TableCell>
                </TableRow>
              ) : sortedRows.map(lot => {
                const isExpired = (lot.days_remaining ?? 1) < 0
                return (
                  <TableRow key={lot.lot_id} className={isExpired ? 'bg-destructive-soft/30' : ''}>
                    <TableCell className="max-w-[220px] text-sm font-medium truncate" title={lot.trade_name}>
                      {lot.trade_name}
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {lot.lot_number || <span className="text-foreground-subtle">—</span>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {renderExpiryDate(lot.expiry_date, lot.days_remaining)}
                    </TableCell>
                    <TableCell className="text-center text-sm tabular-nums">
                      {renderDays(lot.days_remaining)}
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold tabular-nums">
                      {lot.qty_on_hand.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {lot.unit_name || <span className="text-foreground-subtle">—</span>}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                      {formatCurrency(lot.total_cost)}
                    </TableCell>
                    <TableCell className="max-w-[160px] text-sm text-muted-foreground truncate" title={lot.supplier_name ?? ''}>
                      {lot.supplier_name || <span className="text-foreground-subtle">—</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-center">
                        <Button
                          size="icon-lg"
                          variant="destructive2"
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

        <div className="px-5 h-12 bg-card border-t border-border flex items-center justify-between text-sm shrink-0">
          <span className="text-muted-foreground">
            มูลค่าทั้งหมด <span className="font-semibold text-foreground tabular-nums ml-1">฿{formatCurrency(totalCost)}</span>
          </span>
          <span className="text-muted-foreground">
            {loading ? 'กำลังโหลด...' : <>แสดง <span className="font-semibold text-foreground tabular-nums">{totalLots.toLocaleString()}</span> รายการ</>}
          </span>
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
                <dd className="font-mono">{confirmingLot.lot_number || '—'}</dd>
                <dt className="text-muted-foreground">จำนวน</dt>
                <dd className="tabular-nums">{confirmingLot.qty_on_hand.toLocaleString()} {confirmingLot.unit_name || ''}</dd>
                <dt className="text-muted-foreground">มูลค่าทุน</dt>
                <dd className="tabular-nums">฿{formatCurrency(confirmingLot.total_cost)}</dd>
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
