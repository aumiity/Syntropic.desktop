import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from '@/components/ui/dialog'
import { SearchInput } from '@/components/ui/input'
import { formatCurrency } from '@/lib/utils'
import { Package } from 'lucide-react'

// A picked line: base unit → unit=null (price/name from product.*), otherwise
// the chosen ProductUnit variant.
export interface PickedProduct {
  product_id: number
  item_name: string
  unit_name: string
  unit_price: number
}

// Lightweight product-search modal for the quotation builder. Reuses
// pos:searchProducts (same data the POS search uses) but only needs name +
// retail price per sellable unit — no FEFO/lots/stock.
export function QuotationProductSearchDialog({
  open, onOpenChange, onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (line: PickedProduct) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) { setQuery(''); setResults([]); setTimeout(() => inputRef.current?.focus(), 50) }
  }, [open])

  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (!q) { setResults([]); return }
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const data = await window.api.pos.searchProducts(q)
        setResults(data as any[])
      } finally { setSearching(false) }
    }, 250)
    return () => clearTimeout(t)
  }, [query, open])

  const pick = (line: PickedProduct) => {
    onPick(line)
    onOpenChange(false)
  }

  // One product → a base-unit row + a row per non-base sellable unit.
  const rows = results.flatMap(p => {
    const base: PickedProduct = {
      product_id: p.id, item_name: p.trade_name, unit_name: p.unit_name ?? '', unit_price: p.price_retail ?? 0,
    }
    const units: PickedProduct[] = (p.units ?? []).map((u: any) => ({
      product_id: p.id, item_name: p.trade_name, unit_name: u.unit_name, unit_price: u.price_retail ?? 0,
    }))
    return [base, ...units]
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" divided onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>เพิ่มสินค้า</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <SearchInput
            ref={inputRef}
            variant="elevated"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="ค้นหาชื่อสินค้า / บาร์โค้ด / รหัส..."
            className="h-10"
          />
          <div className="h-[24rem] overflow-y-auto scrollbar-thin rounded-lg border border-border divide-y divide-border">
            {searching && rows.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">กำลังค้นหา...</div>
            ) : query.trim() && rows.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">
                <Package className="size-8 mx-auto mb-2 opacity-30" />
                ไม่พบสินค้า
              </div>
            ) : rows.map((r, i) => (
              <button
                key={`${r.product_id}-${r.unit_name}-${i}`}
                type="button"
                onClick={() => pick(r)}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-muted transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{r.item_name}</div>
                  <div className="text-xs text-muted-foreground">หน่วย: {r.unit_name || '—'}</div>
                </div>
                <div className="text-sm font-semibold text-foreground shrink-0">{formatCurrency(r.unit_price)}</div>
              </button>
            ))}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
