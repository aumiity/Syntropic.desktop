import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { getCurrentUserId } from '@/stores/userStore'
import { formatCurrency } from '@/lib/utils'
import { Search, PackageX, AlertTriangle } from 'lucide-react'

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

function DaysCell({ days }: { days: number | null }) {
  if (days === null) return <span className="text-muted-foreground">—</span>
  if (days < 0)
    return <span className="text-destructive font-semibold">หมดอายุ {Math.abs(days)} วัน</span>
  if (days === 0)
    return <span className="text-destructive font-semibold">หมดวันนี้</span>
  if (days <= 30)
    return <span className="text-destructive font-medium">{days} วัน</span>
  if (days <= 60)
    return <span className="text-warning-strong font-medium">{days} วัน</span>
  if (days <= 90)
    return <span className="text-warning">{days} วัน</span>
  return <span className="text-muted-foreground">{days} วัน</span>
}

function ExpiryDateCell({ date, days }: { date: string | null; days: number | null }) {
  if (!date) return <span className="text-muted-foreground">—</span>
  const d = new Date(date)
  const formatted = d.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const isExpired = (days ?? 1) < 0
  return (
    <span className={isExpired ? 'text-destructive font-medium' : ''}>
      {formatted}
    </span>
  )
}

export default function ReportsExpiryPage() {
  const { toast } = useToast()

  const [filter, setFilter] = useState<FilterType>(90)
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<ExpiringLot[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)

  // Modal confirm state — stores the lot pending confirmation
  const [confirmingLot, setConfirmingLot] = useState<ExpiringLot | null>(null)
  const [expiring, setExpiring] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await (window.api.reports as any).expiringLots({
        filter,
        category_id: categoryId || undefined,
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

  useEffect(() => { load() }, [filter, categoryId])

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); load() }

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

  // Summary stats
  const totalLots = rows.length
  const totalQty = rows.reduce((s, r) => s + r.qty_on_hand, 0)
  const totalCost = rows.reduce((s, r) => s + r.total_cost, 0)
  const expiredCount = rows.filter(r => (r.days_remaining ?? 1) < 0).length

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0 px-6 py-4 border-b border-border">
        <div>
          <h1 className="text-xl font-semibold">รายงานวันหมดอายุ</h1>
          <p className="text-sm text-muted-foreground">ล็อตสินค้าที่ใกล้หมดอายุและหมดอายุแล้ว</p>
        </div>
        {expiredCount > 0 && (
          <div className="flex items-center gap-2 bg-destructive-soft border border-destructive/30 rounded-lg px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>หมดอายุแล้ว <span className="font-bold">{expiredCount}</span> ล็อต</span>
          </div>
        )}
      </div>

      {/* Filter bar */}
      <div className="px-6 py-3 border-b border-border bg-muted/30 shrink-0">
        <div className="flex flex-wrap gap-2 items-center">
          {/* Preset filter chips */}
          <div className="flex gap-1">
            {FILTER_OPTIONS.map(opt => (
              <Button key={String(opt.value)} size="sm" variant="outline"
                onClick={() => setFilter(opt.value)}
                className={`h-8 px-3 text-xs transition-colors ${
                  filter === opt.value
                    ? 'bg-primary text-primary-foreground border-primary hover:bg-primary'
                    : 'border-border'
                }`}>
                {opt.label}
              </Button>
            ))}
          </div>

          <div className="w-px h-5 bg-border mx-1" />

          {/* Category */}
          <div className="relative">
            <select
              value={categoryId}
              onChange={e => setCategoryId(e.target.value ? Number(e.target.value) : '')}
              className="h-8 rounded-md border border-input bg-background px-3 pr-8 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">ทุกหมวดหมู่</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Search */}
          <form onSubmit={handleSearch} className="flex gap-1.5 flex-1 min-w-[200px]">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input value={q} onChange={e => setQ(e.target.value)}
                placeholder="ชื่อสินค้า, Lot No..." className="pl-8 h-8 text-sm" />
            </div>
            <Button type="submit" size="sm" variant="outline" className="h-8">ค้นหา</Button>
          </form>
        </div>
      </div>

      {/* Summary row */}
      {rows.length > 0 && (
        <div className="px-6 py-2.5 border-b border-border bg-muted/20 shrink-0 flex gap-6 text-sm">
          <span className="text-muted-foreground">
            พบ <span className="font-semibold text-foreground">{totalLots}</span> ล็อต
          </span>
          <span className="text-muted-foreground">
            รวมคงเหลือ <span className="font-semibold text-foreground tabular-nums">{totalQty.toLocaleString()}</span> หน่วย
          </span>
          <span className="text-muted-foreground">
            มูลค่าทุน <span className="font-semibold text-destructive tabular-nums">฿{formatCurrency(totalCost)}</span>
          </span>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">กำลังโหลด...</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
            <PackageX className="w-12 h-12 opacity-30" />
            <p className="text-sm">ไม่พบล็อตตามเงื่อนไขที่เลือก</p>
          </div>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted">
              <TableRow className="hover:bg-muted">
                <TableHead className="text-xs font-bold text-muted-foreground">ชื่อสินค้า</TableHead>
                <TableHead className="text-xs font-bold text-muted-foreground">ล็อต</TableHead>
                <TableHead className="text-xs font-bold text-muted-foreground">วันหมดอายุ</TableHead>
                <TableHead className="text-xs font-bold text-muted-foreground">วันคงเหลือ</TableHead>
                <TableHead className="text-right text-xs font-bold text-muted-foreground">คงเหลือ</TableHead>
                <TableHead className="text-right text-xs font-bold text-muted-foreground">ทุนรวม</TableHead>
                <TableHead className="text-xs font-bold text-muted-foreground">หน่วย</TableHead>
                <TableHead className="text-xs font-bold text-muted-foreground">ผู้จัดจำหน่าย</TableHead>
                <TableHead className="text-center text-xs font-bold text-muted-foreground">ตัดออก</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(lot => {
                const isExpired = (lot.days_remaining ?? 1) < 0
                return (
                  <TableRow key={lot.lot_id}
                    className={`hover:bg-surface-hover ${isExpired ? 'bg-destructive-soft/30' : ''}`}>
                    <TableCell className="font-medium text-sm">{lot.trade_name}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">{lot.lot_number || '—'}</TableCell>
                    <TableCell className="text-sm">
                      <ExpiryDateCell date={lot.expiry_date} days={lot.days_remaining} />
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      <DaysCell days={lot.days_remaining} />
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{lot.qty_on_hand}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      ฿{formatCurrency(lot.total_cost)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{lot.unit_name || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{lot.supplier_name || '—'}</TableCell>
                    <TableCell className="text-center">
                      <Button size="sm" variant="outline"
                        onClick={() => setConfirmingLot(lot)}
                        className="h-7 px-2 text-xs border-destructive/40 text-destructive hover:bg-destructive-soft hover:border-destructive/60">
                        ตัดออก
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
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
    </div>
  )
}
