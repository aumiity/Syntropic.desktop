import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
import { Search, Plus, Trash2, Boxes, Save } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { ProductBundleItem } from '@/types'
import type { FullProduct } from '../EditProduct/shared'

interface Props {
  product: FullProduct
  productId: number
  onRefresh: () => Promise<void> | void
}

// Local-edit shape — keeps the in-progress form independent of the
// server-side ids. Save sends the array as-is; the backend deletes+inserts
// in one transaction.
interface DraftItem {
  component_product_id: number
  component_name: string
  component_unit_name?: string
  component_cost: number
  component_stock: number
  qty_per_bundle: number
}

// Pattern mirrors Settings CategoriesTab: search → autocomplete dropdown,
// edits are local until "บันทึก" persists via products:saveBundleItems.
// Backend rejects nested bundles + qty<=0 + disabled components — we mirror
// that in the search filter (is_bundle=0) so it's hidden, but the backend
// stays the source of truth for safety.
export function ComponentsTab({ product, productId, onRefresh }: Props) {
  const { toast } = useToast()
  const [items, setItems] = useState<DraftItem[]>([])
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  // Component picker
  const [q, setQ] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  // Seed from server payload once on mount / refresh.
  useEffect(() => {
    const seeded: DraftItem[] = (product.bundle_items ?? []).map((bi: ProductBundleItem) => ({
      component_product_id: bi.component_product_id,
      component_name: bi.component_name ?? '—',
      component_unit_name: bi.component_unit_name,
      component_cost: Number(bi.component_cost ?? 0),
      component_stock: Number(bi.component_stock ?? 0),
      qty_per_bundle: Number(bi.qty_per_bundle ?? 1),
    }))
    setItems(seeded)
    setDirty(false)
  }, [product.bundle_items])

  // Debounced component search — products:list with is_bundle=0 filter.
  useEffect(() => {
    if (!q.trim()) { setSearchResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await window.api.products.list({
          q: q.trim(),
          is_bundle: 0,
          include_disabled: false,
          limit: 20,
        }) as any
        // Hide products that are already in the bundle.
        const existingIds = new Set(items.map(i => i.component_product_id))
        // And the bundle itself (defense in depth — products:saveBundleItems also blocks).
        existingIds.add(productId)
        setSearchResults((res.rows ?? []).filter((r: any) => !existingIds.has(r.id)))
      } finally {
        setSearching(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [q, items, productId])

  // Close picker on outside click.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const addComponent = (p: any) => {
    setItems(prev => [...prev, {
      component_product_id: p.id,
      component_name: p.trade_name,
      component_unit_name: p.unit_name,
      component_cost: Number(p.cost_price ?? 0),
      component_stock: Number(p.stock_qty ?? 0),
      qty_per_bundle: 1,
    }])
    setQ('')
    setSearchResults([])
    setSearchOpen(false)
    setDirty(true)
  }

  const removeAt = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx))
    setDirty(true)
  }

  const updateQty = (idx: number, v: string) => {
    const num = parseFloat(v)
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, qty_per_bundle: isNaN(num) ? 0 : num } : it))
    setDirty(true)
  }

  const totalCost = items.reduce((s, it) => s + it.component_cost * it.qty_per_bundle, 0)

  const handleSave = async () => {
    // Pre-validate so server-side errors don't surface as toasts only — the
    // user sees field-level intent immediately.
    if (items.length === 0) {
      toast({ title: 'กรุณาเพิ่มอย่างน้อย 1 ส่วนประกอบ', variant: 'error' })
      return
    }
    for (const it of items) {
      if (!it.qty_per_bundle || it.qty_per_bundle <= 0) {
        toast({ title: `จำนวนต่อชุดของ "${it.component_name}" ต้องมากกว่า 0`, variant: 'error' })
        return
      }
    }
    setSaving(true)
    try {
      await window.api.products.saveBundleItems(productId, items.map(it => ({
        component_product_id: it.component_product_id,
        qty_per_bundle: it.qty_per_bundle,
      })))
      toast({ title: 'บันทึกส่วนประกอบสำเร็จ', variant: 'success' })
      await onRefresh()
      setDirty(false)
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-card rounded-card shadow-card overflow-hidden">
      <div className="px-2 h-14 shrink-0 flex items-center gap-3">
        <div ref={searchRef} className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            value={q}
            onChange={e => { setQ(e.target.value); setSearchOpen(true) }}
            onFocus={() => setSearchOpen(true)}
            placeholder="ค้นหาสินค้าเพื่อเพิ่มเป็นส่วนประกอบ (ชื่อ / บาร์โค้ด / รหัส)..."
            className="h-10 pl-9 rounded-lg text-sm bg-input"
          />
          {searchOpen && q.trim() && (
            <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-72 overflow-y-auto">
              {searching ? (
                <div className="px-3 py-4 text-sm text-muted-foreground text-center">กำลังค้นหา...</div>
              ) : searchResults.length === 0 ? (
                <div className="px-3 py-4 text-sm text-muted-foreground text-center">ไม่พบสินค้า (หรือถูกเพิ่มไปแล้ว)</div>
              ) : searchResults.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addComponent(p)}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-primary-soft text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-foreground truncate">{p.trade_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.code ?? '—'} · หน่วย {p.unit_name ?? '—'} · ทุน {formatCurrency(p.cost_price)} · คงเหลือ {(p.stock_qty ?? 0).toLocaleString()}
                    </div>
                  </div>
                  <Plus className="size-4 text-primary shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        <Button
          size="lg"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="h-10 px-3 shrink-0"
        >
          <Save className="size-4" /> {saving ? 'กำลังบันทึก...' : 'บันทึกส่วนประกอบ'}
        </Button>
      </div>

      <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-8 border-r-8 border-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-center min-w-14">#</TableHead>
              <TableHead className="min-w-[260px]">ส่วนประกอบ</TableHead>
              <TableHead className="text-center min-w-20">หน่วย</TableHead>
              <TableHead className="text-center min-w-32">จำนวนต่อชุด</TableHead>
              <TableHead className="text-right min-w-28">ราคาทุนต่อหน่วย</TableHead>
              <TableHead className="text-right min-w-28">รวมต่อชุด</TableHead>
              <TableHead className="text-center min-w-24">คงเหลือ</TableHead>
              <TableHead className="text-center min-w-16">ลบ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-16">
                  <Boxes className="size-10 mx-auto mb-2 opacity-30" />
                  ยังไม่มีส่วนประกอบ — ค้นหาแล้วเพิ่มจากด้านบน
                </TableCell>
              </TableRow>
            ) : items.map((it, i) => {
              const lineCost = it.component_cost * it.qty_per_bundle
              return (
                <TableRow key={`${it.component_product_id}-${i}`}>
                  <TableCell className="text-center text-sm tabular-nums text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-semibold text-sm text-foreground">{it.component_name}</TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">{it.component_unit_name ?? '—'}</TableCell>
                  <TableCell className="text-center">
                    <Input
                      type="number" step="any" min="0"
                      value={it.qty_per_bundle}
                      onChange={e => updateQty(i, e.target.value)}
                      className="h-9 w-24 mx-auto text-center"
                    />
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{formatCurrency(it.component_cost)}</TableCell>
                  <TableCell className="text-right text-sm font-semibold tabular-nums text-foreground">{formatCurrency(lineCost)}</TableCell>
                  <TableCell className="text-center text-sm tabular-nums text-muted-foreground">{it.component_stock.toLocaleString()}</TableCell>
                  <TableCell>
                    <div className="flex justify-center">
                      <Button
                        size="icon-lg"
                        variant="destructive"
                        onClick={() => removeAt(i)}
                        title="ลบส่วนประกอบ"
                      >
                        <Trash2 />
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
        <span className="text-muted-foreground">
          {dirty
            ? <span className="text-warning-strong">มีการเปลี่ยนแปลงที่ยังไม่บันทึก</span>
            : <>{items.length.toLocaleString()} ส่วนประกอบ</>}
        </span>
        <span className="text-muted-foreground">
          ต้นทุนรวม (อัตโนมัติ) <span className="font-semibold text-foreground tabular-nums">{formatCurrency(totalCost)}</span>
        </span>
      </div>
    </div>
  )
}
