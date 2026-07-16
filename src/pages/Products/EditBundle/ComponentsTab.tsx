import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { QtyDialog } from '@/components/ui/qty-dialog'
import { ProductSearchDialog } from '@/components/dialogs/ProductSearchDialog'
import { useToast } from '@/components/ui/toast'
import { TintIcon } from '@/components/ui/tint-icon'
import { Plus, Trash2, Boxes } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface Props {
  // null in new-mode — no IPC save here; parent commits atomically.
  productId: number | null
  // Items always live in parent state (controlled in both modes). The parent's
  // single Save button (createBundle in new mode, update+saveBundleItems in
  // edit mode) persists them. This tab only mutates the draft array.
  controlledItems: DraftItem[]
  onControlledItemsChange: (items: DraftItem[]) => void
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
export function ComponentsTab({ productId, controlledItems, onControlledItemsChange }: Props) {
  const { toast } = useToast()
  const items = controlledItems
  const setItems = (updater: DraftItem[] | ((prev: DraftItem[]) => DraftItem[])) => {
    const next = typeof updater === 'function' ? (updater as (p: DraftItem[]) => DraftItem[])(controlledItems) : updater
    onControlledItemsChange(next)
  }

  // Confirm-before-remove — guards against a misclick on the trash button
  // wiping a component. Holds the row index + a snapshot for the dialog copy;
  // the index stays valid because the modal blocks all other interaction.
  const [deleteTarget, setDeleteTarget] = useState<{ idx: number; item: DraftItem } | null>(null)

  // Qty editing happens in the shared QtyDialog (same modal as the POS cart) —
  // this holds the row index whose dialog is open (null = closed).
  const [qtyModalIdx, setQtyModalIdx] = useState<number | null>(null)

  // Component picker — a "+ เพิ่มรายการ" button opens the shared search dialog,
  // which owns its own input focus + keyboard nav.
  const [searchOpen, setSearchOpen] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchRow[]>([])
  const [searching, setSearching] = useState(false)

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
    // Close after add (POS pattern) — main input auto-refocuses via the
    // searchOpen→false effect above, so the next search is one keystroke away.
    closeSearch()
  }

  const removeAt = (idx: number) => {
    const nextLen = items.length - 1
    setItems(prev => prev.filter((_, i) => i !== idx))
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

  // Apply the qty picked in the QtyDialog. Qty-per-bundle is integer-only, so
  // round the dialog's value (it allows decimals) and clamp to >= 1.
  const applyQty = (idx: number, qty: number) => {
    const next = Math.max(1, Math.round(qty))
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, qty_per_bundle: next } : it))
  }

  const totalCost = items.reduce((s, it) => s + it.component_cost * it.qty_per_bundle, 0)
  const totalSell = items.reduce((s, it) => s + it.component_sell_price * it.qty_per_bundle, 0)

  return (
    <div className="pt-4">
      <div className="bg-card rounded-card shadow-card border border-border overflow-hidden flex flex-col">
        {/* Card header bar — icon+title+count cluster on the left, a
            "+ เพิ่มรายการ" button opens the shared search dialog. The single
            Save lives in the parent TabStrip (commits product + items together). */}
        <div className="px-4 h-12 shrink-0 flex items-center gap-3">
          <div className="flex items-center gap-3 shrink-0">
            <TintIcon icon={Boxes} tint="elevated" size="sm" />
            <h3 className="text-lg font-semibold text-foreground">รายการ</h3>
            <Badge variant="neutral">{items.length}</Badge>
          </div>
          <div className="flex-1" />
          <Button variant="elevated" size="lg" onClick={openSearch} className="px-2 shrink-0 gap-1.5">
            <Plus className="size-4" /> เพิ่มรายการ
          </Button>
        </div>

        <div className="[&>[data-slot=table-container]]:max-h-[420px] [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-[16px] border-r-[16px] border-card">
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
                  ยังไม่มีรายการ — กดปุ่ม "เพิ่มรายการ" เพื่อเพิ่ม (ต้องมีอย่างน้อย 2 รายการ)
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
                    <Button
                      variant="primary-soft"
                      size="sm"
                      onClick={() => setQtyModalIdx(i)}
                      className="h-9 w-16 mx-auto flex items-center justify-center rounded-md text-sm font-semibold"
                    >
                      {it.qty_per_bundle}
                    </Button>
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
                        tooltip="ลบรายการ"
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

      {/* Qty stepper — shared QtyDialog (same modal as the POS cart). */}
      {qtyModalIdx !== null && items[qtyModalIdx] && (
        <QtyDialog
          open
          onClose={() => setQtyModalIdx(null)}
          itemName={items[qtyModalIdx].component_name}
          unitName={items[qtyModalIdx].component_unit_name}
          initialQty={items[qtyModalIdx].qty_per_bundle}
          presets={[]}
          onApply={(qty) => applyQty(qtyModalIdx, qty)}
        />
      )}

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
