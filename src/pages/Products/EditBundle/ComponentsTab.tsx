import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { Search, Trash2, Boxes, Save, X } from 'lucide-react'
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

// Search/picker mirrors POS exactly:
//  - main search input lives permanently in the card header (always focused);
//  - typing opens a 1000×800 modal whose input shares the same query state;
//  - Enter on a highlighted row adds the item and CLOSES the modal — the main
//    input refocuses so the next search is one keystroke away;
//  - mouse clicks on non-interactive areas snap focus back to the active
//    input (main when closed, modal when open) so scanning never misses keys.
//
// Backend rejects nested bundles + qty<=0 + disabled components; the filter
// here (is_bundle=0, include_disabled=false) just hides them from the picker.
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

  // Per-row edit strings for the qty input — keyed by component_product_id.
  // Decouples the displayed string from the parsed number so the user can clear
  // the field or type transient forms ("0", "0.5", "01") without parseFloat
  // snapping the display back. React's controlled-input diffing won't sync the
  // DOM when value prop is unchanged — so "01" parsing to 1 (same as prior
  // state) would otherwise leave the typed "01" stuck in the input forever.
  const [qtyDrafts, setQtyDrafts] = useState<Record<number, string>>({})

  // Component picker — shared query between main input and modal input.
  const [searchOpen, setSearchOpen] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchRow[]>([])
  const [searching, setSearching] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(0)
  const mainInputRef = useRef<HTMLInputElement>(null)
  const modalInputRef = useRef<HTMLInputElement>(null)
  const activeRowRef = useRef<HTMLDivElement>(null)

  // Ref mirror so the persistent-focus listener (registered once) always sees
  // the latest value without re-binding on every render — same pattern as POS.
  const searchOpenRef = useRef(searchOpen)
  searchOpenRef.current = searchOpen

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

  // Focus modal input when search opens.
  useEffect(() => {
    if (searchOpen) setTimeout(() => modalInputRef.current?.focus(), 50)
  }, [searchOpen])

  // Refocus main input after the modal closes.
  const prevSearchOpen = useRef(false)
  useEffect(() => {
    if (prevSearchOpen.current && !searchOpen) {
      setTimeout(() => mainInputRef.current?.focus(), 150)
    }
    prevSearchOpen.current = searchOpen
  }, [searchOpen])

  // Keep highlighted row visible during arrow-key nav.
  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [highlightIdx])

  // Reset highlight ONLY when the query text changes (mirrors POS — never on
  // scroll/hover, which would fight scrollIntoView).
  useEffect(() => { setHighlightIdx(0) }, [q])

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

  // Keep the search input permanently focused (mirrors POS). Registered once;
  // reads modal state via ref to avoid stale closures.
  useEffect(() => {
    // Note: excludes [tabindex] because Chromium auto-adds tabindex=0 to
    // overflow:auto containers — treating them as focusable would let the
    // table-scroll wrapper "steal" focus from the search input.
    const INTERACTIVE = 'input, button, select, textarea, a, [role="button"], [contenteditable="true"]'

    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (!t || t.closest(INTERACTIVE)) return
      e.preventDefault()
      const inp = searchOpenRef.current ? modalInputRef.current : mainInputRef.current
      inp?.focus()
    }

    // Safety net via focusout (bubbles, so one listener catches both inputs).
    const onFocusOut = (e: FocusEvent) => {
      const lost = e.target as HTMLElement | null
      const isOurInput = lost === mainInputRef.current || lost === modalInputRef.current
      if (!isOurInput) return
      setTimeout(() => {
        const active = document.activeElement as HTMLElement | null
        if (active && active.matches(INTERACTIVE)) return
        const inp = searchOpenRef.current ? modalInputRef.current : mainInputRef.current
        inp?.focus()
      }, 0)
    }

    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [])

  // Typing in either input drives the same flow: empty → close modal & clear
  // results; non-empty → open modal if not already open. handleSearch is the
  // single entry point for both main and modal inputs (mirrors POS).
  const handleSearch = (val: string) => {
    setQ(val)
    if (!val.trim()) {
      setSearchOpen(false)
      setResults([])
      return
    }
    if (!searchOpenRef.current) setSearchOpen(true)
  }

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

  const handleModalKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i => Math.min(i + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      const sel = results[highlightIdx]
      if (sel) addComponent(sel)
    }
  }

  const removeAt = (idx: number) => {
    const removed = items[idx]
    setItems(prev => prev.filter((_, i) => i !== idx))
    if (removed) {
      setQtyDrafts(prev => {
        const next = { ...prev }
        delete next[removed.component_product_id]
        return next
      })
    }
    setDirty(true)
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
    <div className="flex flex-col flex-1 min-h-0 bg-card rounded-card shadow-card overflow-hidden">
      {/* Card header bar — search input takes the row (POS-style: icon on the
          right, border-0, shadow-none), Save button on the right. */}
      <div className="flex items-center gap-2 px-1.5 h-14 shrink-0">
        <div className="relative flex-1 min-w-0">
          <Input
            ref={mainInputRef}
            value={q}
            onChange={e => handleSearch(e.target.value)}
            placeholder="ค้นหาสินค้าเพื่อเพิ่ม / สแกนบาร์โค้ด / รหัสสินค้า"
            autoFocus
            autoComplete="off"
            className="h-9 py-2 pl-3 pr-9 text-sm rounded-lg border-0 shadow-none"
          />
          <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground pointer-events-none" />
        </div>
        {/* Controlled mode: parent's main "สร้างชุดสินค้า" button commits
            atomically — no per-tab save here (would be a no-op since there's
            no DB row yet). */}
        {!isControlled && (
          <Button
            size="lg"
            onClick={handleSave}
            disabled={saving || !dirty || items.length < 2}
            className="h-9 px-3 shrink-0"
            title={items.length < 2 ? 'ต้องมีรายการอย่างน้อย 2 รายการ' : undefined}
          >
            <Save className="size-4" /> {saving ? 'กำลังบันทึก...' : 'บันทึกรายการ'}
          </Button>
        )}
      </div>

      <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-8 border-r-8 border-card">
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
                  ยังไม่มีรายการ — พิมพ์ในช่องค้นหาเพื่อเพิ่ม
                </TableCell>
              </TableRow>
            ) : items.map((it, i) => {
              const lineCost = it.component_cost * it.qty_per_bundle
              const lineSell = it.component_sell_price * it.qty_per_bundle
              return (
                <TableRow key={`${it.component_product_id}-${i}`}>
                  <TableCell className="text-center text-sm text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-semibold text-sm text-foreground">{it.component_name}</TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">{it.component_unit_name ?? '—'}</TableCell>
                  <TableCell className="text-center">
                    <Input
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
                        variant="destructive"
                        onClick={() => removeAt(i)}
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
          {items.length > 0 && items.length < 2
            ? <span className="text-destructive">ต้องมีรายการอย่างน้อย 2 รายการ ({items.length}/2)</span>
            : dirty
              ? <span className="text-warning-strong">มีการเปลี่ยนแปลงที่ยังไม่บันทึก</span>
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

      {/* ── POS-STYLE SEARCH DIALOG (1000×800) ── */}
      <Dialog open={searchOpen} onOpenChange={(v) => { if (!v) closeSearch() }}>
        <DialogContent
          showCloseButton={false}
          onClose={closeSearch}
          className="flex flex-col overflow-hidden p-0 gap-0 sm:max-w-none border-0 border-transparent"
          style={{ width: '1000px', maxWidth: 'calc(100vw - 2rem)', height: '800px', maxHeight: 'calc(100vh - 4rem)' }}
        >
          <DialogTitle className="sr-only">ค้นหาสินค้า</DialogTitle>

          {/* Search input */}
          <div className="flex items-center gap-2 px-4 py-3 shrink-0">
            <Search className="h-5 w-5 text-primary shrink-0" />
            <Input
              ref={modalInputRef}
              value={q}
              autoFocus
              onChange={e => handleSearch(e.target.value)}
              onKeyDown={handleModalKeyDown}
              placeholder="ค้นหารหัส, ชื่อสินค้า หรือสแกนบาร์โค้ด..."
              className="flex-1 text-lg outline-none bg-transparent border-0 shadow-none focus-visible:ring-0 focus-visible:border-0 h-auto px-0"
              autoComplete="off"
            />
            {q && (
              <Button variant="outline" size="icon-xs" onClick={() => { setQ(''); setResults([]); modalInputRef.current?.focus() }}
                className="rounded-full text-foreground-subtle"><X className="size-3" strokeWidth={3} /></Button>
            )}
            <Button variant="outline" size="sm" onClick={closeSearch} className="h-7">Esc</Button>
          </div>

          {/* Column header */}
          <div className="grid items-center px-4 py-2 bg-muted text-sm font-bold text-muted-foreground shrink-0"
            style={{ gridTemplateColumns: '1fr 100px 120px 100px' }}>
            <div>ชื่อสินค้า</div>
            <div className="text-center">หน่วย</div>
            <div className="text-right">ราคาทุน</div>
            <div className="text-right">คงเหลือ</div>
          </div>

          {/* Results — flex-1, scrolls internally, empty space stays empty */}
          <div className="flex-1 overflow-y-auto scrollbar-thin" tabIndex={-1}>
            {searching && results.length === 0 ? (
              <div className="py-12 text-center text-foreground-subtle text-base">กำลังค้นหา...</div>
            ) : q && results.length === 0 ? (
              <div className="py-12 text-center text-foreground-subtle text-base">ไม่พบสินค้า "{q}" (หรือถูกเพิ่มไปแล้ว)</div>
            ) : !q ? (
              <div className="py-12 text-center text-foreground-subtle">
                <Search className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p className="text-base">พิมพ์เพื่อค้นหาสินค้า</p>
              </div>
            ) : (
              results.map((p, i) => {
                const active = i === highlightIdx
                const stock = Number(p.stock_qty ?? 0)
                return (
                  <div
                    key={p.id}
                    ref={active ? activeRowRef : undefined}
                    onClick={() => addComponent(p)}
                    className={`grid items-center px-4 py-2.5 cursor-pointer transition-colors ${active ? 'bg-primary-soft' : 'hover:bg-primary-soft'}`}
                    style={{ gridTemplateColumns: '1fr 100px 120px 100px' }}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-semibold text-base flex items-center gap-1.5 truncate">
                        <span className="truncate">{p.trade_name}</span>
                        {stock === 0 && <span className="text-xs bg-destructive/20 text-destructive px-1.5 py-0.5 rounded font-medium shrink-0">หมด</span>}
                      </div>
                      {p.code && <div className="text-xs text-muted-foreground font-mono truncate">{p.code}</div>}
                    </div>
                    <div className="text-center text-base text-muted-foreground truncate">{p.unit_name ?? '—'}</div>
                    <div className="text-right font-bold text-foreground text-base">{formatCurrency(p.cost_price)}</div>
                    <div className={`text-right text-base font-semibold ${stock > 0 ? 'text-foreground' : 'text-destructive'}`}>{stock.toLocaleString()}</div>
                  </div>
                )
              })
            )}
          </div>

          {/* Footer status */}
          <div className="px-4 py-2 bg-muted text-sm text-muted-foreground shrink-0">
            ค้นหา: "{q}" — พบ {results.length} รายการ
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
