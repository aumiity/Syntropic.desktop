import { useEffect, useRef, useState } from 'react'
import { ProductSearchDialog } from './ProductSearchDialog'
import { useToast } from '@/components/ui/toast'
import { formatCurrency } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import type { TagCell } from '@/lib/tags/types'

// A flat search row: the base unit (unit=null → prices/name from product.*) or
// one non-base sellable unit. Mirrors the POS flattening so the base row always
// comes first (docs/claude/pos.md HARD invariant).
interface TagRow {
  product_id: number
  name: string
  unit_name: string
  price: number
  code: string
  barcode: string
  barcode_source: TagCell['barcode_source']
}

// Thin consumer of the shared ProductSearchDialog (the search-modal canonical,
// see docs/claude/pos.md): owns query/results + debounced pos:searchProducts,
// flattens products→units (base first), forwards matched_unit_id as initialIdx,
// and resolves each picked row's barcode with a fallback chain.
export function TagProductSearchDialog({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (cell: TagCell) => void
}) {
  const { toast } = useToast()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (open) { setQuery(''); setResults([]) }
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

  // Base row first (unit=null → product.barcode/price/unit), then non-base
  // sellable units. The barcode fallback chain: unit.barcode → product.barcode
  // → product.code, tagging the source so the grid can warn on fallbacks.
  const rows: TagRow[] = results.flatMap((p) => {
    const baseBarcode = p.barcode || p.code || ''
    const base: TagRow = {
      product_id: p.id,
      name: p.trade_name,
      unit_name: p.unit_name ?? '',
      price: p.price_retail ?? 0,
      code: p.code ?? '',
      barcode: baseBarcode,
      barcode_source: p.barcode ? 'own' : 'code',
    }
    const units: TagRow[] = (p.units ?? []).map((u: any) => {
      const resolved = u.barcode || p.barcode || p.code || ''
      const source: TagCell['barcode_source'] = u.barcode ? 'own' : p.barcode ? 'base' : 'code'
      return {
        product_id: p.id,
        name: p.trade_name,
        unit_name: u.unit_name,
        price: u.price_retail ?? 0,
        code: p.code ?? '',
        barcode: resolved,
        barcode_source: source,
      }
    })
    return [base, ...units]
  })

  // When a scanned barcode matches a non-base unit, pre-highlight that unit's
  // row (without reordering — base stays first).
  const matchedIdx = (() => {
    const p = results[0]
    const muid = p?.matched_unit_id
    if (!muid) return undefined
    const i = rows.findIndex((r) => {
      const orig = results.find((rp) => rp.id === r.product_id)
      const u = (orig?.units ?? []).find((x: any) => x.unit_name === r.unit_name)
      return u?.id === muid
    })
    return i >= 0 ? i : undefined
  })()

  const handlePick = (row: TagRow) => {
    if (!row.barcode) {
      toast('สินค้านี้ไม่มีทั้งบาร์โค้ดและรหัสสินค้า', 'error')
      return
    }
    onPick({
      product_id: row.product_id,
      name: row.name,
      unit_name: row.unit_name,
      price: row.price,
      code: row.code,
      barcode: row.barcode,
      barcode_source: row.barcode_source,
    })
    onClose()
  }

  const COLS = '1fr 90px 120px 120px'

  return (
    <ProductSearchDialog<TagRow>
      open={open}
      onClose={onClose}
      query={query}
      onQueryChange={setQuery}
      searching={searching}
      rows={rows}
      resultCount={rows.length}
      initialIdx={matchedIdx}
      title="ค้นหาสินค้าเพื่อพิมพ์ป้าย"
      placeholder="ค้นหาชื่อ, รหัส หรือสแกนบาร์โค้ด..."
      rowKey={(r, i) => `${r.product_id}-${r.unit_name}-${i}`}
      rowClassName="grid items-center px-4 py-2.5"
      rowStyle={{ gridTemplateColumns: COLS }}
      onPick={handlePick}
      header={
        <div
          className="grid items-center px-4 py-2 bg-muted text-sm font-bold text-muted-foreground shrink-0 border-b border-border"
          style={{ gridTemplateColumns: COLS }}
        >
          <div>ชื่อสินค้า</div>
          <div className="text-center">หน่วย</div>
          <div className="text-right">บาร์โค้ด/รหัส</div>
          <div className="text-right">ราคาขาย</div>
        </div>
      }
      renderRow={(r) => (
        <>
          <div className="min-w-0 pr-2">
            <div className="font-semibold text-base flex items-center gap-1.5">
              <span className="overflow-x-clip overflow-y-visible">{r.name}</span>
              {!r.barcode && <Badge variant="destructive-outline" className="shrink-0">ไม่มีบาร์โค้ด</Badge>}
            </div>
          </div>
          <div className="text-center text-base text-muted-foreground">{r.unit_name || '-'}</div>
          <div className="text-right text-base text-muted-foreground">{r.barcode || '-'}</div>
          <div className="text-right font-bold text-primary text-base">{formatCurrency(r.price)}</div>
        </>
      )}
    />
  )
}
