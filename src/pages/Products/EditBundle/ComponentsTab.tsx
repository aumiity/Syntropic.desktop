import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ProductSearchDialog } from '@/components/dialogs/ProductSearchDialog'
import { useToast } from '@/components/ui/toast'
import { TintIcon } from '@/components/ui/tint-icon'
import { Plus, Trash2, Boxes, Save } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { ProductBundleItem } from '@/types'
import type { FullProduct } from '../EditProduct/shared'
 
interface Props {
  // null when creating a brand-new bundle (no DB row yet).
  product: FullProduct | null
  // null in new-mode — no IPC save here; parent commits atomically.
  productId: number | null
  onRefresh?: () => Promise<void> | void
  // New-mode (controlled): when provided, items live in parent state and
  // no Save button is shown. The parent's main "สร้างชุดสินค้า" calls
  // products:createBundle with these items. Uncontrolled mode (edit) keeps
  // the original behavior — local items + products:saveBundleItems.
  controlledItems?: DraftItem[]
  onControlledItemsChange?: (items: DraftItem[]) => void
}

// Local-edit shape — keeps the in-progress form independent of the
// server-side ids. Save sends the array as-is; the backend deletes+inserts
// in one transaction.
export interface DraftItem {
  component_product_id: number
  component_name: string
  component_unit_name?: string
  component_cost: number
  component_sell_price: number
  component_stock: number
  qty_per_bundle: number
}

// Search-modal row shape (subset of what products:list returns).
interface SearchRow {
  id: number
  trade_name: string
  code: string | null
  unit_name: string | null
  cost_price: number
  price_retail: number
  stock_qty: number
}

// A "+ เพิ่มรายการ" button opens the shared ProductSearchDialog (same picker as
// POS). Backend rejects nested bundles + qty<=0 + disabled components; the
// filter here (is_bundle=0, include_disabled=false) just hides them.
export function ComponentsTab({ product, productId, onRefresh, controlledItems, onControlledItemsChange }: Props) {
  const { toast } = useToast()
  const isControlled = controlledItems !== undefined && onControlledItemsChange !== undefined
  const [localItems, setLocalItems] = useState<DraftItem[]>([])
  const items = isControlled ? controlledItems! : localItems
  const setItems = (updater: DraftItem[] | ((prev: DraftItem[]) => DraftItem[])) => {
    if (isControlled) {
      const next = typeof updater === 'function' ? (updater as (p: DraftItem[]) => DraftItem[])(controlledItems!) : updater
      onControlledItemsChange!(next)
    } else {
      setLocalItems(updater)
    }
  }
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  // Confirm-before-remove — guards against a misclick on the trash button
  // wiping a component. Holds the row index + a snapshot for the dialog copy;
  // the index stays valid because the modal blocks all other interaction.
  const [deleteTarget, setDeleteTarget] = useState<{ idx: number; item: DraftItem } | null>(null)

  // Per-row edit strings for the qty input — keyed by component_product_id.
  // Decouples the displayed string from the parsed number so the user can clear
  // the field or type transient forms ("0", "0.5", "01") without parseFloat
  // snapping the display back. React's controlled-input diffing won't sync the
  // DOM when value prop is unchanged — so "01" parsing to 1 (same as prior
  // state) would otherwise leave the typed "01" stuck in the input forever.
  const [qtyDrafts, setQtyDrafts] = useState<Record<number, string>>({})

  // Component picker — a "+ เพิ่มรายการ" button opens the shared search dialog,
  // which owns its own input focus + keyboard nav.
  const [searchOpen, setSearchOpen] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchRow[]>([])
  const [searching, setSearching] = useState(false)

  // Seed from server payload on mount / refresh. In controlled (new) mode the
  // parent owns items — skip seeding entirely.
  useEffect(() => {
    if (isControlled) return
    const seeded: DraftItem[] = (product?.bundle_items ?? []).map((bi: ProductBundleItem) => ({
      component_product_id: bi.component_product_id,
      component_name: bi.component_name ?? '—',
      component_unit_name: bi.component_unit_name,
      component_cost: Number(bi.component_cost ?? 0),
      component_sell_price: Number(bi.component_sell_price ?? 0),
      component_stock: Number(bi.component_stock ?? 0),
      qty_per_bundle: Number(bi.qty_per_bundle ?? 1),
    }))
    setLocalItems(seeded)
    setQtyDrafts({})
    setDirty(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.bundle_items, isControlled])

  // Debounced search — products:list with is_bundle=0 filter, excluding items
  // already in the bundle and the bundle product itself.
  const existingIds = items.map(i => i.component_product_id).join(',')
  useEffect(() => {
    if (!q.trim()) { setResults([]); setSearching(false); return }
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const res = await window.api.products.list({
          q: q.trim(),
          is_bundle: 0,
          include_disabled: false,
          limit: 30,
        }) as any
        const skip = new Set<number>(items.map(i => i.component_product_id))
        if (productId) skip.add(productId)
        setResults((res.rows ?? []).filter((r: SearchRow) => !skip.has(r.id)))
      } finally {
        setSearching(false)
      }
    }, 200)
    return () => clearTimeout(t)
    // existingIds folds items into a stable dep so the filter refreshes as the
    // bundle grows without re-running on every unrelated render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, existingIds, productId])

  // The dialog's input drives the query; clearing it just empties the results
  // (the dialog stays open — it's opened/closed by the button + Esc, not text).
  const handleSearch = (val: string) => {
    setQ(val)
    if (!val.trim()) setResults([])
  }

  const openSearch = () => { setQ(''); setResults([]); setSearchOpen(true) }

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setQ('')
    setResults([])
  }, [])

  const addComponent = (p: SearchRow) => {
    setItems(prev => [...prev, {
      component_product_id: p.id,
      component_name: p.trade_name,
      component_unit_name: p.unit_name ?? undefined,
      component_cost: Number(p.cost_price ?? 0),
      component_sell_price: Number(p.price_retail ?? 0),
      component_stock: Number(p.stock_qty ?? 0),
      qty_per_bundle: 1,
    }])
    // Clear any stale draft so a re-added component shows the seeded "1"
    // instead of a string left over from a previous edit on the same id.
    setQtyDrafts(prev => {
      const next = { ...prev }
      delete next[p.id]
      return next
    })
    setDirty(true)
    // Close after add (POS pattern) — main input auto-refocuses via the
    // searchOpen→false effect above, so the next search is one keystroke away.
    closeSearch()
  }

  const removeAt = (idx: number) => {
    const removed = items[idx]
    const nextLen = items.length - 1
    setItems(prev => prev.filter((_, i) => i !== idx))
    if (removed) {
      setQtyDrafts(prev => {
        const next = { ...prev }
        delete next[removed.component_product_id]
        return next
      })
    }
    setDirty(true)
    // Warn the moment removal drops the bundle below the 2-item minimum — the
    // user needs to know the list can't be saved until they add another item,
    // otherwise the Save button just silently greys out with no explanation.
    if (nextLen < 2) {
      toast({
        title: 'ชุดสินค้าต้องมีรายการอย่างน้อย 2 รายการ',
        description: 'เพิ่มสินค้าให้ครบก่อนบันทึก',
        variant: 'warning',
      })
    }
  }

  const updateQty = (componentId: number, v: string) => {
    // Integer-only field — strip every non-digit before storing the draft so
    // typing/pasting "5.5" or "-3" can't survive even as a transient string.
    const cleaned = v.replace(/\D/g, '')
    setQtyDrafts(prev => ({ ...prev, [componentId]: cleaned }))
    const num = parseInt(cleaned, 10)
    setItems(prev => prev.map(it => it.component_product_id === componentId
      ? { ...it, qty_per_bundle: isNaN(num) ? 0 : num }
      : it))
    setDirty(true)
  }

  const totalCost = items.reduce((s, it) => s + it.component_cost * it.qty_per_bundle, 0)
  const totalSell = items.reduce((s, it) => s + it.component_sell_price * it.qty_per_bundle, 0)

  const handleSave = async () => {
    // Pre-validate so server-side errors don't surface as toasts only — the
    // user sees field-level intent immediately.
    if (items.length < 2) {
      toast({ title: 'ชุดสินค้าต้องมีรายการอย่างน้อย 2 รายการ', variant: 'error' })
      return
    }
    for (const it of items) {
      if (!it.qty_per_bundle || it.qty_per_bundle <= 0) {
        toast({ title: `จำนวนต่อชุดของ "${it.component_name}" ต้องมากกว่า 0`, variant: 'error' })
        return
      }
    }
    if (!productId) return // sanity — controlled mode hides this button
    setSaving(true)
    try {
      await window.api.products.saveBundleItems(productId, items.map(it => ({
        component_product_id: it.component_product_id,
        qty_per_bundle: it.qty_per_bundle,
      })))
      toast({ title: 'บันทึกรายการสำเร็จ', variant: 'success' })
      await onRefresh?.()
      setDirty(false)
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pt-4 flex-1 min-h-0 flex flex-col">
      <div className="bg-card rounded-card shadow-card border border-border overflow-hidden flex-1 min-h-0 flex flex-col">
        {/* Card header bar — icon+title+count cluster on the left, a
            "+ เพิ่มรายการ" button opens the shared search dialog, Save on the
            right (uncontrolled mode only). */}
        <div className="px-4 h-12 shrink-0 flex items-center gap-3">
          <div className="flex items-center gap-3 shrink-0">
            <TintIcon icon={Boxes} tint="neutral" size="sm" />
            <h3 className="text-lg font-semibold text-foreground">รายการ</h3>
            <Badge variant="neutral-outline">{items.length}</Badge>
          </div>
          <div className="flex-1" />
          <Button variant="elevated" size="lg" onClick={openSearch} className="px-2 shrink-0 gap-1.5">
            <Plus className="size-4" /> เพิ่มรายการ
          </Button>
          {/* Controlled mode: parent's main "สร้างชุดสินค้า" button commits
              atomically — no per-tab save here (would be a no-op since there's
              no DB row yet). */}
          {!isControlled && (
            <Button
              size="lg"
              onClick={handleSave}
              disabled={saving || !dirty}
              className="h-9 w-9 p-0 shrink-0"
              title={items.length < 2 ? 'ต้องมีรายการอย่างน้อย 2 รายการ' : (saving ? 'กำลังบันทึก...' : 'บันทึกรายการ')}
            >
              <Save className="size-4" />
            </Button>
          )}
        </div>

        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-[16px] border-r-[16px] border-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-center w-14">#</TableHead>
              <TableHead className="min-w-[260px]">รายการ</TableHead>
              <TableHead className="text-center min-w-20">หน่วย</TableHead>
              <TableHead className="text-center min-w-20">จำนวน</TableHead>
              <TableHead className="text-right min-w-24">ราคาทุน</TableHead>
              <TableHead className="text-right min-w-24">รวม(ทุน)</TableHead>
              <TableHead className="text-right min-w-24">ราคาขาย</TableHead>
              <TableHead className="text-right min-w-24">รวม(ขาย)</TableHead>
              <TableHead className="text-center min-w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-16">
                  <Boxes className="size-10 mx-auto mb-2 opacity-30" />
                  ยังไม่มีรายการ — กดปุ่ม "เพิ่มรายการ" เพื่อเพิ่ม
                </TableCell>
              </TableRow>
            ) : items.map((it, i) => {
              const lineCost = it.component_cost * it.qty_per_bundle
              const lineSell = it.component_sell_price * it.qty_per_bundle
              return (
                <TableRow key={`${it.component_product_id}-${i}`} className="[&_td]:py-2.5 [&_td]:font-medium">
                  <TableCell className="text-center text-sm text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-semibold text-sm text-foreground">{it.component_name}</TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">{it.component_unit_name ?? '—'}</TableCell>
                  <TableCell className="text-center">
                    <Input
                      variant="elevated"
                      type="number" step="1" min="0" inputMode="numeric"
                      value={qtyDrafts[it.component_product_id] ?? String(it.qty_per_bundle)}
                      onChange={e => updateQty(it.component_product_id, e.target.value)}
                      onBlur={() => setQtyDrafts(prev => {
                        const next = { ...prev }
                        delete next[it.component_product_id]
                        return next
                      })}
                      className="h-9 w-16 mx-auto text-center"
                    />
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">{formatCurrency(it.component_cost)}</TableCell>
                  <TableCell className="text-right text-sm font-semibold text-foreground">{formatCurrency(lineCost)}</TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">{formatCurrency(it.component_sell_price)}</TableCell>
                  <TableCell className="text-right text-sm font-semibold text-foreground">{formatCurrency(lineSell)}</TableCell>
                  <TableCell>
                    <div className="flex justify-center">
                      <Button
                        size="icon-lg"
                        variant="elevated-destructive-soft"
                        onClick={() => setDeleteTarget({ idx: i, item: it })}
                        title="ลบรายการ"
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
          {items.length < 2
            ? <span className="text-destructive">ต้องมีรายการอย่างน้อย 2 รายการ ({items.length}/2)</span>
            : dirty
              ? <span className="text-accent-soft-foreground">มีการเปลี่ยนแปลงที่ยังไม่บันทึก</span>
              : <>{items.length.toLocaleString()} รายการ</>}
        </span>
        <div className="flex items-center gap-6">
          <span className="text-muted-foreground">
            ราคาทุนรวม <span className="font-semibold text-foreground">{formatCurrency(totalCost)}</span>
          </span>
          <span className="text-muted-foreground">
            ราคาขายรวม <span className="font-semibold text-foreground">{formatCurrency(totalSell)}</span>
          </span>
        </div>
      </div>
      </div>

      {/* ── PRODUCT SEARCH DIALOG (shared component) ── */}
      <ProductSearchDialog
        open={searchOpen}
        onClose={closeSearch}
        query={q}
        onQueryChange={handleSearch}
        searching={searching}
        rows={results}
        rowKey={(p) => String(p.id)}
        rowClassName="grid items-center px-4 py-2.5"
        rowStyle={{ gridTemplateColumns: '1fr 100px 120px 100px' }}
        onPick={(p) => addComponent(p)}
        placeholder="ค้นหารหัส, ชื่อสินค้า หรือสแกนบาร์โค้ด..."
        header={
          <div className="grid items-center px-4 py-2 bg-muted text-sm font-bold text-muted-foreground shrink-0 border-b border-border"
            style={{ gridTemplateColumns: '1fr 100px 120px 100px' }}>
            <div>ชื่อสินค้า</div>
            <div className="text-center">หน่วย</div>
            <div className="text-right">ราคาทุน</div>
            <div className="text-right">คงเหลือ</div>
          </div>
        }
        renderRow={(p) => {
          const stock = Number(p.stock_qty ?? 0)
          return (
            <>
              <div className="min-w-0 pr-2">
                <div className="font-semibold text-base flex items-center gap-1.5 truncate">
                  <span className="truncate">{p.trade_name}</span>
                  {stock === 0 && <Badge variant="destructive-outline" className="shrink-0">หมด</Badge>}
                </div>
              </div>
              <div className="text-center text-base text-muted-foreground truncate">{p.unit_name ?? '—'}</div>
              <div className="text-right font-bold text-foreground text-base">{formatCurrency(p.cost_price)}</div>
              <div className={`text-right text-base font-semibold ${stock > 0 ? 'text-foreground' : 'text-destructive'}`}>{stock.toLocaleString()}</div>
            </>
          )
        }}
      />

      {/* Confirm before removing a component from the bundle — prevents an
          accidental trash-button click from silently dropping a line. */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null) }}
        variant="destructive"
        title="ลบรายการออกจากชุด"
        description={deleteTarget && (
          <span>
            ต้องการลบ <span className="font-semibold text-foreground">"{deleteTarget.item.component_name}"</span> ออกจากชุดสินค้าใช่หรือไม่?
          </span>
        )}
        confirmLabel="ยืนยันลบ"
        cancelLabel="ยกเลิก"
        onConfirm={() => {
          if (deleteTarget) removeAt(deleteTarget.idx)
          setDeleteTarget(null)
        }}
      />
    </div>
  )
}
