import { useState, useEffect, useCallback } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import type { ManageOutletContext } from './index'
import { Search, PackagePlus, PackageX, Package, ShoppingCart, TrendingDown } from 'lucide-react'

interface LowStockRow {
  product_id: number
  code: string | null
  trade_name: string
  reorder_point: number
  safety_stock: number | null
  unit_name: string | null
  category_name: string | null
  stock_qty: number
  shortfall: number
  last_supplier_name: string | null
}

interface Category { id: number; name: string }

export default function ManageLowStockPage() {
  const { toast } = useToast()
  const { setSummary } = useOutletContext<ManageOutletContext>()
  const navigate = useNavigate()

  const [q, setQ] = useState('')
  const [categoryId, setCategoryId] = useState<string>('0')
  const [rows, setRows] = useState<LowStockRow[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [outCount, setOutCount] = useState(0)
  const [totalShortfall, setTotalShortfall] = useState(0)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await (window.api.products as any).lowStock({
        q: q.trim() || undefined,
        category_id: categoryId !== '0' ? Number(categoryId) : undefined,
      }) as { rows: LowStockRow[]; count: number; out_count: number; total_shortfall: number }
      setRows(res.rows)
      setOutCount(res.out_count)
      setTotalShortfall(res.total_shortfall)
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
      { label: 'ต้องสั่งซื้อ', value: rows.length.toLocaleString(), icon: Package, tint: 'primary' },
      {
        label: 'หมดสต็อก',
        value: outCount.toLocaleString(),
        icon: PackageX,
        tint: outCount > 0 ? 'destructive' : 'success',
      },
      { label: 'ขาดรวม (หน่วย)', value: totalShortfall.toLocaleString(), icon: TrendingDown, tint: 'warning' },
    ])
  }, [rows.length, outCount, totalShortfall, setSummary])

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

          <Button size="lg" variant="info-soft" className="h-10 px-2 shrink-0" onClick={() => navigate('/purchase')}>
            <PackagePlus className="size-4" /> ไปหน้ารับสินค้า
          </Button>
        </div>

        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-8 border-r-8 border-card">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[240px]">ชื่อสินค้า</TableHead>
                <TableHead className="w-36">หมวดหมู่</TableHead>
                <TableHead className="text-right w-24">คงเหลือ</TableHead>
                <TableHead className="text-right w-24">จุดสั่งซื้อ</TableHead>
                <TableHead className="text-right w-24">สต็อกปลอดภัย</TableHead>
                <TableHead className="text-right w-24">ขาด</TableHead>
                <TableHead className="w-20">หน่วย</TableHead>
                <TableHead className="w-40">ผู้จัดจำหน่ายล่าสุด</TableHead>
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
                    <ShoppingCart className="size-10 mx-auto mb-2 opacity-30" />
                    ไม่มีสินค้าที่ต่ำกว่าจุดสั่งซื้อ
                  </TableCell>
                </TableRow>
              ) : rows.map(r => {
                const isOut = r.stock_qty <= 0
                return (
                  <TableRow key={r.product_id} className={isOut ? 'bg-destructive-soft/30' : ''}>
                    <TableCell className="text-sm font-medium truncate" title={r.trade_name}>
                      {r.trade_name}
                      {r.code && <span className="ml-2 text-xs text-foreground-subtle">{r.code}</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground truncate" title={r.category_name ?? ''}>
                      {r.category_name || <span className="text-foreground-subtle">—</span>}
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
                      {Math.max(0, r.shortfall).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.unit_name || <span className="text-foreground-subtle">—</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground truncate" title={r.last_supplier_name ?? ''}>
                      {r.last_supplier_name || <span className="text-foreground-subtle">—</span>}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        <div className="px-5 h-12 bg-card border-t border-border flex items-center justify-end text-sm shrink-0">
          <span className="text-muted-foreground">
            {loading ? 'กำลังโหลด...' : <>แสดง <span className="font-semibold text-foreground tabular-nums">{rows.length.toLocaleString()}</span> รายการที่ต้องสั่งซื้อ</>}
          </span>
        </div>
      </div>
    </>
  )
}
