import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Pagination } from '@/components/ui/pagination'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { getCurrentUserId } from '@/stores/userStore'
import { formatCurrency } from '@/lib/utils'
import { PageHeader } from '@/components/layout/PageHeader'
import type { Product, ProductCategory, DrugType } from '@/types'
import {
  Search, Plus, Edit2, AlertTriangle, Package, PackageX,
  Boxes, ArrowUpCircle, ArrowDownCircle,
} from 'lucide-react'

interface ProductRow extends Product {
  category_name?: string
  drug_type_name?: string
  dosage_form_name?: string
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

  // Dropdown data
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [drugTypes, setDrugTypes] = useState<DrugType[]>([])

  // Create product dialog
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newProduct, setNewProduct] = useState({
    trade_name: '',
    barcode: '',
    price_retail: '',
    unit_name: '',
    category_id: 0,
  })

  // Adjust stock dialog
  const [adjustProduct, setAdjustProduct] = useState<ProductRow | null>(null)
  const [adjustType, setAdjustType] = useState<'in' | 'out'>('in')
  const [adjustQty, setAdjustQty] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [adjusting, setAdjusting] = useState(false)

  // Global stock stats (across all pages)
  const [allStats, setAllStats] = useState({ out: 0, low: 0 })

  const limit = 50
  const totalPages = Math.ceil(total / limit)

  useEffect(() => {
    loadDropdowns()
  }, [])

  // Live search: debounce text + reactive filters
  useEffect(() => {
    const t = setTimeout(() => {
      load(1)
      window.api.products.stockStats({
        q: q.trim() || undefined,
        category_id: categoryId || undefined,
        drug_type_id: drugTypeId || undefined,
      }).then((s: any) => setAllStats(s ?? { out: 0, low: 0 }))
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, categoryId, drugTypeId])

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
      }) as any
      setRows(res.rows)
      setTotal(res.total)
      setPage(p)
    } finally {
      setLoading(false)
    }
  }, [q, categoryId, drugTypeId, page])

  // --- Create product ---
  const handleCreate = async () => {
    if (!newProduct.trade_name.trim()) {
      toast({ title: 'กรุณาระบุชื่อสินค้า', variant: 'error' })
      return
    }
    setCreating(true)
    try {
      const created = await window.api.products.create({
        trade_name: newProduct.trade_name.trim(),
        barcode: newProduct.barcode.trim() || null,
        price_retail: parseFloat(newProduct.price_retail) || 0,
        unit_name: newProduct.unit_name.trim() || null,
        category_id: newProduct.category_id || null,
        is_stock_item: 1,
        price_wholesale1: 0,
        price_wholesale2: 0,
        has_vat: 0,
        no_discount: 0,
        reorder_point: 0,
        safety_stock: 0,
        is_original_drug: 0,
        is_antibiotic: 0,
        is_fda_report: 0,
        is_fda13_report: 0,
        is_sale_control: 0,
      }) as any
      setShowCreate(false)
      setNewProduct({ trade_name: '', barcode: '', price_retail: '', unit_name: '', category_id: 0 })
      toast({ title: 'เพิ่มสินค้าสำเร็จ', variant: 'success' })
      navigate(`/products/${created.id}/edit`)
    } catch (e: any) {
      toast({ title: 'เพิ่มสินค้าไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally {
      setCreating(false)
    }
  }

  // --- Adjust stock ---
  const openAdjust = (p: ProductRow) => {
    setAdjustProduct(p)
    setAdjustType('in')
    setAdjustQty('')
    setAdjustNote('')
  }

  const handleAdjust = async () => {
    if (!adjustProduct) return
    const qty = parseInt(adjustQty)
    if (!qty || qty <= 0) { toast({ title: 'กรุณาระบุจำนวน', variant: 'error' }); return }
    if (!adjustNote.trim()) { toast({ title: 'กรุณาระบุหมายเหตุ', variant: 'error' }); return }
    setAdjusting(true)
    try {
      await window.api.products.adjustStock(adjustProduct.id, { qty, type: adjustType, note: adjustNote, userId: getCurrentUserId() })
      toast({ title: 'ปรับสต็อกสำเร็จ', variant: 'success' })
      setAdjustProduct(null)
      load(page)
    } catch (e: any) {
      toast({ title: 'ปรับสต็อกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally {
      setAdjusting(false)
    }
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

            {/* Stat strip — global stock health */}
      <div className="grid grid-cols-3 gap-3 shrink-0">
        <StatCard
          label="สินค้าทั้งหมด"
          value={total.toLocaleString()}
          icon={<Boxes className="size-5" />}
          tint="primary"
        />
        <StatCard
          label="ใกล้หมด"
          value={allStats.low.toLocaleString()}
          icon={<AlertTriangle className="size-5" />}
          tint="warning"
        />
        <StatCard
          label="หมดสต็อก"
          value={allStats.out.toLocaleString()}
          icon={<PackageX className="size-5" />}
          tint="destructive"
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
          <SelectTrigger className="h-10 w-48 rounded-xl bg-card text-sm">
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
          <SelectTrigger className="h-10 w-48 rounded-xl bg-card text-sm">
            <SelectValue placeholder="ประเภทยาทั้งหมด" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">ประเภทยาทั้งหมด</SelectItem>
            {drugTypes.map(d => (
              <SelectItem key={d.id} value={String(d.id)}>{d.name_th}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List card */}
      <div className="flex flex-1 flex-col min-h-0 bg-card rounded-2xl shadow-card overflow-hidden">
        <div className="px-5 py-2.5 text-sm font-semibold text-muted-foreground border-b border-border shrink-0 flex items-center justify-between">
          <span>{loading ? 'กำลังโหลด...' : `พบ ${total.toLocaleString()} รายการ`}</span>
          <Button onClick={() => setShowCreate(true)} className="h-9 rounded-lg px-2 text-sm">
            <Plus className="size-4" /> เพิ่มสินค้า
          </Button>
        </div>

        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin">
          <Table>
            <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-muted [&_th]:shadow-[0_1px_0_var(--border)]">
              <TableRow>
                <TableHead className="w-12 text-foreground-subtle">#</TableHead>
                <TableHead className="text-foreground-subtle">ชื่อสินค้า</TableHead>
                <TableHead className="text-center text-foreground-subtle">หน่วย</TableHead>
                <TableHead className="text-right text-foreground-subtle">ต้นทุน</TableHead>
                <TableHead className="text-right text-foreground-subtle">ราคาขาย</TableHead>
                <TableHead className="text-right text-foreground-subtle">กำไร</TableHead>
                <TableHead className="text-center text-foreground-subtle">สต็อก</TableHead>
                <TableHead className="text-center w-28 text-foreground-subtle">จัดการ</TableHead>
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
                return (
                  <TableRow key={row.id} className="hover:bg-primary-soft/60 transition-colors">
                    <TableCell className="text-foreground-subtle text-xs tabular-nums">{(page - 1) * limit + i + 1}</TableCell>
                    <TableCell>
                      <div className="font-semibold text-sm text-foreground">{row.trade_name}</div>
                      {row.dosage_form_name && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {row.dosage_form_name}{row.strength ? ` · ${row.strength}` : ''}
                        </div>
                      )}
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {row.is_antibiotic ? <Badge variant="warning" className="text-[10px] rounded-md px-1.5 py-0">ยาปฏิชีวนะ</Badge> : null}
                        {row.is_sale_control ? <Badge variant="destructive" className="text-[10px] rounded-md px-1.5 py-0">ควบคุม</Badge> : null}
                        {row.is_fda13_report ? <Badge variant="senary" className="text-[10px] rounded-md px-1.5 py-0">อย.13</Badge> : null}
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
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => navigate(`/products/${row.id}/edit`)}
                          title="แก้ไข"
                        >
                          <Edit2 />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
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

      {/* Create product dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent size="md" onClose={() => setShowCreate(false)}>
          <DialogHeader>
            <DialogTitle>เพิ่มสินค้าใหม่</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">ชื่อสินค้า <span className="text-destructive">*</span></label>
              <Input
                value={newProduct.trade_name}
                onChange={e => setNewProduct(p => ({ ...p, trade_name: e.target.value }))}
                placeholder="เช่น Paracetamol 500mg"
                className="h-10 rounded-xl"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">บาร์โค้ด</label>
              <Input
                value={newProduct.barcode}
                onChange={e => setNewProduct(p => ({ ...p, barcode: e.target.value }))}
                placeholder="8851234567890"
                className="h-10 rounded-xl"
              />
              <p className="mt-1 text-xs text-muted-foreground">รหัสสินค้าจะถูกสร้างอัตโนมัติ (P0001, P0002, …)</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">ราคาขายปลีก</label>
                <Input
                  type="number"
                  value={newProduct.price_retail}
                  onChange={e => setNewProduct(p => ({ ...p, price_retail: e.target.value }))}
                  placeholder="0.00"
                  min={0}
                  step="0.01"
                  className="h-10 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">หน่วยนับ</label>
                <Input
                  value={newProduct.unit_name}
                  onChange={e => setNewProduct(p => ({ ...p, unit_name: e.target.value }))}
                  placeholder="เช่น เม็ด, ซอง, ขวด"
                  className="h-10 rounded-xl"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">หมวดหมู่</label>
              <Select
                value={String(newProduct.category_id)}
                onValueChange={v => setNewProduct(p => ({ ...p, category_id: Number(v) }))}
              >
                <SelectTrigger className="h-10 w-full rounded-xl">
                  <SelectValue placeholder="— ไม่ระบุ —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">— ไม่ระบุ —</SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">สามารถเพิ่มข้อมูลอื่นๆ ได้ในหน้าแก้ไขสินค้า</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" className="h-10 rounded-xl px-5" onClick={() => setShowCreate(false)}>ยกเลิก</Button>
            <Button onClick={handleCreate} disabled={creating} className="h-10 rounded-xl px-5">
              {creating ? 'กำลังบันทึก...' : 'เพิ่มสินค้า'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjust stock dialog */}
      <Dialog open={!!adjustProduct} onOpenChange={open => { if (!open) setAdjustProduct(null) }}>
        <DialogContent size="sm" onClose={() => setAdjustProduct(null)}>
          <DialogHeader>
            <DialogTitle>ปรับสต็อก</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {adjustProduct && (
              <div className="bg-muted rounded-xl px-4 py-3">
                <div className="font-semibold text-sm">{adjustProduct.trade_name}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  สต็อกปัจจุบัน:{' '}
                  <span className="font-bold text-foreground tabular-nums">{adjustProduct.stock_qty.toLocaleString()}</span>{' '}
                  {adjustProduct.unit_name ?? 'ชิ้น'}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-2">ประเภทการปรับ</label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={adjustType === 'in' ? 'success' : 'secondary'}
                  className="h-10 rounded-xl"
                  onClick={() => setAdjustType('in')}
                >
                  <ArrowUpCircle /> เพิ่มสต็อก
                </Button>
                <Button
                  type="button"
                  variant={adjustType === 'out' ? 'destructive' : 'secondary'}
                  className="h-10 rounded-xl"
                  onClick={() => setAdjustType('out')}
                >
                  <ArrowDownCircle /> ลดสต็อก
                </Button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">จำนวน <span className="text-destructive">*</span></label>
              <Input
                type="number"
                value={adjustQty}
                onChange={e => setAdjustQty(e.target.value)}
                placeholder="0"
                min={1}
                className="h-10 rounded-xl"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">หมายเหตุ <span className="text-destructive">*</span></label>
              <Input
                value={adjustNote}
                onChange={e => setAdjustNote(e.target.value)}
                placeholder="เหตุผลการปรับสต็อก"
                className="h-10 rounded-xl"
                onKeyDown={e => { if (e.key === 'Enter') handleAdjust() }}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" className="h-10 rounded-xl px-5" onClick={() => setAdjustProduct(null)}>ยกเลิก</Button>
            <Button
              onClick={handleAdjust}
              disabled={adjusting}
              variant={adjustType === 'out' ? 'destructive' : 'success'}
              className="h-10 rounded-xl px-5"
            >
              {adjusting ? 'กำลังบันทึก...' : 'ยืนยัน'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface StatCardProps {
  label: string
  value: string
  icon: React.ReactNode
  tint: 'primary' | 'warning' | 'destructive'
}

function StatCard({ label, value, icon, tint }: StatCardProps) {
  const iconBox =
    tint === 'primary' ? 'bg-primary-soft text-primary'
    : tint === 'warning' ? 'bg-warning-soft text-warning-strong'
    : 'bg-destructive-soft text-destructive'
  return (
    <div className="bg-card rounded-2xl shadow-card px-4 py-3 flex items-center gap-3">
      <span className={`grid place-items-center size-11 rounded-xl shrink-0 ${iconBox}`}>
        {icon}
      </span>
      <div className="flex flex-col min-w-0">
        <span className="text-xs text-muted-foreground truncate">{label}</span>
        <span className="text-2xl font-bold tabular-nums leading-tight">{value}</span>
      </div>
    </div>
  )
}
