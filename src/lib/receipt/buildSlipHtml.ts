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

  // 6) รายการขาย — two layouts (settings.items_layout; column order/labels fixed,
  //    not per-section styleable):
  //    detailed = ชื่อบรรทัดแรก + "จำนวน หน่วย × ราคา … ยอด" บรรทัดสอง (ค่าเริ่มต้น)
  //    table    = ตาราง 1 บรรทัด/รายการ: ชื่อ | จำนวน+หน่วย | ราคา | รวม. ฟอนต์ของ
  //               ตารางย่อลงเล็กน้อย (.itbl) ให้ครบ 4 คอลัมน์; ชื่อยาวตัดบรรทัดใน
  //               คอลัมน์ตัวเอง. คอลัมน์ "รวม" = ยอดสุทธิ (หักส่วนลดแล้ว); ส่วนลด
  //               รวมโชว์ในสรุปนอกตาราง จึงไม่ทำซ้ำเป็นแถวในตาราง
  // ตาราง 4 คอลัมน์ต้องการกระดาษกว้าง — บนม้วนแคบ (58 มม.) แน่นเกินไป จึงบังคับ
  // กลับไปใช้แบบ detailed (2 บรรทัด) ไม่ว่าจะตั้งค่าไว้แบบไหน.
  const ITEMS_TABLE_MIN_WIDTH_MM = 72
  const itemsLayout =
    settings.items_layout === 'table' && widthMm >= ITEMS_TABLE_MIN_WIDTH_MM ? 'table' : 'detailed'

  const itemsDetailed = sale.items.map(it => {
    const discRow = it.discount > 0
      ? `<div class="line"><span>ส่วนลด</span><span class="val">-${money(it.discount)}</span></div>`
      : ''
    return `<div class="item">
      <div class="iname">${esc(it.item_name)}</div>
      <div class="line"><span>${money(it.qty)} ${esc(it.unit_name)} × ${money(it.unit_price)}</span><span class="val">${money(it.line_total)}</span></div>
      ${discRow}
    </div>`
  }).join('')

  const itemsTable = `<table class="itbl">
  <thead><tr><th class="c-name">รายการ</th><th class="c-qty">จำนวน</th><th class="c-price">ราคา</th><th class="c-amt">รวม</th></tr></thead>
  <tbody>${sale.items.map(it =>
    `<tr><td class="c-name">${esc(it.item_name)}</td><td class="c-qty">${money(it.qty)} ${esc(it.unit_name)}</td><td class="c-price">${money(it.unit_price)}</td><td class="c-amt">${money(it.line_total)}</td></tr>`
  ).join('')}</tbody>
</table>`

  const itemsHtml = itemsLayout === 'table' ? itemsTable : itemsDetailed

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

  // Rendered summary/payment blocks: a dashed rule separates รวมทั้งสิ้น from
  // รับเงิน, but only when BOTH blocks are present — skip it on non-cash sales
  // (empty payment) or when either section is hidden, to avoid a dangling rule.
  const summaryHtml = pairBlock('summary', summaryRows)
  const paymentHtml = pairBlock('payment', paymentRows)
  const summaryPaymentHr = summaryHtml && paymentHtml ? '<hr>' : ''

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
/* Table layout (items_layout='table'): font shrunk a touch so the 4 columns fit
   a narrow roll; the name column wraps, the numeric columns stay on one line. */
.itbl { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 0.85em; }
.itbl th, .itbl td { padding: 0.3mm 0.5mm; vertical-align: top; }
.itbl thead th { border-bottom: 1px solid #000; font-weight: 600; }
.itbl .c-name { width: 50%; text-align: left; word-break: break-word; }
.itbl .c-qty { width: 18%; text-align: center; }
.itbl .c-price, .itbl .c-amt { width: 16%; text-align: right; white-space: nowrap; }
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
  ${summaryHtml}
  ${summaryPaymentHr}
  ${paymentHtml}
  ${abbrevNote}
  <hr>
  ${textBlock('footer', footerInner)}
  ${textBlock('salesperson', salespersonInner)}
</body></html>`
}
