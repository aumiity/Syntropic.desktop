import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Pagination } from '@/components/ui/pagination'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, formatExpiry, getExpiryStatus } from '@/lib/utils'
import type { Product, ProductCategory, DrugType } from '@/types'
import { Search, Plus, Edit2, AlertTriangle, Package, ChevronDown } from 'lucide-react'

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
    code: '',
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

  const limit = 50
  const totalPages = Math.ceil(total / limit)

  useEffect(() => {
    loadDropdowns()
  }, [])

  useEffect(() => {
    load(1)
  }, [categoryId, drugTypeId])

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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    load(1)
  }

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
        code: newProduct.code.trim() || null,
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
      setNewProduct({ trade_name: '', code: '', barcode: '', price_retail: '', unit_name: '', category_id: 0 })
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
      await window.api.products.adjustStock(adjustProduct.id, { qty, type: adjustType, note: adjustNote, userId: 1 })
      toast({ title: 'ปรับสต็อกสำเร็จ', variant: 'success' })
      setAdjustProduct(null)
      load(page)
    } catch (e: any) {
      toast({ title: 'ปรับสต็อกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally {
      setAdjusting(false)
    }
  }

  const stockBadge = (qty: number, reorder: number) => {
    if (qty <= 0) return <Badge variant="destructive" className="text-xs">หมดสต็อก</Badge>
    if (reorder > 0 && qty <= reorder) return <Badge variant="warning" className="text-xs">ต่ำกว่าจุดสั่ง</Badge>
    return <span className="text-sm font-medium">{qty.toLocaleString()}</span>
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-semibold">สินค้า</h1>
          <p className="text-sm text-muted-foreground">จัดการรายการสินค้าและยา</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> เพิ่มสินค้า
        </Button>
      </div>

      {/* Filters */}
      <div className="px-6 py-3 border-b border-border bg-muted/30 shrink-0">
        <form onSubmit={handleSearch} className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="ค้นหาชื่อ, บาร์โค้ด, รหัส..."
              className="pl-8"
            />
          </div>

          {/* Category filter */}
          <div className="relative w-44">
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-3 pr-8 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-ring"
              value={categoryId}
              onChange={e => setCategoryId(Number(e.target.value))}
            >
              <option value={0}>หมวดหมู่ทั้งหมด</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>

          {/* Drug type filter */}
          <div className="relative w-44">
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-3 pr-8 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-ring"
              value={drugTypeId}
              onChange={e => setDrugTypeId(Number(e.target.value))}
            >
              <option value={0}>ประเภทยาทั้งหมด</option>
              {drugTypes.map(d => <option key={d.id} value={d.id}>{d.name_th}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>

          <Button type="submit" variant="outline">
            <Search className="w-3.5 h-3.5 mr-1" /> ค้นหา
          </Button>
        </form>
      </div>

      {/* Summary bar */}
      <div className="px-6 py-2 text-xs text-muted-foreground border-b border-border shrink-0">
        {loading ? 'กำลังโหลด...' : `พบ ${total.toLocaleString()} รายการ`}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>ชื่อสินค้า</TableHead>
              <TableHead>บาร์โค้ด</TableHead>
              <TableHead>หมวดหมู่</TableHead>
              <TableHead>ประเภทยา</TableHead>
              <TableHead className="text-right">ราคาขาย</TableHead>
              <TableHead className="text-center">สต็อก</TableHead>
              <TableHead className="text-center w-32">จัดการ</TableHead>
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
                  <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  ไม่พบสินค้า
                </TableCell>
              </TableRow>
            ) : rows.map((row, i) => (
              <TableRow key={row.id} className="hover:bg-muted/30">
                <TableCell className="text-muted-foreground text-xs">{(page - 1) * limit + i + 1}</TableCell>
                <TableCell>
                  <div className="font-medium">{row.trade_name}</div>
                  {row.dosage_form_name && (
                    <div className="text-xs text-muted-foreground">{row.dosage_form_name}{row.strength ? ` ${row.strength}` : ''}</div>
                  )}
                  <div className="flex gap-1 mt-0.5 flex-wrap">
                    {row.is_antibiotic ? <Badge variant="warning" className="text-xs">ยาปฏิชีวนะ</Badge> : null}
                    {row.is_sale_control ? <Badge variant="danger" className="text-xs">ควบคุม</Badge> : null}
                    {row.is_fda13_report ? <Badge variant="secondary" className="text-xs">อย.13</Badge> : null}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="font-mono text-xs text-muted-foreground">{row.code ?? '—'}</div>
                  {row.barcode && <div className="font-mono text-xs text-muted-foreground">{row.barcode}</div>}
                </TableCell>
                <TableCell className="text-sm">{row.category_name ?? '—'}</TableCell>
                <TableCell className="text-sm">{row.drug_type_name ?? '—'}</TableCell>
                <TableCell className="text-right font-medium">{formatCurrency(row.price_retail)}</TableCell>
                <TableCell className="text-center">
                  {stockBadge(row.stock_qty, row.reorder_point ?? 0)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => navigate(`/products/${row.id}/edit`)}
                      title="แก้ไข"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openAdjust(row)}
                      title="ปรับสต็อก"
                    >
                      <Package className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-6 py-3 border-t border-border flex justify-center shrink-0">
          <Pagination page={page} totalPages={totalPages} onPageChange={p => load(p)} />
        </div>
      )}

      {/* Create product dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent size="md">
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
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">รหัสสินค้า</label>
                <Input
                  value={newProduct.code}
                  onChange={e => setNewProduct(p => ({ ...p, code: e.target.value }))}
                  placeholder="เช่น MED001"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">บาร์โค้ด</label>
                <Input
                  value={newProduct.barcode}
                  onChange={e => setNewProduct(p => ({ ...p, barcode: e.target.value }))}
                  placeholder="8851234567890"
                />
              </div>
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
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">หน่วยนับ</label>
                <Input
                  value={newProduct.unit_name}
                  onChange={e => setNewProduct(p => ({ ...p, unit_name: e.target.value }))}
                  placeholder="เช่น เม็ด, ซอง, ขวด"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">หมวดหมู่</label>
              <div className="relative">
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 pr-8 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-ring"
                  value={newProduct.category_id}
                  onChange={e => setNewProduct(p => ({ ...p, category_id: Number(e.target.value) }))}
                >
                  <option value={0}>— ไม่ระบุ —</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">สามารถเพิ่มข้อมูลอื่นๆ ได้ในหน้าแก้ไขสินค้า</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>ยกเลิก</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? 'กำลังบันทึก...' : 'เพิ่มสินค้า'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjust stock dialog */}
      <Dialog open={!!adjustProduct} onOpenChange={open => { if (!open) setAdjustProduct(null) }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>ปรับสต็อก</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {adjustProduct && (
              <div className="bg-muted/40 rounded-lg px-4 py-3">
                <div className="font-medium">{adjustProduct.trade_name}</div>
                <div className="text-sm text-muted-foreground mt-0.5">
                  สต็อกปัจจุบัน: <span className="font-semibold text-foreground">{adjustProduct.stock_qty.toLocaleString()}</span> {adjustProduct.unit_name ?? 'ชิ้น'}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-2">ประเภทการปรับ</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAdjustType('in')}
                  className={`flex-1 h-9 rounded-md border text-sm font-medium transition-colors ${adjustType === 'in' ? 'bg-green-600 text-white border-green-600' : 'border-input bg-background hover:bg-accent'}`}
                >
                  เพิ่มสต็อก
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustType('out')}
                  className={`flex-1 h-9 rounded-md border text-sm font-medium transition-colors ${adjustType === 'out' ? 'bg-destructive text-destructive-foreground border-destructive' : 'border-input bg-background hover:bg-accent'}`}
                >
                  ลดสต็อก
                </button>
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
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">หมายเหตุ <span className="text-destructive">*</span></label>
              <Input
                value={adjustNote}
                onChange={e => setAdjustNote(e.target.value)}
                placeholder="เหตุผลการปรับสต็อก"
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustProduct(null)}>ยกเลิก</Button>
            <Button
              onClick={handleAdjust}
              disabled={adjusting}
              variant={adjustType === 'out' ? 'destructive' : 'default'}
            >
              {adjusting ? 'กำลังบันทึก...' : 'ยืนยัน'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
