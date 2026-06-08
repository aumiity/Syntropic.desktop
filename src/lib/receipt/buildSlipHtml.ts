import { buildPrintFontFaceCss, esc } from '@/lib/print/fonts'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { alignCss, type RcSectionKey } from './sections'
import type { ReceiptSettings, SaleForPrint, Setting } from '@/types'

// Slip document modes:
//   receipt   — plain cash receipt (ใบเสร็จรับเงิน)
//   abbrevTax — doubles as ใบกำกับภาษีอย่างย่อ (ม.86/6): adds the title, seller
//               tax id + branch, and the mandatory "ราคารวมภาษีมูลค่าเพิ่มไว้แล้ว"
//   return    — refund document (ใบรับคืนสินค้า); amounts are already negative
//   void      — reprint of a voided bill, stamped ยกเลิก/VOID; never a tax invoice
export type SlipMode = 'receipt' | 'abbrevTax' | 'return' | 'void'

const TITLES: Record<SlipMode, string> = {
  receipt: 'ใบเสร็จรับเงิน',
  abbrevTax: 'ใบกำกับภาษีอย่างย่อ',
  return: 'ใบรับคืนสินค้า',
  void: 'ใบเสร็จรับเงิน (ยกเลิก)',
}

// One label/value row of a "pair" section.
type PairRow = { label: string; value: string }

// Build the 80mm (configurable) thermal slip HTML. Continuous roll: the page
// uses `@page size <w>mm auto` and the print IPC measures the rendered height.
//
// Per-section style model (SSOT: src/lib/receipt/sections.ts): each section is
// shown/hidden, bolded, and aligned by its own settings columns. Font SIZE is
// global (settings.font_size) — one size for the whole slip. For "pair" sections
// (label/value rows) the alignment 'justify' keeps the classic 2-column look
// (label left, value right); any other alignment packs "label value" onto one
// line and aligns the whole block left/center/right.
export async function buildSlipHtml(
  sale: SaleForPrint,
  shop: Partial<Setting>,
  settings: ReceiptSettings,
  opts: { mode?: SlipMode } = {},
): Promise<string> {
  const mode = opts.mode ?? 'receipt'
  const fontFamily = settings.font_family || 'Sarabun'
  const base = settings.font_size || 11
  const widthMm = settings.paper_width_mm || 80
  const fontFaceCss = await buildPrintFontFaceCss(fontFamily)

  const money = (n: number) => formatCurrency(n)
  const hasVat = (sale.total_vat ?? 0) > 0
  const exVat = sale.total_amount - sale.total_vat
  const isAbbrevTax = mode === 'abbrevTax'

  // Per-section style accessors (columns resolved by convention from the key).
  const shown = (k: RcSectionKey) => !!(settings as any)[`show_${k}`]
  const weight = (k: RcSectionKey) => ((settings as any)[`bold_${k}`] ? 700 : 400)
  const al = (k: RcSectionKey) => alignCss((settings as any)[`align_${k}`])

  // A "text" section: a block of plain lines (already HTML-escaped, joined by
  // <br>). Hidden when toggled off or empty.
  const textBlock = (k: RcSectionKey, innerHtml: string) =>
    shown(k) && innerHtml
      ? `<div class="sec" style="text-align:${al(k)};font-weight:${weight(k)}">${innerHtml}</div>`
      : ''

  // A "pair" section: label/value rows. 'justify' → 2-column flex; otherwise the
  // pair is packed ("label value") and the whole line aligned.
  const pairBlock = (k: RcSectionKey, rows: (PairRow | null)[]) => {
    const visible = rows.filter((r): r is PairRow => r != null)
    if (!shown(k) || visible.length === 0) return ''
    const w = weight(k)
    const a = al(k)
    if (a === 'justify') {
      return visible.map(r =>
        `<div class="prow" style="font-weight:${w}"><span>${r.label}</span><span class="val">${r.value}</span></div>`
      ).join('')
    }
    return visible.map(r =>
      `<div class="sec" style="text-align:${a};font-weight:${w}">${r.label} ${r.value}</div>`
    ).join('')
  }

  // ── Section content ────────────────────────────────────────────────────────
  // 1) ชื่อร้าน + สาขา
  const shopInner = [
    esc(shop.shop_name ?? ''),
    shop.shop_branch ? esc(shop.shop_branch) : '',
  ].filter(Boolean).join('<br>')

  // 2) ที่อยู่ + เบอร์โทร
  const contactInner = [
    shop.shop_address ? esc(shop.shop_address) : '',
    shop.shop_phone ? `โทร. ${esc(shop.shop_phone)}` : '',
  ].filter(Boolean).join('<br>')

  // 3) เลขประจำตัวผู้เสียภาษี
  const taxInner = shop.shop_tax_id ? `เลขประจำตัวผู้เสียภาษี ${esc(shop.shop_tax_id)}` : ''

  // 5) เลขที่ / วันที่ / ผู้รับบริการ
  const billRows: (PairRow | null)[] = [
    { label: 'เลขที่', value: esc(sale.invoice_no) },
    { label: 'วันที่', value: esc(formatDateTime(sale.sold_at)) },
    sale.customer_name ? { label: 'ลูกค้า', value: esc(sale.customer_name) } : null,
  ]

  // 6) รายการขาย (fixed layout — not user-styleable)
  const itemsHtml = sale.items.map(it => {
    const discRow = it.discount > 0
      ? `<div class="line"><span>ส่วนลด</span><span class="val">-${money(it.discount)}</span></div>`
      : ''
    return `<div class="item">
      <div class="iname">${esc(it.item_name)}</div>
      <div class="line"><span>${money(it.qty)} ${esc(it.unit_name)} × ${money(it.unit_price)}</span><span class="val">${money(it.line_total)}</span></div>
      ${discRow}
    </div>`
  }).join('')

  // 7) มูลค่า / ส่วนลด / ภาษี / รวมทั้งสิ้น
  const summaryRows: (PairRow | null)[] = [
    { label: 'ยอดรวม', value: money(sale.subtotal) },
    sale.total_discount > 0 ? { label: 'ส่วนลด', value: `-${money(sale.total_discount)}` } : null,
    ...(hasVat
      ? [
          { label: 'มูลค่าก่อนภาษี', value: money(exVat) },
          { label: 'ภาษีมูลค่าเพิ่ม', value: money(sale.total_vat) },
        ]
      : []),
    { label: 'รวมทั้งสิ้น', value: money(sale.total_amount) },
  ]

  // 8) รับเงิน / เงินทอน
  const paymentRows: (PairRow | null)[] = sale.cash_amount > 0
    ? [
        { label: 'รับเงิน', value: money(sale.cash_amount) },
        { label: 'เงินทอน', value: money(sale.change_amount) },
      ]
    : []

  // 9) ข้อความท้ายใบเสร็จ
  const footerInner = settings.footer_note ? esc(settings.footer_note) : ''

  // 10) พนักงานขาย
  const salespersonInner = sale.salesperson_name ? `พนักงานขาย ${esc(sale.salesperson_name)}` : ''

  // Non-styleable stamps/notes.
  const voidBanner = mode === 'void' ? `<div class="void">** ยกเลิก / VOID **</div>` : ''
  const abbrevNote = isAbbrevTax ? `<div class="sec center">ราคารวมภาษีมูลค่าเพิ่มไว้แล้ว</div>` : ''

  return `<!doctype html><html><head><meta charset="utf-8">
<style>
${fontFaceCss}
@page { size: ${widthMm}mm auto; margin: 0; }
html, body { margin: 0; padding: 0; }
body {
  width: ${widthMm}mm;
  padding: 3mm 4mm;
  box-sizing: border-box;
  font-family: '${fontFamily}', sans-serif;
  font-size: ${base}pt;
  line-height: 1.35;
  color: #000; background: #fff;
}
.center { text-align: center; }
.sec { margin: 0.3mm 0; white-space: pre-line; }
.void { text-align: center; font-weight: 700; margin: 1mm 0; }
hr { border: none; border-top: 1px dashed #000; margin: 1.5mm 0; }
.prow { display: flex; justify-content: space-between; gap: 2mm; }
.prow .val, .line .val { white-space: nowrap; }
.line { display: flex; justify-content: space-between; gap: 2mm; }
.item { margin-bottom: 1mm; }
.iname { font-weight: 600; }
</style></head><body>
  ${textBlock('shop', shopInner)}
  ${textBlock('shop_contact', contactInner)}
  ${textBlock('tax_id', taxInner)}
  ${textBlock('title', esc(TITLES[mode]))}
  ${voidBanner}
  <hr>
  ${pairBlock('bill_info', billRows)}
  <hr>
  ${itemsHtml}
  <hr>
  ${pairBlock('summary', summaryRows)}
  ${pairBlock('payment', paymentRows)}
  ${abbrevNote}
  <hr>
  ${textBlock('footer', footerInner)}
  ${textBlock('salesperson', salespersonInner)}
</body></html>`
}
