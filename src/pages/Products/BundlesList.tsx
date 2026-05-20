import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, SortableTableHead } from '@/components/ui/table'
import { Pagination, type PageSize } from '@/components/ui/pagination'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Toggle } from '@/components/ui/switch'
import { formatCurrency } from '@/lib/utils'
import type { Product } from '@/types'
import { Search, Plus, Edit, Boxes } from 'lucide-react'

type SortField = 'trade_name' | 'cost_price' | 'price_retail' | 'stock_qty'
type SortDir = 'asc' | 'desc'
interface SortState { by: SortField; dir: SortDir }

interface BundleRow extends Product {
  stock_qty: number
  component_count: number
}

export default function BundlesList() {
  const navigate = useNavigate()

  const [rows, setRows] = useState<BundleRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  const [q, setQ] = useState('')
  const [showDisabled, setShowDisabled] = useState(false)
  const [sort, setSort] = useState<SortState>({ by: 'trade_name', dir: 'asc' })

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
        include_disabled: showDisabled,
        is_bundle: 1,
      }) as any
      setRows(res.rows)
      setTotal(res.total)
      setPage(p)
    } finally {
      setLoading(false)
    }
  }, [q, page, pageSize, sort, showDisabled])

  useEffect(() => {
    const t = setTimeout(() => load(1), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, showDisabled, sort, pageSize])

  const toggleSort = (field: SortField) => {
    setSort(s => s.by === field
      ? { by: field, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { by: field, dir: 'asc' })
  }

  const handleCreate = async () => {
    // Quick-create: name + barcode are filled in EditBundle. Create a minimal
    // bundle row so EditBundle has an id to attach components to; the rest of
    // the fields (price, label, etc.) are edited there.
    const fallbackUnit = await window.api.settings.allUnits() as Array<{ id: number; name: string }>
    const bundleUnitId = fallbackUnit.find(u => u.name === 'ชุด')?.id
                      ?? fallbackUnit[0]?.id
    const created: any = await window.api.products.create({
      trade_name: 'ชุดสินค้าใหม่',
      is_bundle: 1,
      is_stock_item: 0,
      unit_id: bundleUnitId ?? null,
      price_retail: 0, price_wholesale1: 0, price_wholesale2: 0,
      cost_price: 0, last_cost_price: 0,
      has_vat: 0, is_drug: 0, is_antibiotic: 0,
      is_fda9: 0, is_fda10: 0, is_fda11: 0, is_fda13: 0,
    })
    if (created?.id) navigate(`/products/bundles/${created.id}/edit`)
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
                <TableHead className="min-w-14">#</TableHead>
                <SortableTableHead field="trade_name" sort={sort} onToggle={toggleSort} className="min-w-[280px]">ชื่อชุดสินค้า</SortableTableHead>
                <TableHead className="text-center min-w-28">ส่วนประกอบ</TableHead>
                <SortableTableHead field="cost_price" align="right" sort={sort} onToggle={toggleSort} className="min-w-28">ต้นทุน (อัตโนมัติ)</SortableTableHead>
                <SortableTableHead field="price_retail" align="right" sort={sort} onToggle={toggleSort} className="min-w-28">ราคาขาย</SortableTableHead>
                <SortableTableHead field="stock_qty" align="center" sort={sort} onToggle={toggleSort} className="min-w-28">ประกอบได้</SortableTableHead>
                <TableHead className="text-center min-w-16">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-16">กำลังโหลด...</TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-16">
                    <Boxes className="size-10 mx-auto mb-2 opacity-30" />
                    ยังไม่มีชุดสินค้า
                  </TableCell>
                </TableRow>
              ) : rows.map((row, i) => {
                const isDisabled = !!row.is_disabled
                return (
                  <TableRow key={row.id} className={isDisabled ? 'opacity-60' : ''}>
                    <TableCell className="text-foreground-subtle text-sm tabular-nums">{(pageSize === 'all' ? 0 : (page - 1) * pageSize) + i + 1}</TableCell>
                    <TableCell className="max-w-0">
                      <div className="font-semibold text-sm text-foreground truncate max-w-[400px]" title={row.trade_name}>{row.trade_name}</div>
                    </TableCell>
                    <TableCell className="text-center text-sm tabular-nums text-muted-foreground">
                      {(row.component_count ?? 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{formatCurrency(row.cost_price)}</TableCell>
                    <TableCell className="text-right text-sm font-semibold tabular-nums text-foreground">{formatCurrency(row.price_retail)}</TableCell>
                    <TableCell className="text-center">
                      {row.stock_qty <= 0
                        ? <Badge variant="destructive" className="rounded-lg gap-1.5"><span className="size-1.5 rounded-full bg-white/90" />ประกอบไม่ได้</Badge>
                        : <span className="text-sm font-semibold tabular-nums text-foreground">{row.stock_qty.toLocaleString()}</span>}
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
