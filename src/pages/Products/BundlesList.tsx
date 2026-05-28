import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { SearchInput } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, SortableTableHead } from '@/components/ui/table'
import { Pagination, type PageSize } from '@/components/ui/pagination'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Popover, PopoverTrigger, PopoverContent, PopoverHeader, PopoverTitle } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { useToast } from '@/components/ui/toast'
import { TintIcon } from '@/components/ui/tint-icon'
import { usePagePrefs } from '@/hooks/usePagePrefs'
import { formatCurrency, cn } from '@/lib/utils'
import type { Product } from '@/types'
import type { ProductsOutletContext } from './index'
import { Edit, Boxes, Settings2, Filter, MoreHorizontal, Ban, Check } from 'lucide-react'

type SortField = 'trade_name' | 'cost_price' | 'price_retail' | 'profit' | 'stock_qty'
type SortDir = 'asc' | 'desc'
interface SortState { by: SortField; dir: SortDir }

interface BundleRow extends Product {
  unit_name?: string
  stock_qty: number
  component_count: number
}

interface BundlesPrefs {
  pageSize: PageSize
  sort: SortState
  showCost: boolean
  showProfit: boolean
}

const BUNDLES_DEFAULTS: BundlesPrefs = {
  pageSize: 50,
  sort: { by: 'trade_name', dir: 'asc' },
  showCost: true,
  showProfit: false,
}

export default function BundlesList() {
  const navigate = useNavigate()
  const { refreshSummary } = useOutletContext<ProductsOutletContext>()
  const { toast } = useToast()

  const [prefs, setPrefs] = usePagePrefs<BundlesPrefs>('bundles', BUNDLES_DEFAULTS)

  const [rows, setRows] = useState<BundleRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  const [q, setQ] = useState('')
  const showCost = prefs.showCost
  const showProfit = prefs.showProfit
  const [stockFilter, setStockFilter] = useState<'all' | 'enabled' | 'disabled'>('all')
  const sort = prefs.sort
  const setSort = (next: SortState | ((prev: SortState) => SortState)) => {
    setPrefs({ sort: typeof next === 'function' ? next(prefs.sort) : next })
  }

  const pageSize = prefs.pageSize
  const setPageSize = (v: PageSize) => setPrefs({ pageSize: v })
  const totalPages = pageSize === 'all' ? 1 : Math.ceil(total / pageSize)

  const load = useCallback(async (p = page) => {
    setLoading(true)
    try {
      const res = await window.api.products.list({
        q: q.trim() || undefined,
        page: p,
        limit: pageSize,
        sort_by: sort.by,
        sort_dir: sort.dir,
        stock_filter: stockFilter,
        include_disabled: stockFilter === 'disabled',
        is_bundle: 1,
      }) as any
      setRows(res.rows)
      setTotal(res.total)
      setPage(p)
    } finally {
      setLoading(false)
    }
  }, [q, page, pageSize, sort, stockFilter])

  useEffect(() => {
    const t = setTimeout(() => { load(1) }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, stockFilter, sort, pageSize])

  const toggleSort = (field: SortField) => {
    setSort(s => s.by === field
      ? { by: field, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { by: field, dir: 'asc' })
  }

  const toggleDisabled = async (row: BundleRow) => {
    try {
      await window.api.products.update(row.id, { is_disabled: row.is_disabled ? 0 : 1 })
      toast({ title: row.is_disabled ? 'เปิดใช้งานชุดสินค้าแล้ว' : 'ปิดใช้งานชุดสินค้าแล้ว', variant: 'success' })
      load(page)
      refreshSummary()
    } catch (e: any) {
      toast({ title: 'ดำเนินการไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex flex-1 flex-col min-h-0 bg-card rounded-card shadow-card border border-border overflow-hidden">
        <div className="px-4 h-14 shrink-0 flex items-center gap-3">
          {/* Title cluster (left): icon-in-box + heading + count badge */}
          <div className="flex items-center gap-3 shrink-0">
            <TintIcon icon={Boxes} tint="neutral" size="sm" />
            <h3 className="text-lg font-semibold text-foreground">รายการชุดสินค้า</h3>
            <Badge variant="neutral-outline">{total.toLocaleString()}</Badge>
          </div>

          {/* Right cluster — ml-auto on first to push right */}
          <SearchInput
            variant="elevated"
            wrapperClassName="w-72 shrink-0 ml-auto"
            className="h-9"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="ค้นหาชื่อชุด, บาร์โค้ด, รหัส..."
          />

          {/* Filter popover — usage status (enabled/disabled) */}
          {(() => {
            const STATUS_OPTIONS: { value: typeof stockFilter; label: string }[] = [
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
                      onClick={() => setStockFilter(o.value)}
                      className={cn(
                        'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors',
                        stockFilter === o.value ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted',
                      )}
                    >
                      <Check className={cn('size-4', stockFilter === o.value ? 'opacity-100' : 'opacity-0')} />
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
                <Checkbox checked={showProfit} onCheckedChange={v => setPrefs({ showProfit: v === true })} />
                <span className="text-sm">แสดงกำไร</span>
              </label>
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-[16px] border-r-[16px] border-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <SortableTableHead field="trade_name" sort={sort} onToggle={toggleSort} className="min-w-[280px]">ชื่อชุดสินค้า</SortableTableHead>
                <TableHead className="min-w-24">หน่วย</TableHead>
                <TableHead className="min-w-20">รายการ</TableHead>
                {showCost && (
                  <SortableTableHead field="cost_price" sort={sort} onToggle={toggleSort} className="min-w-24">ต้นทุน</SortableTableHead>
                )}
                <SortableTableHead field="price_retail" sort={sort} onToggle={toggleSort} className="min-w-24">ราคาขาย</SortableTableHead>
                {showProfit && (
                  <SortableTableHead field="profit" sort={sort} onToggle={toggleSort} className="min-w-24">กำไร</SortableTableHead>
                )}
                <TableHead className="text-center min-w-20">สถานะ</TableHead>
                <TableHead className="text-center min-w-20">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7 + (showCost ? 1 : 0) + (showProfit ? 1 : 0)} className="text-center text-muted-foreground py-16">กำลังโหลด...</TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7 + (showCost ? 1 : 0) + (showProfit ? 1 : 0)} className="text-center text-muted-foreground py-16">
                    <Boxes className="size-10 mx-auto mb-2 opacity-30" />
                    ยังไม่มีชุดสินค้า
                  </TableCell>
                </TableRow>
              ) : rows.map((row, i) => {
                const profit = row.price_retail - (row.cost_price ?? 0)
                const pct = (row.cost_price ?? 0) > 0 ? (profit / row.cost_price!) * 100 : 0
                const isDisabled = !!row.is_disabled
                return (
                  <TableRow key={row.id} className="[&_td]:py-2.5 [&_td]:font-medium">
                    <TableCell className="text-foreground-subtle text-sm">{(pageSize === 'all' ? 0 : (page - 1) * pageSize) + i + 1}</TableCell>
                    <TableCell className="max-w-0">
                      <div className="text-sm text-foreground truncate max-w-[400px]" title={row.trade_name}>{row.trade_name}</div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.unit_name ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {(row.component_count ?? 0).toLocaleString()}
                    </TableCell>
                    {showCost && (
                      <TableCell className="text-sm text-muted-foreground">{formatCurrency(row.cost_price)}</TableCell>
                    )}
                    <TableCell className="text-sm text-foreground">
                      {showCost && showProfit ? (
                        formatCurrency(row.price_retail)
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">
                              {formatCurrency(row.price_retail)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="px-3 py-2">
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
                    {showProfit && (
                      <TableCell className="text-sm">
                        <span className={profit >= 0 ? 'text-success' : 'text-destructive'}>
                          {formatCurrency(profit)}
                          {/* text-xs: user-approved exception to the text-sm minimum rule */}
                          <span className="ml-1 text-xs opacity-70">({pct.toFixed(0)}%)</span>
                        </span>
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
                              onClick={() => navigate(`/products/bundles/${row.id}/edit`)}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-foreground hover:bg-muted transition-colors"
                            >
                              <Edit className="size-4" /> แก้ไข
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
    </div>
  )
}
