import { useState, useEffect, useMemo, useCallback } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, SortableTableHead,
} from '@/components/ui/table'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { Popover, PopoverTrigger, PopoverContent, PopoverHeader, PopoverTitle } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { QuickStockDialog, type QuickStockTarget } from '@/components/dialogs/QuickStockDialog'
import { compareNameBuckets } from '@/lib/sortName'
import type { ManageOutletContext } from './index'
import { Search, PackageX, Package, ShoppingCart, TrendingDown, Edit, Boxes, Settings2 } from 'lucide-react'

type StatusFilter = 'all' | 'out' | 'low'
type SortField = 'trade_name'
type SortDir = 'asc' | 'desc'
interface SortState { by: SortField; dir: SortDir }

interface LowStockRow {
  product_id: number
  code: string | null
  trade_name: string
  reorder_point: number
  safety_stock: number | null
  cost_avg: number | null
  unit_name: string | null
  stock_qty: number
  buy_more: number
  cheapest_supplier_name: string | null
  cheapest_supplier_cost: number | null
}

interface Category { id: number; name: string }

const SUPPLIER_TOGGLE_KEY = 'lowStock.showCheapestSupplier'

export default function ManageLowStockPage() {
  const { toast } = useToast()
  const { setSummary } = useOutletContext<ManageOutletContext>()
  const navigate = useNavigate()

  const [q, setQ] = useState('')
  const [categoryId, setCategoryId] = useState<string>('0')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [rows, setRows] = useState<LowStockRow[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [outCount, setOutCount] = useState(0)
  const [totalBuyMore, setTotalBuyMore] = useState(0)
  const [loading, setLoading] = useState(false)
  const [quickTarget, setQuickTarget] = useState<QuickStockTarget | null>(null)
  const [showSupplier, setShowSupplier] = useState<boolean>(() => {
    return localStorage.getItem(SUPPLIER_TOGGLE_KEY) === '1'
  })
  // Column visibility (ชื่อสินค้า + จัดการสินค้า always shown).
  // "สต็อก" bar consolidates คงเหลือ/จุดสั่งซื้อ/สต็อกปลอดภัย/หน่วย into one cell
  // — same pattern as ProductsList renderStockCell.
  const [showColStockBar, setShowColStockBar] = useState(true)
  const [showColBuyMore, setShowColBuyMore] = useState(true)
  const [showColCost, setShowColCost] = useState(true)
  const [sort, setSort] = useState<SortState>({ by: 'trade_name', dir: 'asc' })

  const toggleSort = (field: SortField) => {
    setSort(s => s.by === field
      ? { by: field, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { by: field, dir: 'asc' })
  }

  useEffect(() => {
    localStorage.setItem(SUPPLIER_TOGGLE_KEY, showSupplier ? '1' : '0')
  }, [showSupplier])

  // Backend returns the full low-stock universe; status filter narrows the
  // table on the client so the summary counts (which drive the filter chips)
  // always reflect the unfiltered set — same pattern as Sales/Purchases.
  const filteredRows = useMemo(() => {
    const base = statusFilter === 'out' ? rows.filter(r => r.stock_qty <= 0)
      : statusFilter === 'low' ? rows.filter(r => r.stock_qty > 0)
      : rows
    const sorted = [...base].sort((a, b) => {
      const cmp = compareNameBuckets(a.trade_name || '', b.trade_name || '')
      return sort.dir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [rows, statusFilter, sort])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await (window.api.products as any).lowStock({
        q: q.trim() || undefined,
        category_id: categoryId !== '0' ? Number(categoryId) : undefined,
      }) as { rows: LowStockRow[]; count: number; out_count: number; total_buy_more: number }
      setRows(res.rows)
      setOutCount(res.out_count)
      setTotalBuyMore(res.total_buy_more)
    } catch (e: any) {
      toast(e?.message ?? 'โหลดข้อมูลไม่สำเร็จ', 'error')
    } finally {
      setLoading(false)
    }
  }, [q, categoryId])

  useEffect(() => {
    window.api.settings.allCategories().then((c: any) => setCategories(c))
  }, [])

  // Debounced auto-load on search/category change
  useEffect(() => {
    const t = setTimeout(() => { load() }, 300)
    return () => clearTimeout(t)
  }, [load])

  useEffect(() => {
    setSummary([
      {
        label: 'รายการทั้งหมด',
        value: rows.length.toLocaleString(),
        icon: Package,
        tint: 'primary',
        onClick: () => setStatusFilter('all'),
        isActive: statusFilter === 'all',
      },
      {
        label: 'หมดสต็อก',
        value: outCount.toLocaleString(),
        icon: PackageX,
        tint: 'destructive',
        onClick: () => setStatusFilter('out'),
        isActive: statusFilter === 'out',
      },
      {
        label: 'ใกล้หมด',
        value: Math.max(0, rows.length - outCount).toLocaleString(),
        icon: TrendingDown,
        tint: 'warm',
        onClick: () => setStatusFilter('low'),
        isActive: statusFilter === 'low',
      },
    ])
  }, [rows.length, outCount, statusFilter, setSummary])

  // Clear slot summary on unmount — prevents stale cards leaking into the next
  // tab (esp. NegativeStock which has no summary of its own to overwrite).
  useEffect(() => {
    return () => setSummary(null)
  }, [setSummary])

  const colCount = 2
    + (showColStockBar ? 1 : 0)
    + (showColBuyMore ? 1 : 0)
    + (showColCost ? 1 : 0)
    + (showSupplier ? 1 : 0)

  // Stock cell — qty/unit/status + bar + a meta line under the bar showing
  // reorder & safety_stock targets.
  const renderStockCell = (qty: number, reorder: number, safety: number, unitName?: string | null) => {
    const unit = unitName || 'หน่วย'
    const isOut = qty <= 0
    const isLow = !isOut && reorder > 0 && qty <= reorder
    const status = isOut ? 'หมด' : isLow ? 'ใกล้หมด' : 'ปกติ'
    const tone = isOut || isLow ? 'text-destructive' : 'text-success'
    const barTone = isOut || isLow ? 'bg-destructive' : 'bg-success'
    const pct = isOut ? 0 : safety > 0 ? Math.min(100, (qty / safety) * 100) : 100
    const hasMeta = reorder > 0 || safety > 0
    return (
      <div className="flex flex-col gap-1 min-w-[160px]">
        <div className="text-sm">
          <span className="font-semibold tabular-nums text-foreground">{qty.toLocaleString()}</span>
          <span className="text-muted-foreground"> {unit} · </span>
          <span className={`font-medium ${tone}`}>{status}</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full ${barTone}`} style={{ width: `${pct}%` }} />
        </div>
        {hasMeta && (
          <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
            <span>{reorder > 0 ? <>จุดสั่งซื้อ <span className="text-foreground">{reorder.toLocaleString()}</span></> : null}</span>
            <span>{safety > 0 ? <>สต็อคปลอดภัย <span className="text-foreground">{safety.toLocaleString()}</span></> : null}</span>
          </div>
        )}
      </div>
    )
  }

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
              placeholder="ชื่อสินค้า, รหัส, บาร์โค้ด..."
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

          <Popover>
            <PopoverTrigger asChild>
              <Button size="lg" variant="outline" className="h-10 w-10 p-0 shrink-0" title="ตัวเลือกการแสดงผล">
                <Settings2 className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56">
              <PopoverHeader>
                <PopoverTitle>คอลัมน์ที่แสดง</PopoverTitle>
              </PopoverHeader>
              <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={showColStockBar} onCheckedChange={v => setShowColStockBar(v === true)} />
                <span className="text-sm">สต็อก</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={showColBuyMore} onCheckedChange={v => setShowColBuyMore(v === true)} />
                <span className="text-sm">ซื้อเพิ่ม</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={showColCost} onCheckedChange={v => setShowColCost(v === true)} />
                <span className="text-sm">ทุนเฉลี่ย</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted" title="แสดงผู้จำหน่ายที่เสนอราคาทุนต่ำสุดในรอบ 3 เดือนล่าสุด">
                <Checkbox checked={showSupplier} onCheckedChange={v => setShowSupplier(v === true)} />
                <span className="text-sm">ผู้จำหน่ายราคาทุนต่ำสุด</span>
              </label>
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-8 border-r-8 border-card">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead field="trade_name" sort={sort} onToggle={toggleSort} className="min-w-[220px]">ชื่อสินค้า</SortableTableHead>
                {showColStockBar && <TableHead className="min-w-[160px] pl-6">สต็อก</TableHead>}
                {showColBuyMore && <TableHead className="text-right min-w-16">ซื้อเพิ่ม</TableHead>}
                {showColCost && <TableHead className="text-right min-w-16">ทุนเฉลี่ย</TableHead>}
                {showSupplier && (
                  <TableHead className="text-right min-w-32">ผู้จำหน่าย</TableHead>
                )}
                <TableHead className="text-center min-w-20">จัดการสินค้า</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={colCount} className="text-center text-muted-foreground py-16">กำลังโหลด...</TableCell>
                </TableRow>
              ) : filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colCount} className="text-center text-muted-foreground py-16">
                    <ShoppingCart className="size-10 mx-auto mb-2 opacity-30" />
                    ไม่มีสินค้าที่ต่ำกว่าจุดสั่งซื้อ
                  </TableCell>
                </TableRow>
              ) : filteredRows.map(r => {
                const isOut = r.stock_qty <= 0
                return (
                  <TableRow key={r.product_id} className={`[&_td]:py-2.5 ${isOut ? 'bg-destructive-soft/30' : ''}`}>
                    <TableCell className="max-w-[260px] text-sm font-medium truncate" title={r.trade_name}>
                      {r.trade_name}
                    </TableCell>
                    {showColStockBar && (
                      <TableCell className="pl-6">
                        {renderStockCell(r.stock_qty, r.reorder_point, r.safety_stock ?? 0, r.unit_name)}
                      </TableCell>
                    )}
                    {showColBuyMore && (
                      <TableCell className="text-right text-sm font-bold tabular-nums text-destructive">
                        {Math.max(0, r.buy_more).toLocaleString()}
                      </TableCell>
                    )}
                    {showColCost && (
                      <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                        {r.cost_avg != null && r.cost_avg > 0
                          ? r.cost_avg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                          : <span className="text-foreground-subtle">—</span>}
                      </TableCell>
                    )}
                    {showSupplier && (
                      <TableCell className="text-right text-sm">
                        {r.cheapest_supplier_name ? (
                          <div className="flex flex-col leading-tight">
                            <span className="text-foreground truncate" title={r.cheapest_supplier_name}>
                              {r.cheapest_supplier_name}
                            </span>
                            {r.cheapest_supplier_cost != null && (
                              <span className="text-xs font-semibold text-success tabular-nums">
                                {r.cheapest_supplier_cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-foreground-subtle">—</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex gap-1.5 justify-center">
                        <Button
                          size="icon-lg"
                          variant="info-soft"
                          onClick={() => setQuickTarget({
                            id: r.product_id,
                            trade_name: r.trade_name,
                            code: r.code,
                            unit_name: r.unit_name,
                            stock_qty: r.stock_qty,
                            reorder_point: r.reorder_point,
                            safety_stock: r.safety_stock,
                          })}
                          title="ตั้งค่าสต็อก"
                        >
                          <Boxes />
                        </Button>
                        <Button
                          size="icon-lg"
                          variant="outline"
                          onClick={() => navigate(`/products/${r.product_id}/edit`)}
                          title="แก้ไขสินค้า"
                        >
                          <Edit />
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
            {loading ? 'กำลังโหลด...' : <>แสดง <span className="font-semibold text-foreground tabular-nums">{filteredRows.length.toLocaleString()}</span> รายการ</>}
          </span>
        </div>
      </div>

      <QuickStockDialog
        target={quickTarget}
        onClose={() => setQuickTarget(null)}
        onSaved={load}
      />
    </>
  )
}
