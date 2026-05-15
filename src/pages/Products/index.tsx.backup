import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Pagination } from '@/components/ui/pagination'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { DateInput } from '@/components/ui/date-input'
import { useToast } from '@/components/ui/toast'
import { getCurrentUserId } from '@/stores/userStore'
import { formatCurrency } from '@/lib/utils'
import { PageHeader } from '@/components/layout/PageHeader'
import { StatCard } from '@/components/ui/card'
import type { Product, ProductCategory, DrugType, ProductLot } from '@/types'
import {
  Search, Plus, Edit2, AlertTriangle, Package, PackageX,
  Boxes, ArrowUpCircle, ArrowDownCircle, Minus,
  ArrowUp, ArrowDown, ArrowUpDown,
  Layers, FolderInput, Info,
} from 'lucide-react'

const QUICK_REASONS = [
  'นับสต็อกประจำเดือน',
  'ปรับยอดให้ตรงระบบ',
  'สินค้าหมดอายุ',
  'สินค้าเสียหาย',
  'สินค้าสูญหาย',
]

type SortField = 'trade_name' | 'unit_name' | 'cost_price' | 'price_retail' | 'profit' | 'stock_qty'
type SortDir = 'asc' | 'desc'
interface SortState { by: SortField; dir: SortDir }

interface ProductRow extends Product {
  category_name?: string
  drug_type_name?: string
  unit_name?: string
  stock_qty: number
}

export default function ProductsPage() {
  const navigate = useNavigate()
  const { toast } = useToast()

  const [rows, setRows] = useState<ProductRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  // Filters
  const [q, setQ] = useState('')
  const [categoryId, setCategoryId] = useState<number>(0)
  const [drugTypeId, setDrugTypeId] = useState<number>(0)
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all')
  const [showDisabled, setShowDisabled] = useState(false)
  const [sort, setSort] = useState<SortState>({ by: 'trade_name', dir: 'asc' })

  // Dropdown data
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [drugTypes, setDrugTypes] = useState<DrugType[]>([])

  // Adjust stock dialog — operator types target stock; system computes delta.
  // Direction (decrease/increase) drives the rest of the form:
  //   decrease → auto-FEFO across lots, preview shows which lots get hit
  //   increase → operator picks new-lot or merge-into-existing-lot mode
  const [adjustProduct, setAdjustProduct] = useState<ProductRow | null>(null)
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

  // Global stock health counts. `out`/`low` respect current text + category +
  // drug-type filter (but not the stockFilter clickable card — that's the filter
  // the cards drive). `total_all` is the absolute product count, never filtered.
  const [allStats, setAllStats] = useState({ out: 0, low: 0, total_all: 0 })

  const limit = 50
  const totalPages = Math.ceil(total / limit)

  useEffect(() => {
    loadDropdowns()
  }, [])

  // Live search: debounce text + reactive filters.
  // Sort changes also trigger reload but debounced so rapid clicks coalesce.
  useEffect(() => {
    const t = setTimeout(() => {
      load(1)
      window.api.products.stockStats({
        q: q.trim() || undefined,
        category_id: categoryId || undefined,
        drug_type_id: drugTypeId || undefined,
        include_disabled: showDisabled,
      }).then((s: any) => setAllStats(s ?? { out: 0, low: 0, total_all: 0 }))
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, categoryId, drugTypeId, stockFilter, showDisabled, sort])

  const loadDropdowns = async () => {
    const [cats, dts] = await Promise.all([
      window.api.settings.allCategories(),
      window.api.settings.allDrugTypes(),
    ])
    setCategories(cats as ProductCategory[])
    setDrugTypes(dts as DrugType[])
  }

  const load = useCallback(async (p = page) => {
    setLoading(true)
    try {
      const res = await window.api.products.list({
        q: q.trim() || undefined,
        category_id: categoryId || undefined,
        drug_type_id: drugTypeId || undefined,
        page: p,
        sort_by: sort.by,
        sort_dir: sort.dir,
        stock_filter: stockFilter,
        include_disabled: showDisabled,
      }) as any
      setRows(res.rows)
      setTotal(res.total)
      setPage(p)
    } finally {
      setLoading(false)
    }
  }, [q, categoryId, drugTypeId, page, sort, stockFilter, showDisabled])

  const toggleSort = (field: SortField) => {
    setSort(s => s.by === field
      ? { by: field, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { by: field, dir: 'asc' })
  }

  // Click "ใกล้หมด" / "หมดสต็อก" card → toggle that filter on/off.
  // Click "สินค้าทั้งหมด" → always clear back to 'all'.
  const toggleStockFilter = (next: 'all' | 'low' | 'out') => {
    setStockFilter(curr => (next === 'all' ? 'all' : curr === next ? 'all' : next))
  }

  // --- Adjust stock ---
  const resetAdjustForm = () => {
    setAdjustNote('')
    setIncreaseMode('new')
    setNewLotNumber('')
    setNewLotExpiry('')
    setNewLotCost('0')
    setTargetLotId(null)
    setAddedCost('0')
  }

  const openAdjust = async (p: ProductRow) => {
    setAdjustProduct(p)
    setAdjustTarget(String(p.stock_qty))
    resetAdjustForm()
    setProductLots([])
    setLotsLoading(true)
    try {
      const lots = await window.api.products.getLots(p.id) as ProductLot[]
      const active = (lots ?? []).filter(l => !l.is_cancelled)
      setProductLots(active)
      // Default target lot for "merge into existing" mode = most recent open lot.
      const open = active.filter(l => !l.is_closed && l.qty_on_hand > 0)
      const defaultTarget = open.length > 0
        ? open[open.length - 1].id  // last by created order = most recent
        : active.length > 0 ? active[active.length - 1].id : null
      setTargetLotId(defaultTarget)
    } finally {
      setLotsLoading(false)
    }
  }

  // Compute delta = target − current. Returns null when target is empty / invalid.
  const adjustDelta = (() => {
    if (!adjustProduct) return null
    const s = adjustTarget.trim()
    if (s === '') return null
    const n = parseFloat(s)
    if (Number.isNaN(n) || n < 0) return null
    return n - adjustProduct.stock_qty
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

  // Available lots for "merge into existing" picker — show non-cancelled ones.
  // Closed lots are also offered (reopening is supported by the backend),
  // but closed/zero-stock lots are sorted to the bottom for clarity.
  const mergeCandidates = useMemo(() => {
    return productLots
      .filter(l => !l.is_cancelled)
      .sort((a, b) => {
        const aClosed = a.is_closed ? 1 : 0
        const bClosed = b.is_closed ? 1 : 0
        if (aClosed !== bClosed) return aClosed - bClosed
        return b.id - a.id  // newest first within each group
      })
  }, [productLots])

  // Selected target lot details — rendered beside the dropdown so the dropdown
  // itself only shows lot_number (cleaner closed state).
  const selectedTargetLot = useMemo(() => {
    if (!targetLotId) return null
    return productLots.find(l => l.id === targetLotId) ?? null
  }, [targetLotId, productLots])

  // Stock breakdown by open lot — shown at top of the modal.
  const openLotsSummary = useMemo(() => {
    return productLots
      .filter(l => !l.is_closed && l.qty_on_hand > 0)
      .sort((a, b) => {
        const ae = a.expiry_date || '9999-99-99'
        const be = b.expiry_date || '9999-99-99'
        return ae.localeCompare(be) || a.id - b.id
      })
  }, [productLots])

  const handleAdjust = async () => {
    if (!adjustProduct) return
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
      await window.api.products.adjustStock(adjustProduct.id, payload)
      toast({ title: 'ปรับสต็อกสำเร็จ', variant: 'success' })
      setAdjustProduct(null)
      load(page)
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

  const renderStockCell = (qty: number, reorder: number) => {
    if (qty <= 0) {
      return (
        <Badge variant="destructive" className="rounded-lg gap-1.5">
          <span className="size-1.5 rounded-full bg-white/90" />
          หมดสต็อก
        </Badge>
      )
    }
    if (reorder > 0 && qty <= reorder) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning-strong">
          <AlertTriangle className="size-3" />
          {qty.toLocaleString()}
        </span>
      )
    }
    return <span className="text-sm font-semibold tabular-nums text-foreground">{qty.toLocaleString()}</span>
  }

  return (
    <div className="flex flex-col h-full px-8 pt-10 pb-4 gap-3">
      <PageHeader
        title="สินค้า"
      />

            {/* Stat strip — clickable filter shortcuts */}
      <div className="grid grid-cols-3 gap-3 shrink-0">
        <StatCard
          label="สินค้าทั้งหมด"
          value={allStats.total_all.toLocaleString()}
          icon={Boxes}
          tint="primary"
          isActive={stockFilter === 'all'}
          onClick={() => toggleStockFilter('all')}
        />
        <StatCard
          label="ใกล้หมด"
          value={allStats.low.toLocaleString()}
          icon={AlertTriangle}
          tint="warning"
          isActive={stockFilter === 'low'}
          onClick={() => toggleStockFilter('low')}
        />
        <StatCard
          label="หมดสต็อก"
          value={allStats.out.toLocaleString()}
          icon={PackageX}
          tint="destructive"
          isActive={stockFilter === 'out'}
          onClick={() => toggleStockFilter('out')}
        />
      </div>

      {/* Toolbar — search + filters */}
      <div className="flex flex-wrap gap-2 items-center shrink-0">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="ค้นหาชื่อสินค้า, บาร์โค้ด, รหัส..."
            className="h-10 pl-9 rounded-xl text-sm bg-card"
          />
        </div>

        <Select value={String(categoryId)} onValueChange={v => setCategoryId(Number(v))}>
          <SelectTrigger className="h-10 w-48 rounded-xl bg-card text-sm border-0">
            <SelectValue placeholder="หมวดหมู่ทั้งหมด" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">หมวดหมู่ทั้งหมด</SelectItem>
            {categories.map(c => (
              <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={String(drugTypeId)} onValueChange={v => setDrugTypeId(Number(v))}>
          <SelectTrigger className="h-10 w-48 rounded-xl bg-card text-sm border-0">
            <SelectValue placeholder="ประเภทยาทั้งหมด" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">ประเภทยาทั้งหมด</SelectItem>
            {drugTypes.map(d => (
              <SelectItem key={d.id} value={String(d.id)}>{d.name_th}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <label className="ml-auto flex items-center gap-2 px-3 h-10 rounded-xl bg-card text-sm cursor-pointer">
          <span className="text-muted-foreground mr-10">แสดงที่ปิดใช้งาน</span>
          <Switch checked={showDisabled} onCheckedChange={setShowDisabled} size="default" />
        </label>
      </div>

      {/* List card */}
      <div className="flex flex-1 flex-col min-h-0 bg-card rounded-2xl shadow-card overflow-hidden">
        <div className="px-5 py-2.5 text-sm font-semibold text-muted-foreground shrink-0 flex items-center justify-between">
          <span>{loading ? 'กำลังโหลด...' : `พบ ${total.toLocaleString()} รายการ`}</span>
          <Button onClick={() => navigate('/products/new')} className="h-9 rounded-lg px-2 text-sm">
            <Plus className="size-4" /> เพิ่มสินค้า
          </Button>
        </div>

        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-8 border-r-8 border-card">
          <Table className="table-fixed">
            <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-muted">
              <TableRow>
                <TableHead className="w-14 text-foreground-subtle">#</TableHead>
                <TableHead className="text-foreground-subtle">
                  <SortableHead field="trade_name" sort={sort} onToggle={toggleSort}>ชื่อสินค้า</SortableHead>
                </TableHead>
                <TableHead className="w-24 text-center text-foreground-subtle">
                  <SortableHead field="unit_name" align="center" sort={sort} onToggle={toggleSort}>หน่วย</SortableHead>
                </TableHead>
                <TableHead className="w-28 text-right text-foreground-subtle">
                  <SortableHead field="cost_price" align="right" sort={sort} onToggle={toggleSort}>ต้นทุน</SortableHead>
                </TableHead>
                <TableHead className="w-28 text-right text-foreground-subtle">
                  <SortableHead field="price_retail" align="right" sort={sort} onToggle={toggleSort}>ราคาขาย</SortableHead>
                </TableHead>
                <TableHead className="w-36 text-right text-foreground-subtle">
                  <SortableHead field="profit" align="right" sort={sort} onToggle={toggleSort}>กำไร</SortableHead>
                </TableHead>
                <TableHead className="w-28 text-center text-foreground-subtle">
                  <SortableHead field="stock_qty" align="center" sort={sort} onToggle={toggleSort}>สต็อก</SortableHead>
                </TableHead>
                <TableHead className="text-center w-36 text-foreground-subtle">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-16">กำลังโหลด...</TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-16">
                    <Package className="size-10 mx-auto mb-2 opacity-30" />
                    ไม่พบสินค้า
                  </TableCell>
                </TableRow>
              ) : rows.map((row, i) => {
                const profit = row.price_retail - (row.cost_price ?? 0)
                const pct = (row.cost_price ?? 0) > 0 ? (profit / row.cost_price!) * 100 : 0
                const isDisabled = !!row.is_disabled
                return (
                  <TableRow key={row.id} className={`hover:bg-primary-soft/60 transition-colors ${isDisabled ? 'opacity-60' : ''}`}>
                    <TableCell className="text-foreground-subtle text-xs tabular-nums">{(page - 1) * limit + i + 1}</TableCell>
                    <TableCell>
                      <div className="font-semibold text-sm text-foreground truncate" title={row.trade_name}>{row.trade_name}</div>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {isDisabled ? <Badge variant="secondary" className="text-[10px] rounded-md px-1.5 py-0">ปิดใช้งาน</Badge> : null}
                        {/* {row.is_antibiotic ? <Badge variant="warning" className="text-[10px] rounded-md px-1.5 py-0">ยาปฏิชีวนะ</Badge> : null} */}
                        {row.is_fda13 ? <Badge variant="warm" className="text-[10px] rounded-md px-1.5 py-0">ข.ย.13</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-sm text-muted-foreground">{row.unit_name ?? '—'}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{formatCurrency(row.cost_price)}</TableCell>
                    <TableCell className="text-right text-sm font-semibold tabular-nums text-foreground">{formatCurrency(row.price_retail)}</TableCell>
                    <TableCell className="text-right text-sm font-medium tabular-nums">
                      <span className={profit >= 0 ? 'text-success' : 'text-destructive'}>
                        {formatCurrency(profit)}
                        <span className="ml-1 text-xs opacity-70">({pct.toFixed(0)}%)</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {renderStockCell(row.stock_qty, row.reorder_point ?? 0)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-3">
                        <Button
                          size="icon-xl"
                          variant="outline"
                          onClick={() => navigate(`/products/${row.id}/edit`)}
                          title="แก้ไข"
                        >
                          <Edit2 />
                        </Button>
                        <Button
                          size="icon-xl"
                          variant="outline"
                          className="text-primary"
                          onClick={() => openAdjust(row)}
                          title="ปรับสต็อก"
                        >
                          <Package />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-border flex justify-center shrink-0">
            <Pagination page={page} totalPages={totalPages} onPageChange={p => load(p)} />
          </div>
        )}
      </div>

      {/* Adjust stock dialog — three modes driven by delta direction.
          - decrease → auto-FEFO preview (which lots get hit)
          - increase + new lot → mini-receive form
          - increase + existing lot → picker + weighted-avg cost preview */}
      <Dialog open={!!adjustProduct} onOpenChange={open => { if (!open) setAdjustProduct(null) }}>
        <DialogContent
          size="2xl"
          onClose={() => setAdjustProduct(null)}
          className="h-[860px] max-h-[92vh] grid-rows-[auto_1fr_auto]"
        >
          <DialogHeader>
            <DialogTitle className="text-xl">ปรับสต็อก</DialogTitle>
          </DialogHeader>
          <DialogBody className="flex flex-col overflow-y-auto min-h-0 scrollbar-thin">
            <div className="space-y-4">
            {adjustProduct && (
              <div className="bg-muted rounded-xl px-4 py-3">
                <div className="font-semibold text-base truncate">{adjustProduct.trade_name}</div>
                <div className="flex gap-2 text-sm text-muted-foreground mt-1">
                  สต็อกปัจจุบัน :{' '}
                  <span className="font-semibold text-foreground tabular-nums">{adjustProduct.stock_qty.toLocaleString()}</span>{' '}
                  {adjustProduct.unit_name ?? 'ชิ้น'} | จำนวน
                  <span className="tabular-nums font-semibold">{openLotsSummary.length}</span> ล็อต
                </div>
                {!lotsLoading && openLotsSummary.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border-strong/40 space-y-1">
                    {openLotsSummary.map(l => (
                      <div key={l.id} className="flex items-center justify-between text-sm">
                        <span className="font-mono text-foreground-subtle truncate">{l.lot_number}</span>
                        <span className="flex items-center gap-3 text-muted-foreground shrink-0">
                          <span>หมดอายุ {formatExp(l.expiry_date)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {lotsLoading && <div className="mt-2 text-sm text-muted-foreground">กำลังโหลดล็อต...</div>}
              </div>
            )}

            <div>
              <label className="block text-base font-medium mb-1">
                จำนวนสต็อกหลังปรับ <span className="text-destructive">*</span>
              </label>
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex flex-1 basis-0 items-center justify-center gap-1.5 rounded-lg px-3 h-10 text-base font-semibold tabular-nums ${
                    adjustDelta === null
                      ? 'bg-muted text-muted-foreground/60'
                      : adjustDelta > 0
                        ? 'bg-success-soft text-success'
                        : adjustDelta < 0
                          ? 'bg-destructive-soft text-destructive'
                          : 'bg-muted text-muted-foreground'
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
                  type="number"
                  value={adjustTarget}
                  onChange={e => setAdjustTarget(e.target.value)}
                  placeholder="0"
                  min={0}
                  className="h-10 rounded-xl text-lg font-semibold tabular-nums flex-1 basis-0 text-right"
                  autoFocus
                />
              </div>
            </div>

            {/* DECREASE — FEFO preview */}
            {adjustDelta !== null && adjustDelta < 0 && (
              <div className="rounded-xl border border-destructive-soft bg-destructive-soft/40 p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
                  <Info className="size-4" />
                  ระบบจะหักด้วย FEFO (ล็อตใกล้หมดอายุก่อน)
                </div>
                {fefoPreview.length > 0 ? (
                  <div className="space-y-1.5">
                    {fefoPreview.map(({ lot, deduct, qtyAfter }) => (
                      <div key={lot.id} className="flex items-center justify-between text-sm bg-card rounded-lg px-3 py-2">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="font-mono font-semibold text-foreground truncate">{lot.lot_number}</span>
                          <span className="text-muted-foreground shrink-0">exp {formatExp(lot.expiry_date)}</span>
                        </span>
                        <span className="flex items-center gap-2 shrink-0 tabular-nums">
                          <span className="text-muted-foreground">{lot.qty_on_hand.toLocaleString()} → {qtyAfter.toLocaleString()}</span>
                          <span className="font-bold text-destructive">−{deduct.toLocaleString()}</span>
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
                      variant={increaseMode === 'new' ? 'success' : 'outline'}
                      onClick={() => setIncreaseMode('new')}
                      className="h-14 rounded-xl flex-col gap-0.5 items-start px-3 py-1.5"
                    >
                      <span className="flex items-center gap-1.5 text-sm font-semibold">
                        <Layers className="size-4" /> สร้างล็อตใหม่
                      </span>
                      <span className="text-sm opacity-80 font-normal">ของจากที่อื่น / exp ต่างกัน</span>
                    </Button>
                    <Button
                      type="button"
                      variant={increaseMode === 'existing' ? 'success' : 'outline'}
                      onClick={() => setIncreaseMode('existing')}
                      disabled={mergeCandidates.length === 0}
                      className="h-14 rounded-xl flex-col gap-0.5 items-start px-3 py-1.5"
                    >
                      <span className="flex items-center gap-1.5 text-sm font-semibold">
                        <FolderInput className="size-4" /> เพิ่มเข้าล็อตเดิม
                      </span>
                      <span className="text-sm opacity-80 font-normal">ของแถม batch เดียวกัน</span>
                    </Button>
                  </div>
                </div>

                {increaseMode === 'new' && (
                  <div className="rounded-xl border border-success-soft bg-success-soft/30 p-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium mb-1 text-muted-foreground">หมายเลขล็อต</label>
                        <Input
                          value={newLotNumber}
                          onChange={e => setNewLotNumber(e.target.value)}
                          placeholder="ปล่อยว่างเพื่อ auto"
                          className="h-10 rounded-lg text-sm font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1 text-muted-foreground">วันหมดอายุ</label>
                        <DateInput className="h-10" value={newLotExpiry} onChange={setNewLotExpiry} placeholder="dd/mm/yyyy" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1 text-muted-foreground">
                        ต้นทุน/หน่วย <span className="text-destructive">*</span>
                        <span className="ml-1 opacity-70">(ของฟรี = 0)</span>
                      </label>
                      <Input
                        type="number"
                        value={newLotCost}
                        onChange={e => setNewLotCost(e.target.value)}
                        min={0}
                        step="0.01"
                        className="h-10 rounded-lg text-sm tabular-nums"
                      />
                    </div>
                  </div>
                )}

                {increaseMode === 'existing' && (
                  <div className="rounded-xl border border-success-soft bg-success-soft/30 p-3 space-y-3">
                    {/* Lot picker — dropdown shows only lot_number; details live beside */}
                    <div>
                      <label className="block text-sm font-medium mb-1 text-muted-foreground">
                        เลือกล็อต <span className="text-destructive">*</span>
                      </label>
                      <div className="grid grid-cols-[240px_1fr] gap-3">
                        <Select
                          value={targetLotId ? String(targetLotId) : ''}
                          onValueChange={v => setTargetLotId(Number(v))}
                        >
                          <SelectTrigger className="h-10 w-full rounded-lg text-sm font-mono">
                            <SelectValue placeholder="-- เลือกล็อต --" />
                          </SelectTrigger>
                          <SelectContent>
                            {mergeCandidates.map(l => (
                              <SelectItem key={l.id} value={String(l.id)} className="font-mono">
                                {l.lot_number}{l.is_closed ? ' (ปิด)' : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="h-10 px-3 flex items-center gap-3 bg-card rounded-lg text-sm text-muted-foreground flex-wrap">
                          {selectedTargetLot ? (
                            <>
                              <span><span className="font-medium">หมดอายุ</span> {formatExp(selectedTargetLot.expiry_date)}</span>
                              <span className="tabular-nums"><span className="font-medium">คงเหลือ</span> {selectedTargetLot.qty_on_hand.toLocaleString()}</span>
                              <span className="tabular-nums"><span className="font-medium">ต้นทุน</span> {formatCurrency(selectedTargetLot.cost_price)}</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground/60">—</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Cost input + new-avg preview on the same row */}
                    <div className="grid grid-cols-[240px_1fr] gap-3">
                      <div>
                        <label className="block text-sm font-medium mb-1 text-muted-foreground">
                          ต้นทุน/หน่วย <span className="text-destructive">*</span>
                          <span className="ml-1 opacity-70">(ฟรี = 0)</span>
                        </label>
                        <Input
                          type="number"
                          value={addedCost}
                          onChange={e => setAddedCost(e.target.value)}
                          min={0}
                          step="0.01"
                          className="h-10 rounded-lg text-sm tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1 text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            <Info className="size-3.5" /> ต้นทุนเฉลี่ยใหม่ของล็อต
                          </span>
                        </label>
                        <div className="h-10 px-3 flex items-center bg-card rounded-lg text-sm tabular-nums">
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

            {/* Note section — pinned to bottom of the body via mt-auto so the
                modal layout is stable when conditional sections above appear/disappear. */}
            <div className="mt-auto pt-4">
              <label className="block text-base font-medium mb-2">หมายเหตุ <span className="text-destructive">*</span></label>
              <div className="flex flex-wrap gap-2 mb-2">
                {QUICK_REASONS.map(r => (
                  <Button
                    key={r}
                    type="button"
                    size="sm"
                    variant={adjustNote === r ? 'info-soft' : 'outline'}
                    className="h-9 rounded-lg text-sm"
                    onClick={() => setAdjustNote(r)}
                  >
                    {r}
                  </Button>
                ))}
              </div>
              <Input
                value={adjustNote}
                onChange={e => setAdjustNote(e.target.value)}
                placeholder="เหตุผลการปรับสต็อก หรือเลือกจากปุ่มด้านบน"
                className="h-10 rounded-xl"
                onKeyDown={e => { if (e.key === 'Enter') handleAdjust() }}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="destructive2" className="h-10 rounded-xl px-5 text-sm" onClick={() => setAdjustProduct(null)}>ยกเลิก</Button>
            <Button
              onClick={handleAdjust}
              disabled={adjusting || adjustDelta === null || adjustDelta === 0 || lotsLoading}
              variant={adjustDelta !== null && adjustDelta < 0 ? 'destructive' : 'success'}
              className="h-10 rounded-xl px-5 text-sm"
            >
              {adjusting ? 'กำลังบันทึก...' : 'ยืนยัน'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SortableHead({
  field, align = 'left', children, sort, onToggle,
}: {
  field: SortField
  align?: 'left' | 'center' | 'right'
  children: React.ReactNode
  sort: SortState
  onToggle: (field: SortField) => void
}) {
  const isActive = sort.by === field
  const Icon = !isActive ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
  const justify =
    align === 'right'  ? 'justify-end'
    : align === 'center' ? 'justify-center'
    : 'justify-start'
  return (
    <button
      type="button"
      onClick={() => onToggle(field)}
      className={`w-full inline-flex items-center gap-1 hover:text-foreground transition-colors ${justify} ${isActive ? 'text-foreground' : ''}`}
    >
      <span>{children}</span>
      <Icon className={`size-3 ${isActive ? 'opacity-100' : 'opacity-40'}`} />
    </button>
  )
}

