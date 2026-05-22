import React, { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { getCurrentUserId } from '@/stores/userStore'
import { formatCurrency } from '@/lib/utils'
import type { ManageOutletContext } from './index'
import { Search, PackageX, Package, Boxes, TrendingDown, CalendarX } from 'lucide-react'

type FilterType = 'expired' | 30 | 60 | 90 | 'all'

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

const FILTER_OPTIONS: { label: string; value: FilterType }[] = [
  { label: 'หมดอายุแล้ว', value: 'expired' },
  { label: '≤ 30 วัน',    value: 30 },
  { label: '≤ 60 วัน',    value: 60 },
  { label: '≤ 90 วัน',    value: 90 },
  { label: 'ทั้งหมด',     value: 'all' },
]

// Plain render functions (NOT components — keeps page file free of local JSX components)
function renderDays(days: number | null) {
  if (days === null) return <span className="text-foreground-subtle">—</span>
  if (days < 0) return <span className="text-destructive font-semibold">หมดอายุ {Math.abs(days)} วัน</span>
  if (days === 0) return <span className="text-destructive font-semibold">หมดวันนี้</span>
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

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await (window.api.reports as any).expiringLots({
        filter,
        category_id: categoryId !== '0' ? Number(categoryId) : undefined,
        q: q.trim() || undefined,
      }) as ExpiringLot[]
      setRows(data)
    } catch (e: any) {
      toast(e?.message ?? 'โหลดข้อมูลไม่สำเร็จ', 'error')
    } finally {
      setLoading(false)
    }
  }, [filter, categoryId, q])

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

  const totalLots = rows.length
  const totalQty = rows.reduce((s, r) => s + r.qty_on_hand, 0)
  const totalCost = rows.reduce((s, r) => s + r.total_cost, 0)
  const expiredCount = rows.filter(r => (r.days_remaining ?? 1) < 0).length

  useEffect(() => {
    setSummary([
      {
        label: 'รายการทั้งหมด', value: totalLots.toLocaleString(), icon: Package, tint: 'primary',
        onClick: () => setFilter('all'), isActive: filter === 'all',
      },
      { label: 'คงเหลือรวม', value: totalQty.toLocaleString(), icon: Boxes, tint: 'info-soft' },
      { label: 'มูลค่าทุน', value: formatCurrency(totalCost), icon: TrendingDown, tint: 'warm' },
      {
        label: 'หมดอายุแล้ว',
        value: `${expiredCount} ล็อต`,
        icon: CalendarX,
        tint: expiredCount > 0 ? 'destructive' : 'success',
        onClick: () => setFilter('expired'), isActive: filter === 'expired',
      },
    ])
  }, [totalLots, totalQty, totalCost, expiredCount, filter, setSummary])

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

          {/* Preset filter chips */}
          <div className="flex gap-1 shrink-0">
            {FILTER_OPTIONS.map(opt => (
              <Button
                key={String(opt.value)}
                size="lg"
                className="h-10 px-2"
                variant={filter === opt.value ? 'default' : 'outline'}
                onClick={() => setFilter(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
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
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[240px]">ชื่อสินค้า</TableHead>
                <TableHead className="min-w-20">ล็อต</TableHead>
                <TableHead className="min-w-24">วันหมดอายุ</TableHead>
                <TableHead className="min-w-20">วันคงเหลือ</TableHead>
                <TableHead className="text-right min-w-20">คงเหลือ</TableHead>
                <TableHead className="text-right min-w-24">ทุนรวม</TableHead>
                <TableHead className="min-w-20">หน่วย</TableHead>
                <TableHead className="min-w-32">ผู้จัดจำหน่าย</TableHead>
                <TableHead className="text-center w-18">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-16">กำลังโหลด...</TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-16">
                    <PackageX className="size-10 mx-auto mb-2 opacity-30" />
                    ไม่พบล็อตตามเงื่อนไขที่เลือก
                  </TableCell>
                </TableRow>
              ) : rows.map(lot => {
                const isExpired = (lot.days_remaining ?? 1) < 0
                return (
                  <TableRow key={lot.lot_id} className={isExpired ? 'bg-destructive-soft/30' : ''}>
                    <TableCell className="text-sm font-medium truncate" title={lot.trade_name}>
                      {lot.trade_name}
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {lot.lot_number || <span className="text-foreground-subtle">—</span>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {renderExpiryDate(lot.expiry_date, lot.days_remaining)}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {renderDays(lot.days_remaining)}
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold tabular-nums">
                      {lot.qty_on_hand.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                      {formatCurrency(lot.total_cost)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {lot.unit_name || <span className="text-foreground-subtle">—</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground truncate" title={lot.supplier_name ?? ''}>
                      {lot.supplier_name || <span className="text-foreground-subtle">—</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-center">
                        <Button
                          size="default"
                          variant="destructive2"
                          onClick={() => setConfirmingLot(lot)}
                        >
                          ตัดออก
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        <div className="px-5 h-12 bg-card border-t border-border flex items-center justify-end text-sm shrink-0">
          <span className="text-muted-foreground">
            {loading ? 'กำลังโหลด...' : <>แสดง <span className="font-semibold text-foreground tabular-nums">{totalLots.toLocaleString()}</span> ล็อต</>}
          </span>
        </div>
      </div>

      <ConfirmDialog
        open={confirmingLot !== null}
        onOpenChange={(v) => { if (!v && !expiring) setConfirmingLot(null) }}
        variant="destructive"
        title="ยืนยันการตัดออก"
        description={
          confirmingLot
            ? `ตัดออกล็อต ${confirmingLot.lot_number || '—'} (${confirmingLot.trade_name}) จำนวน ${confirmingLot.qty_on_hand} ${confirmingLot.unit_name || ''} — มูลค่าทุน ฿${formatCurrency(confirmingLot.total_cost)} — การดำเนินการนี้ย้อนกลับไม่ได้`
            : ''
        }
        confirmLabel={expiring ? 'กำลังตัด...' : 'ยืนยันตัดออก'}
        cancelLabel="ยกเลิก"
        onConfirm={handleExpire}
      />
    </>
  )
}
