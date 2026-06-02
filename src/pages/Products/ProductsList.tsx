import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { SearchInput } from '@/components/ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, SortableTableHead } from '@/components/ui/table'
import { Pagination, type PageSize } from '@/components/ui/pagination'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Popover, PopoverTrigger, PopoverContent, PopoverHeader, PopoverTitle } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { useToast } from '@/components/ui/toast'
import { TintIcon } from '@/components/ui/tint-icon'
import { AdjustStockDialog, type AdjustStockTarget } from '@/components/dialogs/AdjustStockDialog'
import { usePagePrefs } from '@/hooks/usePagePrefs'
import { formatCurrency, cn } from '@/lib/utils'
import type { Product, ProductCategory } from '@/types'
import type { ProductsOutletContext } from './index'
import {
  Edit, Package, Settings2, Filter, MoreHorizontal, Layers, Ban, Check,
} from 'lucide-react'

type SortField = 'trade_name' | 'cost_price' | 'price_retail' | 'profit' | 'stock_qty'
type SortDir = 'asc' | 'desc'
interface SortState { by: SortField; dir: SortDir }

interface ProductRow extends Product {
  category_name?: string
  drug_type_name?: string
  unit_name?: string
  stock_qty: number
}

interface ProductsPrefs {
  pageSize: PageSize
  sort: SortState
  showCost: boolean
  showProfit: boolean
  showPrice: boolean
  showStock: boolean
}

const PRODUCTS_DEFAULTS: ProductsPrefs = {
  pageSize: 50,
  sort: { by: 'trade_name', dir: 'asc' },
  showCost: true,
  showProfit: false,
  showPrice: true,
  showStock: true,
}

export default function ProductsList() {
  const navigate = useNavigate()
  const { refreshSummary } = useOutletContext<ProductsOutletContext>()
  const { toast } = useToast()

  const [prefs, setPrefs] = usePagePrefs<ProductsPrefs>('products', PRODUCTS_DEFAULTS)

  const [rows, setRows] = useState<ProductRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  // Filters (q, categoryId, statusFilter NOT persisted — reset per session)
  const [q, setQ] = useState('')
  const [categoryId, setCategoryId] = useState<number>(0)
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all')
  const showCost = prefs.showCost
  const showProfit = prefs.showProfit
  const showPrice = prefs.showPrice
  const showStock = prefs.showStock
  const sort = prefs.sort
  const setSort = (next: SortState | ((prev: SortState) => SortState)) => {
    setPrefs({ sort: typeof next === 'function' ? next(prefs.sort) : next })
  }

  // Dropdown data
  const [categories, setCategories] = useState<ProductCategory[]>([])

  // Stock-adjust dialog target (null = closed)
  const [adjustTarget, setAdjustTarget] = useState<AdjustStockTarget | null>(null)

  const pageSize = prefs.pageSize
  const setPageSize = (v: PageSize) => setPrefs({ pageSize: v })
  const totalPages = pageSize === 'all' ? 1 : Math.ceil(total / pageSize)

  useEffect(() => {
    loadDropdowns()
  }, [])

  // Live search: debounce text + reactive filters. Stats live in the shell
  // and refresh on mount + on mutation (refreshSummary), so we don't refetch
  // them here.
  useEffect(() => {
    const t = setTimeout(() => { load(1) }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, categoryId, sort, pageSize, statusFilter])

  const loadDropdowns = async () => {
    const cats = await window.api.settings.allCategories()
    setCategories(cats as ProductCategory[])
  }

  const load = useCallback(async (p = page) => {
    setLoading(true)
    try {
      const res = await window.api.products.list({
        q: q.trim() || undefined,
        category_id: categoryId || undefined,
        page: p,
        limit: pageSize,
        sort_by: sort.by,
        sort_dir: sort.dir,
        // 'all' → include enabled+disabled · 'enabled' → only enabled
        // · 'disabled' → only disabled (forced via stock_filter='disabled')
        stock_filter: statusFilter === 'disabled' ? 'disabled' : statusFilter === 'enabled' ? 'enabled' : 'all',
        include_disabled: statusFilter !== 'enabled',
        is_bundle: 0,
      }) as any
      setRows(res.rows)
      setTotal(res.total)
      setPage(p)
    } finally {
      setLoading(false)
    }
  }, [q, categoryId, page, pageSize, sort, statusFilter])

  const toggleSort = (field: SortField) => {
    setSort(s => s.by === field
      ? { by: field, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { by: field, dir: 'asc' })
  }

  const toggleDisabled = async (row: ProductRow) => {
    try {
      await window.api.products.update(row.id, { is_disabled: row.is_disabled ? 0 : 1 })
      toast({ title: row.is_disabled ? 'เปิดใช้งานสินค้าแล้ว' : 'ปิดใช้งานสินค้าแล้ว', variant: 'success' })
      load(page)
      refreshSummary()
    } catch (e: any) {
      toast({ title: 'ดำเนินการไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    }
  }

  // Stock cell: qty + unit, with progress bar scaled by safety_stock.
  // Bar tone signals low/out (destructive) vs normal (success); the status pill
  // moved into its own column, so the cell stays compact.
  const renderStockCell = (qty: number, reorder: number, safety: number, unitName?: string) => {
    const unit = unitName || 'หน่วย'
    const isOut = qty <= 0
    const isLow = !isOut && reorder > 0 && qty <= reorder
    const barTone = isOut || isLow ? 'bg-destructive' : 'bg-success'
    const pct = isOut ? 0 : safety > 0 ? Math.min(100, (qty / safety) * 100) : 100
    return (
      <div className="flex flex-col gap-1 min-w-[100px]">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-foreground">{qty.toLocaleString()}</span>
          <span className="text-muted-foreground">{unit}</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted-hover overflow-hidden">
          <div className={`h-full rounded-full ${barTone}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* List card */}
      <div className="flex flex-1 flex-col min-h-0 bg-card rounded-card shadow-card border border-border overflow-hidden">
        {/* px-4 = 16px, matches the table's border-l-[16px]/r-[16px] inset
            so filter-strip controls align with column edges. */}
        <div className="px-4 h-14 shrink-0 flex items-center gap-3">
          {/* Title cluster (left): icon-in-box + heading + count badge */}
          <div className="flex items-center gap-3 shrink-0">
            <TintIcon icon={Package} tint="neutral" size="sm" />
            <h3 className="text-lg font-semibold text-foreground">รายการสินค้า</h3>
            <Badge variant="neutral-outline">{total.toLocaleString()}</Badge>
          </div>

          {/* Right cluster — ml-auto on first to push right */}
          <SearchInput
            variant="elevated"
            wrapperClassName="w-72 shrink-0 ml-auto"
            className="h-9"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="ค้นหาชื่อสินค้า, บาร์โค้ด, รหัส..."
          />

          <Select value={String(categoryId)} onValueChange={v => setCategoryId(Number(v))}>
            <SelectTrigger variant="elevated" className="h-9 w-44 shrink-0">
              <SelectValue placeholder="หมวดหมู่ทั้งหมด" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">หมวดหมู่ทั้งหมด</SelectItem>
              {categories.map(c => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Filter popover — usage status (enabled/disabled). Stock status
              filter was removed; use the Low-Stock page for that. */}
          {(() => {
            const STATUS_OPTIONS: { value: typeof statusFilter; label: string }[] = [
              { value: 'all',      label: 'ทั้งหมด' },
              { value: 'enabled',  label: 'ใช้งาน' },
              { value: 'disabled', label: 'ปิดใช้งาน' },
            ]
            return (
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="lg" variant="elevated" className="h-9 w-9 p-0 shrink-0" title="ตัวกรอง">
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
            )
          })()}

          {/* Column settings popover */}
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
                <Checkbox checked={showCost} onCheckedChange={v => setPrefs({ showCost: v === true })} />
                <span className="text-sm">แสดงต้นทุน</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={showPrice} onCheckedChange={v => setPrefs({ showPrice: v === true })} />
                <span className="text-sm">แสดงราคาขาย</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={showProfit} onCheckedChange={v => setPrefs({ showProfit: v === true })} />
                <span className="text-sm">แสดงกำไร</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={showStock} onCheckedChange={v => setPrefs({ showStock: v === true })} />
                <span className="text-sm">แสดงสต็อก</span>
              </label>
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-[16px] border-r-[16px] border-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <SortableTableHead field="trade_name" sort={sort} onToggle={toggleSort} className="min-w-[220px]">ชื่อสินค้า</SortableTableHead>
                {showCost && (
                  <SortableTableHead field="cost_price" align="left" sort={sort} onToggle={toggleSort} className="min-w-24">ต้นทุน</SortableTableHead>
                )}
                {showPrice && (
                  <SortableTableHead field="price_retail" align="left" sort={sort} onToggle={toggleSort} className="min-w-24">ราคาขาย</SortableTableHead>
                )}
                {showProfit && (
                  <SortableTableHead field="profit" align="left" sort={sort} onToggle={toggleSort} className="min-w-24">กำไร</SortableTableHead>
                )}
                {showStock && (
                  <SortableTableHead field="stock_qty" align="left" sort={sort} onToggle={toggleSort} className="min-w-[140px] pr-6">สต็อก</SortableTableHead>
                )}
                <TableHead className="min-w-20 text-center">สถานะ</TableHead>
                <TableHead className="min-w-16 text-center">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4 + (showCost ? 1 : 0) + (showPrice ? 1 : 0) + (showProfit ? 1 : 0) + (showStock ? 1 : 0)} className="text-center text-muted-foreground py-16">กำลังโหลด...</TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4 + (showCost ? 1 : 0) + (showPrice ? 1 : 0) + (showProfit ? 1 : 0) + (showStock ? 1 : 0)} className="text-center text-muted-foreground py-16">
                    <Package className="size-10 mx-auto mb-2 opacity-30" />
                    ไม่พบสินค้า
                  </TableCell>
                </TableRow>
              ) : rows.map((row, i) => {
                const profit = row.price_retail - (row.cost_price ?? 0)
                const pct = (row.cost_price ?? 0) > 0 ? (profit / row.cost_price!) * 100 : 0
                const isDisabled = !!row.is_disabled
                return (
                  <TableRow key={row.id} className="[&_td]:py-2.5 [&_td]:font-medium">
                    <TableCell className="text-muted-foreground text-sm">{(pageSize === 'all' ? 0 : (page - 1) * pageSize) + i + 1}</TableCell>
                    <TableCell className="max-w-0">
                      <div className="text-sm text-foreground truncate max-w-[400px]" title={row.trade_name}>{row.trade_name}</div>
                    </TableCell>
                    {showCost && (
                      <TableCell className="text-left text-sm text-muted-foreground">{formatCurrency(row.cost_price)}</TableCell>
                    )}
                    {showPrice && (
                      <TableCell className="text-left text-sm text-foreground">
                        {showCost && showProfit ? (
                          formatCurrency(row.price_retail)
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help">
                                {formatCurrency(row.price_retail)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="px-3 py-2">
                              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                                {!showCost && (
                                  <>
                                    <span className="text-muted-foreground">ต้นทุน</span>
                                    <span className="text-right font-medium">{formatCurrency(row.cost_price)}</span>
                                  </>
                                )}
                                {!showProfit && (
                                  <>
                                    <span className="text-muted-foreground">กำไร</span>
                                    <span className={`text-right font-medium ${profit >= 0 ? 'text-success' : 'text-destructive'}`}>
                                      {formatCurrency(profit)} ({pct.toFixed(0)}%)
                                    </span>
                                  </>
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>
                    )}
                    {showProfit && (
                      <TableCell className="text-left text-sm">
                        <span className={profit >= 0 ? 'text-success' : 'text-destructive'}>
                          {formatCurrency(profit)}
                          {/* text-xs: user-approved exception to the text-sm minimum rule */}
                          <span className="ml-1 text-xs opacity-70">({pct.toFixed(0)}%)</span>
                        </span>
                      </TableCell>
                    )}
                    {showStock && (
                      <TableCell className="pr-6">
                        {renderStockCell(row.stock_qty, row.reorder_point ?? 0, row.safety_stock ?? 0, row.unit_name)}
                      </TableCell>
                    )}
                    <TableCell className="text-center">
                      <Badge variant={isDisabled ? 'destructive-outline' : 'success-outline'}>
                        {isDisabled ? 'ปิดใช้งาน' : 'ใช้งาน'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-center">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button size="icon-lg" variant="elevated" title="ตัวเลือก">
                              <MoreHorizontal />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent align="end" sideOffset={4} className="w-44 p-1 gap-0">
                            <button
                              type="button"
                              onClick={() => navigate(`/products/${row.id}/edit`)}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-foreground hover:bg-muted transition-colors"
                            >
                              <Edit className="size-4" /> แก้ไข
                            </button>
                            <button
                              type="button"
                              onClick={() => setAdjustTarget({
                                id: row.id,
                                trade_name: row.trade_name,
                                stock_qty: row.stock_qty,
                                unit_name: row.unit_name,
                                last_cost_price: row.last_cost_price,
                              })}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-foreground hover:bg-muted transition-colors"
                            >
                              <Layers className="size-4" /> ปรับสต็อค
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleDisabled(row)}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-destructive hover:bg-destructive/10 transition-colors"
                            >
                              <Ban className="size-4" /> {row.is_disabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                            </button>
                          </PopoverContent>
                        </Popover>
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
            const size = pageSize === 'all' ? total : pageSize
            const start = total === 0 ? 0 : (page - 1) * size + 1
            const end = Math.min(page * size, total)
            return (
              <div className="flex items-center gap-2 text-muted-foreground shrink-0">
                <span>จำนวนแถว</span>
                <Select value={String(pageSize)} onValueChange={v => setPageSize(v === 'all' ? 'all' : Number(v))}>
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
                  {loading
                    ? 'กำลังโหลด...'
                    : <>แสดง <span className="font-semibold text-foreground">{start.toLocaleString()}-{end.toLocaleString()}</span></>}
                </span>
              </div>
            )
          })()}
          <Pagination page={page} totalPages={totalPages} onPageChange={p => load(p)} className="w-auto" />
        </div>
      </div>

      <AdjustStockDialog
        target={adjustTarget}
        onClose={() => setAdjustTarget(null)}
        onSaved={() => { load(page); refreshSummary() }}
      />
    </div>
  )
}
