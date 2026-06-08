import type { SaleForPrint } from '@/types'

// A fetched historical sale (reports:getSaleByInvoice shape) → SaleForPrint.
// Cancelled line items are filtered out so a reprint never shows lines that
// were later removed (the stored sale totals are kept as-is — the document
// reprints the bill as recorded, just without struck rows).
export function saleDetailToPrint(detail: any): SaleForPrint {
  const items = (detail.items ?? [])
    .filter((it: any) => !it.is_cancelled)
    .map((it: any) => ({
      item_name: it.item_name,
      unit_name: it.unit_name ?? '',
      qty: Number(it.qty) || 0,
      unit_price: Number(it.unit_price) || 0,
      discount: Number(it.discount) || 0,
      unit_vat: Number(it.unit_vat) || 0,
      line_total: Number(it.line_total) || 0,
    }))
  return {
    invoice_no: detail.invoice_no,
    sold_at: detail.sold_at,
    sale_type: detail.sale_type,
    status: detail.status,
    customer_name: detail.customer_name ?? detail.customer_name_free ?? null,
    salesperson_name: detail.sold_by_name ?? null,
    items,
    subtotal: Number(detail.subtotal) || 0,
    total_discount: Number(detail.total_discount) || 0,
    total_vat: Number(detail.total_vat) || 0,
    total_amount: Number(detail.total_amount) || 0,
    cash_amount: Number(detail.cash_amount) || 0,
    change_amount: Number(detail.change_amount) || 0,
  }
}
