import { useState, useEffect, useMemo, useCallback } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Toggle } from '@/components/ui/switch'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { useToast } from '@/components/ui/toast'
import type { ManageOutletContext } from './index'
import { Search, PackagePlus, PackageX, Package, ShoppingCart, TrendingDown, Edit } from 'lucide-react'

type StatusFilter = 'all' | 'out' | 'low'

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
  const [showSupplier, setShowSupplier] = useState<boolean>(() => {
    return localStorage.getItem(SUPPLIER_TOGGLE_KEY) === '1'
  })

  useEffect(() => {
    localStorage.setItem(SUPPLIER_TOGGLE_KEY, showSupplier ? '1' : '0')
  }, [showSupplier])

  // Backend returns the full low-stock universe; status filter narrows the
  // table on the client so the summary counts (which drive the filter chips)
  // always reflect the unfiltered set — same pattern as Sales/Purchases.
  const filteredRows = useMemo(() => {
    if (statusFilter === 'out') return rows.filter(r => r.stock_qty <= 0)
    if (statusFilter === 'low') return rows.filter(r => r.stock_qty > 0)
    return rows
  }, [rows, statusFilter])

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

  const colCount = showSupplier ? 9 : 8

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

          <Tooltip>
            <TooltipTrigger asChild>
              <span className="shrink-0">
                <Toggle
                  framed="input"
                  checked={showSupplier}
                  onChange={setShowSupplier}
                  label="ผู้จำหน่ายราคาทุนต่ำสุด"
                />
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              แสดงผู้จำหน่ายที่เสนอราคาทุนต่ำสุดในรอบ 3 เดือนล่าสุด
            </TooltipContent>
          </Tooltip>

          <Button size="lg" variant="info-soft" className="h-10 px-2 shrink-0" onClick={() => navigate('/purchase')}>
            <PackagePlus className="size-4" /> ไปหน้ารับสินค้า
          </Button>
        </div>

        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-8 border-r-8 border-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-56">ชื่อสินค้า</TableHead>
                <TableHead className="min-w-12">หน่วย</TableHead>
                <TableHead className="text-right min-w-12">คงเหลือ</TableHead>
                <TableHead className="text-right min-w-12">จุดสั่งซื้อ</TableHead>
                <TableHead className="text-right min-w-24">สต็อกปลอดภัย</TableHead>
                <TableHead className="text-right min-w-16">ซื้อเพิ่ม</TableHead>
                <TableHead className="text-right min-w-16">ทุนเฉลี่ย</TableHead>
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
                  <TableRow key={r.product_id} className={isOut ? 'bg-destructive-soft/30' : ''}>
                    <TableCell className="text-sm font-medium truncate" title={r.trade_name}>
                      {r.trade_name}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.unit_name || <span className="text-foreground-subtle">—</span>}
                    </TableCell>
                    <TableCell className={`text-right text-sm font-semibold tabular-nums ${isOut ? 'text-destructive' : 'text-warning-strong'}`}>
                      {r.stock_qty.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                      {r.reorder_point.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                      {r.safety_stock != null && r.safety_stock > 0
                        ? r.safety_stock.toLocaleString()
                        : <span className="text-foreground-subtle">—</span>}
                    </TableCell>
                    <TableCell className="text-right text-sm font-bold tabular-nums text-destructive">
                      {Math.max(0, r.buy_more).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                      {r.cost_avg != null && r.cost_avg > 0
                        ? r.cost_avg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : <span className="text-foreground-subtle">—</span>}
                    </TableCell>
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
                      <div className="flex justify-center">
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
    </>
  )
}
