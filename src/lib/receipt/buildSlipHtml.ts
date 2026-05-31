import { buildPrintFontFaceCss, esc } from '@/lib/print/fonts'
import { formatCurrency, formatDateTime } from '@/lib/utils'
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

// Build the 80mm (configurable) thermal slip HTML. Continuous roll: the page
// uses `@page size <w>mm auto` and the print IPC measures the rendered height.
export async function buildSlipHtml(
  sale: SaleForPrint,
  shop: Partial<Setting>,
  settings: ReceiptSettings,
  opts: { mode?: SlipMode } = {},
): Promise<string> {
  const mode = opts.mode ?? 'receipt'
  const fontFamily = settings.font_family || 'Bai Jamjuree'
  const base = settings.font_size || 11
  const widthMm = settings.paper_width_mm || 80
  const fontFaceCss = await buildPrintFontFaceCss(fontFamily)

  const money = (n: number) => formatCurrency(n)
  const hasVat = (sale.total_vat ?? 0) > 0
  const exVat = sale.total_amount - sale.total_vat
  const isAbbrevTax = mode === 'abbrevTax'

  const shopLines: string[] = []
  if (shop.shop_address) shopLines.push(esc(shop.shop_address))
  if (shop.shop_phone) shopLines.push(`โทร. ${esc(shop.shop_phone)}`)
  // Tax id + branch are mandatory on an abbreviated tax invoice (ม.86/6).
  if (isAbbrevTax && shop.shop_tax_id) {
    shopLines.push(`เลขผู้เสียภาษี ${esc(shop.shop_tax_id)}`)
    if (shop.shop_branch) shopLines.push(esc(shop.shop_branch))
  }

  const itemsHtml = sale.items.map(it => {
    const discRow = it.discount > 0
      ? `<div class="line disc"><span>ส่วนลด</span><span>-${money(it.discount)}</span></div>`
      : ''
    return `<div class="item">
      <div class="iname">${esc(it.item_name)}</div>
      <div class="line"><span>${money(it.qty)} ${esc(it.unit_name)} × ${money(it.unit_price)}</span><span>${money(it.line_total)}</span></div>
      ${discRow}
    </div>`
  }).join('')

  const vatBlock = hasVat ? `
    <div class="line"><span>มูลค่าก่อนภาษี</span><span>${money(exVat)}</span></div>
    <div class="line"><span>ภาษีมูลค่าเพิ่ม</span><span>${money(sale.total_vat)}</span></div>
  ` : ''

  const cashBlock = sale.cash_amount > 0 ? `
    <div class="line"><span>รับเงิน</span><span>${money(sale.cash_amount)}</span></div>
    <div class="line"><span>เงินทอน</span><span>${money(sale.change_amount)}</span></div>
  ` : ''

  const voidBanner = mode === 'void'
    ? `<div class="void">** ยกเลิก / VOID **</div>` : ''

  const abbrevNote = isAbbrevTax
    ? `<div class="center small">ราคารวมภาษีมูลค่าเพิ่มไว้แล้ว</div>` : ''

  const customerLine = sale.customer_name
    ? `<div class="line"><span>ลูกค้า</span><span>${esc(sale.customer_name)}</span></div>` : ''

  const headerNote = settings.header_note
    ? `<div class="center small">${esc(settings.header_note)}</div>` : ''
  const footerNote = settings.footer_note
    ? `<div class="center">${esc(settings.footer_note)}</div>` : ''

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
.small { font-size: ${Math.max(7, base - 2)}pt; }
.shop { text-align: center; }
.shop .name { font-size: ${base + 3}pt; font-weight: 700; }
.title { text-align: center; font-weight: 700; font-size: ${base + 1}pt; margin: 1mm 0; }
.void { text-align: center; font-weight: 700; font-size: ${base + 2}pt; margin: 1mm 0; }
hr { border: none; border-top: 1px dashed #000; margin: 1.5mm 0; }
.line { display: flex; justify-content: space-between; gap: 2mm; }
.line > span:last-child { white-space: nowrap; }
.disc { font-size: ${Math.max(7, base - 2)}pt; }
.item { margin-bottom: 1mm; }
.iname { font-weight: 600; }
.total { display: flex; justify-content: space-between; font-weight: 700; font-size: ${base + 3}pt; margin: 1mm 0; }
</style></head><body>
  <div class="shop">
    <div class="name">${esc(shop.shop_name ?? '')}</div>
    ${shopLines.map(l => `<div class="small">${l}</div>`).join('')}
  </div>
  <div class="title">${TITLES[mode]}</div>
  ${voidBanner}
  ${headerNote}
  <hr>
  <div class="line"><span>เลขที่</span><span>${esc(sale.invoice_no)}</span></div>
  <div class="line"><span>วันที่</span><span>${esc(formatDateTime(sale.sold_at))}</span></div>
  ${customerLine}
  <hr>
  ${itemsHtml}
  <hr>
  <div class="line"><span>ยอดรวม</span><span>${money(sale.subtotal)}</span></div>
  ${sale.total_discount > 0 ? `<div class="line"><span>ส่วนลด</span><span>-${money(sale.total_discount)}</span></div>` : ''}
  ${vatBlock}
  <div class="total"><span>รวมทั้งสิ้น</span><span>${money(sale.total_amount)}</span></div>
  ${cashBlock}
  ${abbrevNote}
  <hr>
  ${footerNote}
</body></html>`
}
