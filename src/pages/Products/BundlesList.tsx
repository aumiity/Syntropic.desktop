import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, SortableTableHead } from '@/components/ui/table'
import { Pagination, type PageSize } from '@/components/ui/pagination'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Toggle } from '@/components/ui/switch'
import { formatCurrency } from '@/lib/utils'
import type { Product } from '@/types'
import type { ProductsOutletContext } from './index'
import { Search, Plus, Edit, Boxes, CheckCircle2, Ban } from 'lucide-react'

type SortField = 'trade_name' | 'unit_name' | 'cost_price' | 'price_retail' | 'profit' | 'stock_qty'
type SortDir = 'asc' | 'desc'
interface SortState { by: SortField; dir: SortDir }

interface BundleRow extends Product {
  unit_name?: string
  stock_qty: number
  component_count: number
}

export default function BundlesList() {
  const navigate = useNavigate()
  const { setSummary } = useOutletContext<ProductsOutletContext>()

  const [rows, setRows] = useState<BundleRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  const [q, setQ] = useState('')
  const [showDisabled, setShowDisabled] = useState(false)
  const [stockFilter, setStockFilter] = useState<'all' | 'enabled' | 'disabled'>('all')
  const [sort, setSort] = useState<SortState>({ by: 'trade_name', dir: 'asc' })

  // Global bundle stats (total / enabled / disabled). Same shape as
  // products:stockStats with is_bundle=1; "ใช้งาน" = total_all - disabled.
  const [allStats, setAllStats] = useState({ total_all: 0, disabled: 0 })

  const [pageSize, setPageSize] = useState<PageSize>(50)
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
        include_disabled: showDisabled,
        is_bundle: 1,
      }) as any
      setRows(res.rows)
      setTotal(res.total)
      setPage(p)
    } finally {
      setLoading(false)
    }
  }, [q, page, pageSize, sort, stockFilter, showDisabled])

  useEffect(() => {
    const t = setTimeout(() => {
      load(1)
      window.api.products.stockStats({
        q: q.trim() || undefined,
        include_disabled: showDisabled,
        is_bundle: 1,
      }).then((s: any) => setAllStats(s ?? { total_all: 0, disabled: 0 }))
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, showDisabled, stockFilter, sort, pageSize])

  const toggleSort = (field: SortField) => {
    setSort(s => s.by === field
      ? { by: field, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { by: field, dir: 'asc' })
  }

  const toggleStockFilter = (next: 'all' | 'enabled' | 'disabled') => {
    setStockFilter(curr => (next === 'all' ? 'all' : curr === next ? 'all' : next))
  }

  // Push the 3 clickable stat cards up to ProductsLayout. "ใช้งาน" =
  // total_all − disabled (enabled bundles).
  useEffect(() => {
    setSummary([
      { label: 'ชุดสินค้าทั้งหมด', value: allStats.total_all.toLocaleString(), icon: Boxes, tint: 'primary',
        onClick: () => toggleStockFilter('all'), isActive: stockFilter === 'all' },
      { label: 'ใช้งาน', value: Math.max(0, allStats.total_all - allStats.disabled).toLocaleString(), icon: CheckCircle2, tint: 'success',
        onClick: () => toggleStockFilter('enabled'), isActive: stockFilter === 'enabled' },
      { label: 'ปิดการใช้งาน', value: allStats.disabled.toLocaleString(), icon: Ban, tint: 'secondary',
        onClick: () => toggleStockFilter('disabled'), isActive: stockFilter === 'disabled' },
    ])
  }, [allStats, stockFilter, setSummary])

  const handleCreate = () => {
    // No DB row yet — EditBundle in "new" mode commits atomically (product +
    // >=2 components in one transaction) so we never leave an orphan bundle
    // with <2 components in the DB.
    navigate('/products/bundles/new')
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex flex-1 flex-col min-h-0 bg-card rounded-card shadow-card overflow-hidden">
        <div className="px-2 h-14 shrink-0 flex items-center gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="ค้นหาชื่อชุด, บาร์โค้ด, รหัส..."
              className="h-10 pl-9 rounded-lg text-sm bg-input"
            />
          </div>

          <Toggle className="shrink-0 text-muted-foreground" framed="input" size="lg" checked={showDisabled} onChange={setShowDisabled} label="แสดงที่ปิดใช้งาน" />

          <Button onClick={handleCreate} size="lg" className="h-10 px-2 shrink-0">
            <Plus className="size-4" /> เพิ่มชุดสินค้า
          </Button>
        </div>

        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-8 border-r-8 border-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <SortableTableHead field="trade_name" sort={sort} onToggle={toggleSort} className="min-w-[280px]">ชื่อชุดสินค้า</SortableTableHead>
                <SortableTableHead field="unit_name" align="center" sort={sort} onToggle={toggleSort} className="min-w-24">หน่วย</SortableTableHead>
                <TableHead className="text-center min-w-20">รายการ</TableHead>
                <SortableTableHead field="cost_price" align="right" sort={sort} onToggle={toggleSort} className="min-w-24">ต้นทุน</SortableTableHead>
                <SortableTableHead field="price_retail" align="right" sort={sort} onToggle={toggleSort} className="min-w-24">ราคาขาย</SortableTableHead>
                <SortableTableHead field="profit" align="right" sort={sort} onToggle={toggleSort} className="min-w-24">กำไร</SortableTableHead>
                <TableHead className="text-center min-w-20">จัดการ</TableHead>
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
                    <Boxes className="size-10 mx-auto mb-2 opacity-30" />
                    ยังไม่มีชุดสินค้า
                  </TableCell>
                </TableRow>
              ) : rows.map((row, i) => {
                const profit = row.price_retail - (row.cost_price ?? 0)
                const pct = (row.cost_price ?? 0) > 0 ? (profit / row.cost_price!) * 100 : 0
                const isDisabled = !!row.is_disabled
                return (
                  <TableRow key={row.id} className={isDisabled ? 'opacity-60' : ''}>
                    <TableCell className="text-foreground-subtle text-sm tabular-nums">{(pageSize === 'all' ? 0 : (page - 1) * pageSize) + i + 1}</TableCell>
                    <TableCell className="max-w-0">
                      <div className="font-semibold text-sm text-foreground truncate max-w-[400px]" title={row.trade_name}>{row.trade_name}</div>
                    </TableCell>
                    <TableCell className="text-center text-sm text-muted-foreground">{row.unit_name ?? '—'}</TableCell>
                    <TableCell className="text-center text-sm tabular-nums text-muted-foreground">
                      {(row.component_count ?? 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{formatCurrency(row.cost_price)}</TableCell>
                    <TableCell className="text-right text-sm font-semibold tabular-nums text-foreground">{formatCurrency(row.price_retail)}</TableCell>
                    <TableCell className="hidden md:table-cell text-right text-sm font-medium tabular-nums">
                      <span className={profit >= 0 ? 'text-success' : 'text-destructive'}>
                        {formatCurrency(profit)}
                        {/* text-xs: user-approved exception to the text-sm minimum rule */}
                        <span className="ml-1 text-xs opacity-70">({pct.toFixed(0)}%)</span>
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-center">
                        <Button
                          size="icon-lg"
                          variant="outline"
                          onClick={() => navigate(`/products/bundles/${row.id}/edit`)}
                          title="แก้ไข"
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

        <div className="px-5 h-12 bg-card border-t border-border flex items-center justify-between gap-3 text-sm shrink-0">
          <div className="flex items-center gap-2 text-muted-foreground shrink-0">
            <span>แสดง</span>
            <Select value={String(pageSize)} onValueChange={v => setPageSize(v === 'all' ? 'all' : Number(v))}>
              <SelectTrigger className="h-9 min-w-20">
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
            <span>รายการ</span>
          </div>
          <div className="flex-1 flex justify-center">
            <Pagination page={page} totalPages={totalPages} onPageChange={p => load(p)} className="w-auto justify-center" />
          </div>
          <span className="text-muted-foreground shrink-0">
            {loading ? 'กำลังโหลด...' : <>แสดง <span className="font-semibold text-foreground tabular-nums">{total.toLocaleString()}</span> รายการ</>}
          </span>
        </div>
      </div>
    </div>
  )
}
