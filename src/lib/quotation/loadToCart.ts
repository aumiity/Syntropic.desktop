import type { CartItem, Quotation } from '@/types'

export interface LoadToCartResult {
  items: CartItem[]
  blocked: string[]   // line descriptions that cannot be sold (with reason)
}

// Rebuild POS cart lines from a quotation. A sale needs a real product + the
// correct unit (so saveBill's FEFO deducts the right base quantity), so any
// line that can't be fully rebuilt is reported in `blocked` — the caller blocks
// the whole conversion (no partial/underbilled sale). Quoted price/discount are
// carried over verbatim (the agreed figures; still editable in POS).
export async function buildCartItemsFromQuote(quote: Quotation): Promise<LoadToCartResult> {
  const lines = quote.items ?? []
  const ids = [...new Set(lines.map(l => l.product_id).filter((n): n is number => typeof n === 'number'))]
  const products = ids.length ? (await window.api.pos.getProductsByIds(ids)) as any[] : []
  const byId = new Map<number, any>(products.map(p => [p.id, p]))

  const items: CartItem[] = []
  const blocked: string[] = []

  for (const l of lines) {
    if (l.product_id == null) {
      blocked.push(`${l.item_name} (ไม่มีสินค้าอ้างอิง)`) ; continue
    }
    const product = byId.get(l.product_id)
    if (!product) {
      blocked.push(`${l.item_name} (สินค้าถูกลบหรือปิดการขาย)`) ; continue
    }
    // Resolve the unit: base unit (matches product.unit_name) → no selectedUnit;
    // otherwise a sellable non-base variant matched by name.
    let selectedUnit: any = undefined
    if (l.unit_name && l.unit_name !== product.unit_name) {
      selectedUnit = (product.units ?? []).find((u: any) => u.unit_name === l.unit_name)
      if (!selectedUnit) { blocked.push(`${l.item_name} (หน่วย "${l.unit_name}" ไม่พร้อมขาย)`) ; continue }
    }
    items.push({
      product_id: l.product_id,
      item_name: l.item_name,
      unit_name: l.unit_name,
      qty: l.qty,
      unit_price: l.unit_price,
      discount: l.discount || 0,
      line_total: l.line_total,
      product,
      selectedUnit,
    })
  }

  return { items, blocked }
}
