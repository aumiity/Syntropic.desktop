import { buildPrintFontFaceCss, esc } from '@/lib/print/fonts'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { QuotationForPrint, Setting } from '@/types'

// Full A4 quotation (ใบเสนอราคา). Structure mirrors buildTaxInvoiceHtml.
// VAT display follows the quote's snapshot (vat_enabled/vat_rate): when on, the
// table shows pre-tax amounts and the totals break VAT out; when off, amounts
// are shown as-is with no VAT line. Stored line_total is VAT-inclusive, so the
// pre-tax value is line_total × 100/(100+rate).
export async function buildQuotationHtml(
  quote: QuotationForPrint,
  shop: Partial<Setting>,
  opts: { fontFamily?: string } = {},
): Promise<string> {
  const fontFamily = opts.fontFamily || 'Sarabun'
  const fontFaceCss = await buildPrintFontFaceCss(fontFamily)
  const money = (n: number) => formatCurrency(n)

  const vat = quote.vat_enabled === 1
  const rate = quote.vat_rate || 7
  const factor = vat ? 100 / (100 + rate) : 1   // inclusive → ex-VAT
  const exVatTotal = vat ? quote.total_amount - quote.total_vat : quote.total_amount

  const rows = (quote.items ?? []).map((it, i) => {
    const lineShown = it.line_total * factor
    const unitShown = it.qty > 0 ? lineShown / it.qty : 0
    return `<tr>
      <td class="c">${i + 1}</td>
      <td>${esc(it.item_name)}</td>
      <td class="c">${money(it.qty)} ${esc(it.unit_name)}</td>
      <td class="r">${money(unitShown)}</td>
      <td class="r">${money(lineShown)}</td>
    </tr>`
  }).join('')

  const sellerBranch = shop.shop_branch ? ` (${esc(shop.shop_branch)})` : ''
  const buyerTaxLine = quote.customer_tax_id
    ? `<div>เลขประจำตัวผู้เสียภาษี: ${esc(quote.customer_tax_id)}</div>` : ''
  const validLine = quote.valid_until
    ? `<div class="meta"><span>ยืนราคาถึง</span><span>${esc(formatDate(quote.valid_until, 'D MMMM BBBB'))}</span></div>` : ''

  const totalsRows = vat ? `
    <div class="row"><span>รวมเป็นเงิน</span><span>${money(exVatTotal)}</span></div>
    <div class="row"><span>ภาษีมูลค่าเพิ่ม ${rate}%</span><span>${money(quote.total_vat)}</span></div>
    <div class="row grand"><span>จำนวนเงินรวมทั้งสิ้น</span><span>${money(quote.total_amount)}</span></div>
  ` : `
    <div class="row grand"><span>จำนวนเงินรวมทั้งสิ้น</span><span>${money(quote.total_amount)}</span></div>
  `

  const noteBlock = quote.note
    ? `<div class="note"><span class="h">หมายเหตุ:</span> ${esc(quote.note)}</div>` : ''

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
.totals { width: 60mm; margin-left: auto; margin-top: 3mm; font-size: 11pt; }
.totals .row { display: flex; justify-content: space-between; padding: 1mm 0; }
.totals .grand { font-weight: 700; font-size: 12pt; border-top: 1px solid #000; }
.note { margin-top: 4mm; font-size: 10pt; }
.note .h { font-weight: 700; }
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
      <div class="t">ใบเสนอราคา</div>
      <div class="muted">Quotation</div>
    </div>
  </div>

  <div class="parties">
    <div class="box">
      <div class="h">ลูกค้า</div>
      <div>${esc(quote.customer_name || '-')}</div>
      ${quote.customer_address ? `<div>${esc(quote.customer_address)}</div>` : ''}
      ${buyerTaxLine}
    </div>
    <div class="box">
      <div class="meta"><span>เลขที่</span><span>${esc(quote.quote_no)}</span></div>
      <div class="meta"><span>วันที่</span><span>${esc(formatDate(quote.issue_date, 'D MMMM BBBB'))}</span></div>
      ${validLine}
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

  <div class="totals">${totalsRows}</div>
  ${noteBlock}

  <div class="sign">
    <div>ผู้เสนอราคา</div>
    <div>ผู้อนุมัติ / ลูกค้า</div>
  </div>
</body></html>`
}
