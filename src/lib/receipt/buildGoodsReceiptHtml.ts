import { buildPrintFontFaceCss, esc } from '@/lib/print/fonts'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Setting } from '@/types'

// Minimal shape the goods-receipt print needs — a subset of the ReceiptItem
// rows the PurchaseReceiptDialog already loads from purchase:getReceipt.
export interface GoodsReceiptLine {
  trade_name: string
  product_code?: string
  lot_number?: string
  expiry_date?: string
  unit_name?: string
  qty_received: number
  cost_price: number
}

export interface GoodsReceiptForPrint {
  invoice_no: string
  supplier_name?: string
  supplier_invoice_no?: string
  order_date?: string
  received_date?: string
  payment_type?: string
  due_date?: string
  discount_amount?: number
  surcharge_amount?: number
  lines: GoodsReceiptLine[]
}

// Full A4 goods-receipt (ใบรับสินค้า). Structure mirrors buildQuotationHtml so
// the two A4 documents stay visually consistent. Cost prices are shown because
// this is an internal receiving document, not a customer-facing one.
export async function buildGoodsReceiptHtml(
  gr: GoodsReceiptForPrint,
  shop: Partial<Setting>,
  opts: { fontFamily?: string } = {},
): Promise<string> {
  const fontFamily = opts.fontFamily || 'Bai Jamjuree'
  const fontFaceCss = await buildPrintFontFaceCss(fontFamily)
  const money = (n: number) => formatCurrency(n)

  const rawTotal = gr.lines.reduce((s, l) => s + l.cost_price * l.qty_received, 0)
  const discountAmt = gr.discount_amount ?? 0
  const surchargeAmt = gr.surcharge_amount ?? 0
  const hasAdjust = discountAmt > 0 || surchargeAmt > 0
  const finalTotal = rawTotal - discountAmt + surchargeAmt

  const rows = gr.lines.map((l, i) => {
    const meta = [
      l.lot_number ? `Lot. ${esc(l.lot_number)}` : '',
      l.expiry_date ? `exp. ${esc(formatDate(l.expiry_date))}` : '',
    ].filter(Boolean).join('　')
    return `<tr>
      <td class="c">${i + 1}</td>
      <td>${esc(l.trade_name)}${meta ? `<div class="sub">${meta}</div>` : ''}</td>
      <td class="r">${money(l.qty_received)}</td>
      <td class="c">${esc(l.unit_name ?? '')}</td>
      <td class="r">${money(l.cost_price)}</td>
      <td class="r">${money(l.cost_price * l.qty_received)}</td>
    </tr>`
  }).join('')

  const sellerBranch = shop.shop_branch ? ` (${esc(shop.shop_branch)})` : ''
  const isCredit = gr.payment_type === 'credit'
  const paymentLabel = isCredit ? 'เครดิต' : 'เงินสด'
  const dueLine = isCredit && gr.due_date
    ? `<div class="meta"><span>ครบกำหนด</span><span>${esc(formatDate(gr.due_date, 'D MMMM BBBB'))}</span></div>` : ''
  const supplierInvLine = gr.supplier_invoice_no
    ? `<div>เลขที่ใบกำกับผู้ขาย: ${esc(gr.supplier_invoice_no)}</div>` : ''

  const totalsRows = `
    ${hasAdjust ? `<div class="row"><span>ราคารวม</span><span>${money(rawTotal)}</span></div>` : ''}
    ${discountAmt > 0 ? `<div class="row"><span>ส่วนลด</span><span>−${money(discountAmt)}</span></div>` : ''}
    ${surchargeAmt > 0 ? `<div class="row"><span>ส่วนเพิ่ม</span><span>+${money(surchargeAmt)}</span></div>` : ''}
    <div class="row grand"><span>ยอดสุทธิ</span><span>${money(finalTotal)}</span></div>
  `

  return `<!doctype html><html><head><meta charset="utf-8">
<style>
${fontFaceCss}
@page { size: A4; margin: 0; }
html, body { margin: 0; }
body { padding: 12mm; font-family: '${fontFamily}', sans-serif; font-size: 11pt; color: #000; background: #fff; }
.head { display: flex; justify-content: space-between; align-items: flex-start; }
.title { text-align: right; }
.title .t { font-size: 16pt; font-weight: 700; }
.shop .name { font-size: 14pt; font-weight: 700; }
.muted { font-size: 10pt; }
.parties { display: flex; gap: 6mm; margin: 6mm 0 3mm; }
.box { flex: 1; border: 1px solid #000; border-radius: 4px; padding: 3mm; font-size: 10pt; }
.box .h { font-weight: 700; margin-bottom: 1mm; }
.meta { display: flex; justify-content: space-between; font-size: 10pt; margin-bottom: 2mm; }
table { width: 100%; border-collapse: collapse; font-size: 10pt; }
th, td { border: 1px solid #000; padding: 2mm 3mm; vertical-align: top; }
th { background: #eee; font-weight: 700; }
.c { text-align: center; }
.r { text-align: right; white-space: nowrap; }
.sub { font-size: 9pt; color: #444; margin-top: 0.5mm; }
.totals { width: 60mm; margin-left: auto; margin-top: 3mm; font-size: 11pt; }
.totals .row { display: flex; justify-content: space-between; padding: 1mm 0; }
.totals .grand { font-weight: 700; font-size: 12pt; border-top: 1px solid #000; }
.sign { display: flex; justify-content: space-between; margin-top: 16mm; font-size: 10pt; text-align: center; }
.sign div { width: 60mm; border-top: 1px dotted #000; padding-top: 2mm; }
</style></head><body>
  <div class="head">
    <div class="shop">
      <div class="name">${esc(shop.shop_name ?? '')}</div>
      <div class="muted">${esc(shop.shop_address ?? '')}</div>
      ${shop.shop_phone ? `<div class="muted">โทร. ${esc(shop.shop_phone)}</div>` : ''}
      ${shop.shop_tax_id ? `<div class="muted">เลขประจำตัวผู้เสียภาษี: ${esc(shop.shop_tax_id)}${sellerBranch}</div>` : ''}
    </div>
    <div class="title">
      <div class="t">ใบรับสินค้า</div>
      <div class="muted">Goods Receipt</div>
    </div>
  </div>

  <div class="parties">
    <div class="box">
      <div class="h">ผู้จัดจำหน่าย</div>
      <div>${esc(gr.supplier_name || '-')}</div>
      ${supplierInvLine}
    </div>
    <div class="box">
      <div class="meta"><span>เลขที่รับ</span><span>${esc(gr.invoice_no)}</span></div>
      ${gr.order_date ? `<div class="meta"><span>วันที่สั่งซื้อ</span><span>${esc(formatDate(gr.order_date, 'D MMMM BBBB'))}</span></div>` : ''}
      ${gr.received_date ? `<div class="meta"><span>วันที่รับสินค้า</span><span>${esc(formatDate(gr.received_date, 'D MMMM BBBB'))}</span></div>` : ''}
      <div class="meta"><span>การชำระเงิน</span><span>${paymentLabel}</span></div>
      ${dueLine}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="c" style="width:10mm">ลำดับ</th>
        <th>รายการ</th>
        <th class="r" style="width:18mm">จำนวน</th>
        <th class="c" style="width:20mm">หน่วย</th>
        <th class="r" style="width:26mm">ราคา/หน่วย</th>
        <th class="r" style="width:28mm">รวม</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals">${totalsRows}</div>

  <div class="sign">
    <div>ผู้รับสินค้า</div>
    <div>ผู้ส่งสินค้า</div>
  </div>
</body></html>`
}
