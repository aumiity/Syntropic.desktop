import { bahtText, formatCurrency, formatDate } from '@/lib/utils'
import type { SaleForPrint, Setting, TaxInvoice } from '@/types'

// Shared React pieces for the full tax invoice (ใบกำกับภาษีเต็มรูป, ม.86/4) on A4
// PORTRAIT, laid out to mirror a standard Thai distributor invoice (TNP-style):
// shop block + meta box header, a bordered buyer box, a boxed items table whose
// column dividers run the full page height, then an amount-in-words line + a VAT
// summary box + signatures at the bottom. Used by BOTH the print popup
// (TaxInvoiceBuyerDialog) AND the DocumentSettingsTab sample preview, so what the
// owner configures = what prints, 1:1.
//
// Prices are stored VAT-INCLUSIVE, so each line's pre-tax value is
// line_total − unit_vat×qty and the document subtotal is total_amount − total_vat.
// Money (incl. qty) is formatted through formatCurrency → 2 decimals ("5.00").
// data-m attributes drive the hidden measure specimen; spacing is PADDING not
// margin so offsetHeight captures every gap.

// First column = running No. (our sale items carry no product code, unlike the
// TNP paper form's รหัสสินค้า column).
const COL_HEADERS = [
  'ลำดับ\nNo.',
  'จำนวน\nQuantity',
  'รายการ\nDescription',
  'ราคาต่อหน่วย\nUnit Price',
  'จำนวนเงิน\nAmount (THB)',
]

export interface TaxInvoiceSheetParts {
  headerBlock: React.ReactNode
  partiesBlock: React.ReactNode
  colgroup: React.ReactNode
  theadRow: React.ReactNode
  rowCells: (it: SaleForPrint['items'][number], idx: number) => React.ReactNode
  renderTable: (bodyRows: React.ReactNode) => React.ReactNode
  totalsBlock: React.ReactNode
  signatureBlock: React.ReactNode
}

export function taxInvoiceSheetParts({
  sale, shop, tax, copy,
}: {
  sale: SaleForPrint
  shop: Partial<Setting>
  tax: TaxInvoice
  copy: boolean
}): TaxInvoiceSheetParts {
  const exVatTotal = sale.total_amount - sale.total_vat
  const vatPct = exVatTotal > 0 ? Math.round((sale.total_vat / exVatTotal) * 100) : 7
  const docKind = copy ? 'สำเนา' : 'ต้นฉบับ'
  const sellerBranch = shop.shop_branch ? ` (${shop.shop_branch})` : ''

  // One row in a bordered meta box (label left, value right; border-b divider).
  const metaRow = (label: string, value: string, last = false) => (
    <div className={`flex justify-between gap-2 px-2 py-1 ${last ? '' : 'border-b border-foreground/80'}`}>
      <span className="text-foreground-subtle">{label}</span>
      <span className="font-medium text-right">{value || ' '}</span>
    </div>
  )

  // One labelled field inside the buyer box (fixed-width label + value).
  const field = (label: string, value: string, labelW = 'w-32') => (
    <div className="flex gap-2">
      <span className={`${labelW} shrink-0 text-foreground-subtle`}>{label}</span>
      <span className="min-w-0 font-medium">{value || ' '}</span>
    </div>
  )

  const headerBlock = (
    <div data-m="header" className="pb-2">
      <div className="flex items-start justify-between gap-4">
        {/* Shop (left) */}
        <div className="min-w-0">
          <div className="text-lg font-bold leading-tight">{shop.shop_name ?? ''}</div>
          {shop.shop_address ? <div className="mt-0.5 text-xs text-foreground-subtle">{[shop.shop_address, shop.shop_postcode].filter(Boolean).join(' ')}</div> : null}
          {shop.shop_phone ? <div className="text-xs text-foreground-subtle">โทรศัพท์ / TEL {shop.shop_phone}</div> : null}
          {shop.shop_tax_id ? <div className="text-xs text-foreground-subtle">เลขประจำตัวผู้เสียภาษี / TAX ID {shop.shop_tax_id}{sellerBranch}</div> : null}
          <div className="mt-2 text-sm font-bold">
            ใบกำกับภาษี / ใบเสร็จรับเงิน <span className="font-normal">({docKind})</span>
          </div>
        </div>
        {/* Meta box (right) */}
        <div className="w-[230px] shrink-0 self-start border border-foreground/80 text-xs">
          {metaRow('วันที่ / Date', formatDate(sale.sold_at))}
          {metaRow('เลขที่ / No.', tax.doc_no, true)}
        </div>
      </div>
    </div>
  )

  const partiesBlock = (
    <div data-m="parties" className="pb-2">
      <div className="space-y-1 border border-foreground/80 px-3 py-2 text-xs">
        {field('ชื่อลูกค้า / Name', tax.buyer_name)}
        {field('ที่อยู่ / Address', tax.buyer_address)}
        <div className="flex flex-wrap gap-x-8 gap-y-1">
          {field('เลขประจำตัวผู้เสียภาษี / Tax ID', tax.buyer_tax_id)}
          {field('สาขา / Branch', tax.buyer_branch, 'w-auto')}
        </div>
      </div>
    </div>
  )

  const colgroup = (
    <colgroup>
      <col style={{ width: '8%' }} />
      <col style={{ width: '14%' }} />
      <col style={{ width: '46%' }} />
      <col style={{ width: '16%' }} />
      <col style={{ width: '16%' }} />
    </colgroup>
  )

  // Header: a single underline (border-b) + vertical column dividers (border-l);
  // NO per-row horizontal lines below. Bilingual labels (Thai / English).
  const theadRow = (
    <tr>
      {COL_HEADERS.map(h => (
        <th key={h} className="border-l border-b border-foreground/80 px-2 py-1.5 text-center align-middle font-semibold whitespace-pre-line leading-tight">{h}</th>
      ))}
    </tr>
  )

  // Data cells carry ONLY the vertical column divider (border-l) — no row lines.
  // Column order matches the header: รหัส / จำนวน / รายการ / ราคา/หน่วย / จำนวนเงิน.
  const rowCells = (it: SaleForPrint['items'][number], idx: number) => {
    const lineExVat = it.line_total - it.unit_vat * it.qty
    const unitExVat = it.qty > 0 ? lineExVat / it.qty : 0
    return (
      <>
        <td className="border-l border-foreground/80 px-2 py-1 align-top text-center text-foreground-subtle">{idx + 1}</td>
        <td className="border-l border-foreground/80 px-2 py-1 align-top text-center">{formatCurrency(it.qty)} {it.unit_name}</td>
        <td className="border-l border-foreground/80 px-2 py-1 align-top">{it.item_name}</td>
        <td className="border-l border-foreground/80 px-2 py-1 align-top text-right">{formatCurrency(unitExVat)}</td>
        <td className="border-l border-foreground/80 px-2 py-1 align-top text-right">{formatCurrency(lineExVat)}</td>
      </>
    )
  }

  // Assemble the boxed items table: outer frame + vertical column dividers, the
  // header underline, NO row lines. A trailing h-full filler row absorbs the
  // remaining height so the column dividers run down the full page.
  const renderTable = (bodyRows: React.ReactNode) => (
    <table className="w-full h-full border-collapse border border-foreground/80 text-sm" style={{ tableLayout: 'fixed' }}>
      {colgroup}
      <thead>{theadRow}</thead>
      <tbody>
        {bodyRows}
        <tr className="h-full">
          {COL_HEADERS.map((_, i) => <td key={i} className="border-l border-foreground/80" />)}
        </tr>
      </tbody>
    </table>
  )

  // Bottom: amount in words (left) + VAT summary box (right). LAST page only.
  const totalsBlock = (
    <div data-m="totals" className="flex items-end justify-between gap-4 pt-2">
      <div className="min-w-0 flex-1 pb-1 text-sm font-bold">({bahtText(sale.total_amount)})</div>
      <div className="w-[300px] shrink-0 border border-foreground/80 text-xs">
        <div className="flex justify-between gap-2 border-b border-foreground/80 px-2 py-1">
          <span className="text-foreground-subtle">ค่าสินค้าก่อน VAT / Amount before Vat</span>
          <span className="font-medium">{formatCurrency(exVatTotal)}</span>
        </div>
        <div className="flex justify-between gap-2 border-b border-foreground/80 px-2 py-1">
          <span className="text-foreground-subtle">ภาษีมูลค่าเพิ่ม {vatPct}% / Value Added Tax</span>
          <span className="font-medium">{formatCurrency(sale.total_vat)}</span>
        </div>
        <div className="flex justify-between gap-2 px-2 py-1 text-sm font-bold">
          <span>ค่าสินค้ารวม VAT / Amount Include Vat</span>
          <span>{formatCurrency(sale.total_amount)}</span>
        </div>
      </div>
    </div>
  )

  // Signatures (LAST page only): receiver / cashier on the left, the authorizing
  // shop signature on the right. pt-* gaps are padding so they're measured.
  const signatureBlock = (
    <div data-m="signature" className="pt-6 text-xs">
      <div className="text-right text-foreground-subtle">ผิด ตก ยกเว้น E. &amp; O.E.</div>
      <div className="mt-2 flex items-end justify-between gap-6">
        <div className="flex gap-8">
          <div className="w-[150px] border-t border-dotted border-foreground/70 pt-1 text-center">ผู้รับสินค้า / Receiver</div>
          <div className="w-[150px] border-t border-dotted border-foreground/70 pt-1 text-center">ผู้รับเงิน / Cashier</div>
        </div>
        <div className="text-center">
          <div className="mb-7">ในนาม {shop.shop_name ?? ''}</div>
          <div className="mx-auto w-[180px] border-t border-dotted border-foreground/70 pt-1">ผู้รับมอบอำนาจ / Authorized Signature</div>
        </div>
      </div>
    </div>
  )

  return { headerBlock, partiesBlock, colgroup, theadRow, rowCells, renderTable, totalsBlock, signatureBlock }
}
