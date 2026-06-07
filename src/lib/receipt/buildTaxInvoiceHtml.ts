import { buildPrintFontFaceCss, esc } from '@/lib/print/fonts'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { SaleForPrint, Setting, TaxInvoice } from '@/types'

// Full tax invoice (ใบกำกับภาษีเต็มรูป, ม.86/4) on A4. Required elements:
// title, seller name/address/tax-id + branch, buyer name/address/tax-id +
// branch, running serial (doc_no = invoice_no), item lines, VAT broken out from
// the goods value, issue date, and an "ต้นฉบับ"/"สำเนา" marker.
//
// Stored prices are VAT-inclusive, so each line's pre-tax value is
// line_total − unit_vat×qty; the document subtotal equals total_amount − total_vat.
export async function buildTaxInvoiceHtml(
  sale: SaleForPrint,
  shop: Partial<Setting>,
  tax: TaxInvoice,
  opts: { copy: boolean; fontFamily?: string; paperSize?: 'A4' | 'A5' } = { copy: false },
): Promise<string> {
  const fontFamily = opts.fontFamily || 'Sarabun'
  const paperSize = opts.paperSize || 'A4'
  // A5 = A4 scaled by 1/√2 in EACH linear dimension (it's half the AREA, not
  // half the side), so the whole A4-tuned layout — fonts, margins, mm widths —
  // is zoomed by the page ratio (148/210 ≈ 0.705) to fit A5 like a shrunk A4.
  const zoom = paperSize === 'A5' ? 148 / 210 : 1
  const fontFaceCss = await buildPrintFontFaceCss(fontFamily)
  const money = (n: number) => formatCurrency(n)

  const exVatTotal = sale.total_amount - sale.total_vat
  const vatPct = exVatTotal > 0 ? Math.round((sale.total_vat / exVatTotal) * 100) : 7
  const docKind = opts.copy ? 'สำเนา' : 'ต้นฉบับ'

  const rows = sale.items.map((it, i) => {
    const lineExVat = it.line_total - it.unit_vat * it.qty
    const unitExVat = it.qty > 0 ? lineExVat / it.qty : 0
    return `<tr>
      <td class="c">${i + 1}</td>
      <td>${esc(it.item_name)}</td>
      <td class="c">${money(it.qty)} ${esc(it.unit_name)}</td>
      <td class="r">${money(unitExVat)}</td>
      <td class="r">${money(lineExVat)}</td>
    </tr>`
  }).join('')

  const sellerBranch = shop.shop_branch ? ` (${esc(shop.shop_branch)})` : ''
  const buyerTaxLine = tax.buyer_tax_id
    ? `<div>เลขประจำตัวผู้เสียภาษี: ${esc(tax.buyer_tax_id)}${tax.buyer_branch ? ` (${esc(tax.buyer_branch)})` : ''}</div>`
    : ''

  return `<!doctype html><html><head><meta charset="utf-8">
<style>
${fontFaceCss}
/* Margin lives on the body as padding (not @page) so the silent-print path,
   which forces margins:none, still gets the page margin. */
@page { size: ${paperSize}; margin: 0; }
html, body { margin: 0; }
html { zoom: ${zoom}; }
body { padding: 12mm; font-family: '${fontFamily}', sans-serif; font-size: 11pt; color: #000; background: #fff; }
.head { display: flex; justify-content: space-between; align-items: flex-start; }
.title { text-align: right; }
.title .t { font-size: 16pt; font-weight: 700; }
.title .k { font-size: 11pt; }
.shop .name { font-size: 14pt; font-weight: 700; }
.muted { color: #000; font-size: 10pt; }
.parties { display: flex; gap: 6mm; margin: 6mm 0 3mm; }
.box { flex: 1; border: 1px solid #000; border-radius: 4px; padding: 3mm; font-size: 10pt; }
.box .h { font-weight: 700; margin-bottom: 1mm; }
.meta { display: flex; justify-content: space-between; font-size: 10pt; margin-bottom: 2mm; }
table { width: 100%; border-collapse: collapse; font-size: 10pt; }
th, td { border: 1px solid #000; padding: 2mm 3mm; vertical-align: top; }
th { background: #eee; font-weight: 700; }
.c { text-align: center; }
.r { text-align: right; white-space: nowrap; }
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
      <div class="t">ใบกำกับภาษี / ใบเสร็จรับเงิน</div>
      <div class="k">(${docKind})</div>
    </div>
  </div>

  <div class="parties">
    <div class="box">
      <div class="h">ลูกค้า / ผู้ซื้อ</div>
      <div>${esc(tax.buyer_name)}</div>
      <div>${esc(tax.buyer_address)}</div>
      ${buyerTaxLine}
    </div>
    <div class="box">
      <div class="meta"><span>เลขที่</span><span>${esc(tax.doc_no)}</span></div>
      <div class="meta"><span>วันที่</span><span>${esc(formatDate(sale.sold_at, 'D MMMM BBBB'))}</span></div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="c" style="width:10mm">ลำดับ</th>
        <th>รายการ</th>
        <th class="c" style="width:24mm">จำนวน</th>
        <th class="r" style="width:28mm">ราคา/หน่วย</th>
        <th class="r" style="width:30mm">จำนวนเงิน</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals">
    <div class="row"><span>รวมเป็นเงิน</span><span>${money(exVatTotal)}</span></div>
    <div class="row"><span>ภาษีมูลค่าเพิ่ม ${vatPct}%</span><span>${money(sale.total_vat)}</span></div>
    <div class="row grand"><span>จำนวนเงินรวมทั้งสิ้น</span><span>${money(sale.total_amount)}</span></div>
  </div>

  <div class="sign">
    <div>ผู้รับเงิน</div>
    <div>ผู้รับสินค้า</div>
  </div>
</body></html>`
}
