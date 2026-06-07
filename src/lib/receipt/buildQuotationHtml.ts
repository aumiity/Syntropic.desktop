import { buildPrintFontFaceCss, esc } from '@/lib/print/fonts'
import { bahtText, formatCurrency, formatDate } from '@/lib/utils'
import type { QuotationForPrint, Setting } from '@/types'

// Full A4 quotation (ใบเสนอราคา) — gold-accent layout: big "Quotation" wordmark,
// two-column party block, a single bordered card holding the line table + totals,
// then a footer with shop info and two signature blocks.
//
// VAT display follows the quote's snapshot (vat_enabled/vat_rate): when on, the
// table shows pre-tax amounts and the totals break VAT out; when off, amounts
// are shown as-is with no VAT line. Stored line_total is VAT-inclusive, so the
// pre-tax value is line_total × 100/(100+rate).
export async function buildQuotationHtml(
  quote: QuotationForPrint,
  shop: Partial<Setting>,
  opts: { fontFamily?: string; paperSize?: 'A4' | 'A5' } = {},
): Promise<string> {
  const fontFamily = opts.fontFamily || 'Sarabun'
  const paperSize = opts.paperSize || 'A4'
  // A5 = A4 zoomed by the linear page ratio (148/210 ≈ 0.705) — see buildTaxInvoiceHtml.
  const zoom = paperSize === 'A5' ? 148 / 210 : 1
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
      <td class="c muted">${i + 1}</td>
      <td class="name">${esc(it.item_name)}</td>
      <td class="c">${money(it.qty)} ${esc(it.unit_name)}</td>
      <td class="r">${money(unitShown)}</td>
      <td class="r">${money(lineShown)}</td>
    </tr>`
  }).join('')

  const sellerBranch = shop.shop_branch ? ` (${esc(shop.shop_branch)})` : ''

  // Left party rows — only render a line when we actually hold the value.
  const leftRows = [
    ['ชื่อลูกค้า', `<b>${esc(quote.customer_name || '-')}</b>`],
    quote.customer_address ? ['ที่อยู่', esc(quote.customer_address)] : null,
    quote.customer_tax_id ? ['เลขผู้เสียภาษี', `<b>${esc(quote.customer_tax_id)}</b>`] : null,
  ].filter(Boolean) as [string, string][]
  const leftBlock = leftRows
    .map(([k, v]) => `<div class="prow"><span class="k">${k}</span><span class="v">${v}</span></div>`)
    .join('')

  // Right party rows — doc number / dates.
  const rightRows = [
    ['เลขที่', `<b>${esc(quote.quote_no)}</b>`],
    ['วันที่', `<b>${esc(formatDate(quote.issue_date, 'D MMMM BBBB'))}</b>`],
    quote.valid_until ? ['ครบกำหนด', `<b>${esc(formatDate(quote.valid_until, 'D MMMM BBBB'))}</b>`] : null,
  ].filter(Boolean) as [string, string][]
  const rightBlock = rightRows
    .map(([k, v]) => `<div class="prow"><span class="k">${k}</span><span class="v">${v}</span></div>`)
    .join('')

  const totalsRows = [
    `<div class="trow"><span>ราคารวม</span><span>${money(exVatTotal)}</span></div>`,
    vat ? `<div class="trow"><span>ภาษีมูลค่าเพิ่ม (${rate}%)</span><span>${money(quote.total_vat)}</span></div>` : '',
    quote.total_discount > 0 ? `<div class="trow"><span>ส่วนลด</span><span>${money(quote.total_discount)}</span></div>` : '',
  ].filter(Boolean).join('')

  const noteBlock = quote.note
    ? `<div class="note"><div class="note-h">หมายเหตุ</div><div class="note-b">${esc(quote.note)}</div></div>`
    : '<div class="note"><div class="note-h">หมายเหตุ</div></div>'

  // Seller (shop) lines shown under the shop name in the header — only non-empty.
  const sellerLines = [
    shop.shop_address ? esc(shop.shop_address) : '',
    shop.shop_license_no ? `เลขที่ใบอนุญาต ${esc(shop.shop_license_no)}` : '',
    shop.shop_tax_id ? `เลขประจำตัวผู้เสียภาษี ${esc(shop.shop_tax_id)}${sellerBranch}` : '',
    shop.shop_phone ? `โทร. ${esc(shop.shop_phone)}` : '',
    shop.shop_line_id ? `LINE: ${esc(shop.shop_line_id)}` : '',
  ].filter(Boolean).map(l => `<div>${l}</div>`).join('')

  return `<!doctype html><html><head><meta charset="utf-8">
<style>
${fontFaceCss}
:root {
  --gold: #c2a878;
  --gold-soft: #e7dcc6;
  --ink: #36322c;
  --muted: #8c8a85;
  --line: #ece6da;
}
* { box-sizing: border-box; }
@page { size: ${paperSize}; margin: 0; }
html, body { margin: 0; }
html { zoom: ${zoom}; }
body {
  padding: 14mm 14mm 12mm;
  font-family: '${fontFamily}', sans-serif;
  font-size: 10.5pt; color: #1a1a1a; background: #fff;
  display: flex; flex-direction: column; min-height: 296mm;
}

/* ---- header ---- */
.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12mm; }
.seller { font-size: 9.5pt; line-height: 1.5; color: #444; }
.seller .fname { font-size: 15pt; font-weight: 700; color: var(--ink); line-height: 1.15; margin-bottom: 1.5mm; }
.title { text-align: right; }
.title .en { font-size: 34pt; font-weight: 700; color: var(--ink); line-height: 0.95; letter-spacing: -0.5px; }
.title .th { font-size: 16pt; font-weight: 700; color: var(--ink); margin-top: 0.5mm; }
.rule { border: none; border-top: 1.5px solid var(--gold); margin: 6mm 0 5mm; }

/* ---- parties ---- */
.parties { display: flex; gap: 12mm; margin-bottom: 7mm; }
.parties > div { flex: 1; }
.prow { display: flex; gap: 4mm; margin-bottom: 1.4mm; font-size: 10pt; line-height: 1.45; }
.prow .k { color: var(--muted); white-space: nowrap; min-width: 26mm; }
.prow .v { color: #1a1a1a; }
.prow .v b, .prow .v { font-weight: 400; }
.prow .v b { font-weight: 700; }

/* ---- card (table + totals) ---- */
.card { border: 1px solid var(--gold); border-radius: 6px; overflow: hidden;
  flex: 1; display: flex; flex-direction: column; }
.items { flex: 1; }
table { width: 100%; border-collapse: collapse; font-size: 10pt; }
thead th {
  text-align: left; font-weight: 700; color: var(--ink);
  padding: 3mm 5mm; border-bottom: 1px solid var(--gold);
}
tbody td { padding: 2.2mm 5mm; vertical-align: top; }
tbody tr:first-child td { padding-top: 4mm; }
.name { font-weight: 700; }
.c { text-align: center; }
.r { text-align: right; white-space: nowrap; }
.muted { color: var(--muted); }
th.c { text-align: center; }
th.r { text-align: right; }

/* ---- summary band inside card ---- */
.summary { display: flex; border-top: 1px solid var(--gold); }
.note { flex: 1; padding: 4mm 5mm; }
.note-h { font-weight: 700; color: var(--ink); margin-bottom: 1.5mm; }
.note-b { font-size: 9.5pt; color: #444; white-space: pre-wrap; }
.totals { width: 78mm; padding: 4mm 5mm; }
.trow { display: flex; justify-content: space-between; padding: 0.8mm 0; font-size: 10pt; }
.trow span:first-child { color: var(--muted); }
.trow span:last-child { font-weight: 700; }

.grand { display: flex; justify-content: space-between; align-items: flex-end;
  border-top: 1px solid var(--gold); padding: 4mm 5mm; }
.grand .g-label { font-size: 13pt; font-weight: 700; color: var(--ink); }
.grand .g-amt { text-align: right; }
.grand .g-amt .num { font-size: 17pt; font-weight: 700; color: var(--ink); line-height: 1; }
.grand .g-amt .words { font-size: 9.5pt; color: var(--muted); margin-top: 1mm; }

/* ---- footer ---- */
.foot { display: flex; justify-content: flex-end; margin-top: auto; padding-top: 14mm; }
.signs { display: flex; gap: 14mm; }
.sign { width: 56mm; }
.sign .role { text-align: right; font-size: 9.5pt; color: var(--muted); margin-bottom: 9mm; }
.sign .line { border-bottom: 1px dotted var(--gold); margin-bottom: 1.5mm; }
.sign .who { text-align: center; font-size: 9.5pt; }
.sign .who .nm { color: #1a1a1a; }
.sign .who .ti { font-weight: 700; color: var(--ink); }
.sign .date { display: flex; align-items: flex-end; gap: 2mm; margin-top: 6mm; font-size: 9.5pt; color: var(--muted); }
.sign .date .dl { flex: 1; border-bottom: 1px dotted var(--gold); height: 4mm; }
</style></head><body>
  <div class="head">
    <div class="seller">
      <div class="fname">${esc(shop.shop_name ?? '')}</div>
      ${sellerLines}
    </div>
    <div class="title">
      <div class="en">Quotation</div>
      <div class="th">ใบเสนอราคา</div>
    </div>
  </div>

  <hr class="rule">

  <div class="parties">
    <div>${leftBlock}</div>
    <div>${rightBlock}</div>
  </div>

  <div class="card">
    <div class="items">
      <table>
        <thead>
          <tr>
            <th class="c" style="width:14mm">ลำดับ</th>
            <th>รายการสินค้า</th>
            <th class="c" style="width:26mm">จำนวน</th>
            <th class="r" style="width:30mm">ราคา/หน่วย</th>
            <th class="r" style="width:32mm">ราคารวม</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>

    <div class="summary">
      ${noteBlock}
      <div class="totals">${totalsRows}</div>
    </div>

    <div class="grand">
      <div class="g-label">จำนวนเงินรวมทั้งสิ้น</div>
      <div class="g-amt">
        <div class="num">${money(quote.total_amount)}</div>
        <div class="words">(${bahtText(quote.total_amount)})</div>
      </div>
    </div>
  </div>

  <div class="foot">
    <div class="signs">
      <div class="sign">
        <div class="role">ผู้เสนอราคา</div>
        <div class="line"></div>
        <div class="who"><div class="nm">(........................................)</div></div>
        <div class="date"><span>วันที่</span><span class="dl"></span></div>
      </div>
      <div class="sign">
        <div class="role">ผู้รับใบเสนอราคา</div>
        <div class="line"></div>
        <div class="who"><div class="nm">(........................................)</div></div>
        <div class="date"><span>วันที่</span><span class="dl"></span></div>
      </div>
    </div>
  </div>
</body></html>`
}
