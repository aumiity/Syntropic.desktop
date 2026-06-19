import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import ReportPrintDialog from '@/pages/Reports/ReportPrintDialog'
import { A4Sheet, A4P_CONTENT_W, A4P_CONTENT_H, FOOTER_H, PACK_SAFETY } from '@/pages/Reports/a4'
import { bahtText, formatCurrency, formatDate } from '@/lib/utils'
import type { Setting } from '@/types'

// Minimal shape the goods-receipt print needs — re-homed here from the former
// buildGoodsReceiptHtml.ts (which this component replaces). PurchaseReceiptDialog
// builds this from the rows purchase:getReceipt returns.
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

// One contiguous slice of data rows on a single A4 page.
interface Page { start: number; end: number }

// Strip trailing zeros — qty shows "5" not "5.00" (mirrors KhorYor9's formatQty).
function formatQty(n: number): string {
  if (n == null || isNaN(n)) return ''
  return n % 1 === 0 ? String(n) : parseFloat(n.toFixed(2)).toString()
}

const COL_HEADERS = [
  'ลำดับ\nNo.',
  'รายการ\nDescription',
  'จำนวน\nQty',
  'หน่วย\nUnit',
  'ราคา/หน่วย\nUnit Cost',
  'รวม\nAmount',
]

// Portrait A4 print-preview popup for ใบรับสินค้า (GR). Same stack as the ขย.
// registers + tax invoice (React A4Sheet measured + greedily packed into
// fixed-height pages, printed via printDomSheets), styled to match the tax-invoice
// form: full header + parties (every page) + a BOXED items table whose column
// dividers run the full page height (h-full filler row, NO row lines), then a
// footer (amount-in-words + summary box + signature) on the LAST page only.
export function GoodsReceiptPrintDialog({
  open, onOpenChange, gr,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  gr: GoodsReceiptForPrint | null
}) {
  const [shop, setShop] = useState<Partial<Setting>>({})
  const [pages, setPages] = useState<Page[]>([])
  const measureRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    ;(window.api.settings as any).getShop().then((d: Setting | null) => setShop(d ?? {})).catch(() => {})
  }, [open])

  // Stable identity while gr is stable (gr is memoized by the caller) — feeds the
  // measure-pack effect's dep array without re-triggering it every render.
  const lines = useMemo(() => gr?.lines ?? [], [gr])

  const rawTotal = useMemo(() => lines.reduce((s, l) => s + l.cost_price * l.qty_received, 0), [lines])
  const discountAmt = gr?.discount_amount ?? 0
  const surchargeAmt = gr?.surcharge_amount ?? 0
  const hasAdjust = discountAmt > 0 || surchargeAmt > 0
  const finalTotal = rawTotal - discountAmt + surchargeAmt
  const isCredit = gr?.payment_type === 'credit'
  const sellerBranch = shop.shop_branch ? ` (${shop.shop_branch})` : ''

  // ── Sheet pieces (data-m attributes drive the hidden measure specimen; they're
  //    inert on the real render). Spacing is PADDING not margin so offsetHeight
  //    captures every gap and the page budget never under-reserves. ──

  const headerBlock = (
    <div data-m="header" className="flex items-start justify-between pb-3">
      <div className="min-w-0">
        <div className="text-base font-bold">{shop.shop_name ?? ''}</div>
        {shop.shop_address ? <div className="text-xs text-foreground-subtle">{shop.shop_address}</div> : null}
        {shop.shop_phone ? <div className="text-xs text-foreground-subtle">โทร. {shop.shop_phone}</div> : null}
        {shop.shop_tax_id ? <div className="text-xs text-foreground-subtle">เลขประจำตัวผู้เสียภาษี: {shop.shop_tax_id}{sellerBranch}</div> : null}
      </div>
      <div className="shrink-0 text-right">
        <div className="text-lg font-bold">ใบรับสินค้า</div>
        <div className="text-xs text-foreground-subtle">Goods Receipt</div>
      </div>
    </div>
  )

  const partiesBlock = (
    <div data-m="parties" className="flex gap-3 pb-2 text-xs">
      <div className="flex-1 rounded border border-foreground/80 p-2">
        <div className="mb-0.5 font-bold">ผู้จัดจำหน่าย</div>
        <div>{gr?.supplier_name || '-'}</div>
        {gr?.supplier_invoice_no ? <div>เลขที่ใบกำกับผู้ขาย: {gr.supplier_invoice_no}</div> : null}
      </div>
      <div className="flex-1 space-y-0.5 rounded border border-foreground/80 p-2">
        <div className="flex justify-between"><span>เลขที่รับ</span><span>{gr?.invoice_no ?? ''}</span></div>
        {gr?.order_date ? <div className="flex justify-between"><span>วันที่สั่งซื้อ</span><span>{formatDate(gr.order_date, 'D MMMM BBBB')}</span></div> : null}
        {gr?.received_date ? <div className="flex justify-between"><span>วันที่รับสินค้า</span><span>{formatDate(gr.received_date, 'D MMMM BBBB')}</span></div> : null}
        <div className="flex justify-between"><span>การชำระเงิน</span><span>{isCredit ? 'เครดิต' : 'เงินสด'}</span></div>
        {isCredit && gr?.due_date ? <div className="flex justify-between"><span>ครบกำหนด</span><span>{formatDate(gr.due_date, 'D MMMM BBBB')}</span></div> : null}
      </div>
    </div>
  )

  const colgroup = (
    <colgroup>
      <col style={{ width: '8%' }} />
      <col style={{ width: '40%' }} />
      <col style={{ width: '12%' }} />
      <col style={{ width: '12%' }} />
      <col style={{ width: '14%' }} />
      <col style={{ width: '14%' }} />
    </colgroup>
  )

  const theadRow = (
    <tr>
      {COL_HEADERS.map(h => (
        <th key={h} className="border-l border-b border-foreground/80 px-2 py-1.5 text-center align-middle font-semibold whitespace-pre-line leading-tight">{h}</th>
      ))}
    </tr>
  )

  // Cells shared by the real row and the measure specimen's row (so measured
  // heights line up 1:1 with what prints).
  const rowCells = (l: GoodsReceiptLine, idx: number) => {
    const meta = [
      l.lot_number ? `Lot. ${l.lot_number}` : '',
      l.expiry_date ? `exp. ${formatDate(l.expiry_date)}` : '',
    ].filter(Boolean).join('　')
    return (
      <>
        <td className="border-l border-foreground/80 px-2 py-1 align-top text-center">{idx + 1}</td>
        <td className="border-l border-foreground/80 px-2 py-1 align-top">
          {l.trade_name}
          {meta ? <div className="text-xs text-foreground-subtle">{meta}</div> : null}
        </td>
        <td className="border-l border-foreground/80 px-2 py-1 align-top text-right">{formatQty(l.qty_received)}</td>
        <td className="border-l border-foreground/80 px-2 py-1 align-top text-center">{l.unit_name ?? ''}</td>
        <td className="border-l border-foreground/80 px-2 py-1 align-top text-right">{formatCurrency(l.cost_price)}</td>
        <td className="border-l border-foreground/80 px-2 py-1 align-top text-right">{formatCurrency(l.cost_price * l.qty_received)}</td>
      </>
    )
  }

  // Boxed items table: outer frame + vertical column dividers, header underline,
  // NO row lines. A trailing h-full filler row absorbs the remaining height so the
  // column dividers run down the full page (matching the tax-invoice / paper form).
  const renderTable = (bodyRows: ReactNode) => (
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

  // Bottom: amount in words (left) + a bordered summary box (right). LAST page only.
  const totalsBlock = (
    <div data-m="totals" className="flex items-end justify-between gap-4 pt-2">
      <div className="min-w-0 flex-1 pb-1 text-sm font-bold">({bahtText(finalTotal)})</div>
      <div className="w-[280px] shrink-0 border border-foreground/80 text-sm">
        {hasAdjust ? <div className="flex justify-between gap-2 border-b border-foreground/80 px-2 py-1"><span className="text-foreground-subtle">ราคารวม</span><span>{formatCurrency(rawTotal)}</span></div> : null}
        {discountAmt > 0 ? <div className="flex justify-between gap-2 border-b border-foreground/80 px-2 py-1"><span className="text-foreground-subtle">ส่วนลด</span><span>−{formatCurrency(discountAmt)}</span></div> : null}
        {surchargeAmt > 0 ? <div className="flex justify-between gap-2 border-b border-foreground/80 px-2 py-1"><span className="text-foreground-subtle">ส่วนเพิ่ม</span><span>+{formatCurrency(surchargeAmt)}</span></div> : null}
        <div className="flex justify-between gap-2 px-2 py-1 font-bold"><span>ยอดสุทธิ</span><span>{formatCurrency(finalTotal)}</span></div>
      </div>
    </div>
  )

  // pt-6 = a consistent gap above the signature line; it's PADDING so offsetHeight
  // (= signatureH) reserves it in the page budget.
  const signatureBlock = (
    <div data-m="signature" className="flex justify-between pt-6 text-center text-xs">
      <div className="mx-auto w-[200px] border-t border-dotted border-foreground/70 pt-1">ผู้รับสินค้า</div>
      <div className="mx-auto w-[200px] border-t border-dotted border-foreground/70 pt-1">ผู้ส่งสินค้า</div>
    </div>
  )

  // Measure the specimen, then greedily pack rows into fixed-height portrait pages.
  // Totals is reserved as a trailing pseudo-row on the LAST page (spilling to a
  // fresh page if the final data page is full) so it can never be clipped by
  // A4Sheet's overflow-hidden. Runs pre-paint so the preview never flashes empty.
  useLayoutEffect(() => {
    if (!open) return
    const root = measureRef.current
    if (!root) return
    const h = (sel: string) => (root.querySelector(sel) as HTMLElement | null)?.offsetHeight ?? 0
    const headerH = h('[data-m="header"]')
    const partiesH = h('[data-m="parties"]')
    const theadH = h('[data-m="thead"]')
    const signatureH = h('[data-m="signature"]')
    const totalsH = h('[data-m="totals"]')
    const rowEls = Array.from(root.querySelectorAll('[data-m="row"]')) as HTMLElement[]
    const rowHs = rowEls.map(e => e.offsetHeight)

    // header + parties + thead repeat on EVERY page → reserve them. The footer
    // (amount-words + summary box + signature) is LAST page only → reserved as a
    // trailing pseudo-row, not per page.
    const budget = A4P_CONTENT_H - headerH - partiesH - theadH - FOOTER_H - PACK_SAFETY
    const footerH = totalsH + signatureH

    const out: Page[] = []
    if (rowHs.length === 0) {
      out.push({ start: 0, end: 0 })
    } else {
      let i = 0
      while (i < rowHs.length) {
        let used = 0
        const start = i
        while (i < rowHs.length && used + rowHs[i] <= budget) { used += rowHs[i]; i++ }
        if (i === start) { used += rowHs[i]; i++ } // a single over-tall row: place it anyway
        out.push({ start, end: i })
      }
      // Footer (totals + signature, last page) reserved as a trailing pseudo-row;
      // if the last data page is too full, spill the footer to a fresh page.
      const last = out[out.length - 1]
      const lastUsed = rowHs.slice(last.start, last.end).reduce((s, x) => s + x, 0)
      if (lastUsed + footerH > budget) out.push({ start: last.end, end: last.end })
    }
    setPages(out)
    // Depend on the STABLE memoized `lines` + `shop` (header/parties height feeds
    // the budget) — never a freshly-derived array (would loop via setPages).
  }, [open, lines, shop])

  // One paginated A4 portrait sheet — shared by the preview and the hidden full doc.
  const renderPage = (pg: Page, i: number) => {
    const isLast = i === pages.length - 1
    return (
      <A4Sheet key={i} orientation="portrait" header={headerBlock} pageNo={i + 1} pageCount={pages.length}>
        <div className="flex h-full flex-col">
          {partiesBlock}
          {/* boxed table fills the leftover height (filler row stretches the
              column dividers to the page bottom); footer sits below on the last page */}
          <div className="flex-1 min-h-0">
            {renderTable(
              lines.slice(pg.start, pg.end).map((l, idx) => (
                <tr key={pg.start + idx}>{rowCells(l, pg.start + idx)}</tr>
              )),
            )}
          </div>
          {isLast ? totalsBlock : null}
          {isLast ? signatureBlock : null}
        </div>
      </A4Sheet>
    )
  }

  return (
    <>
      <ReportPrintDialog
        open={open}
        onOpenChange={onOpenChange}
        orientation="portrait"
        defaultZoom={1}
        title="พิมพ์ใบรับสินค้า"
        pageCount={pages.length || 1}
        renderPreview={(i) => (pages[i] ? renderPage(pages[i], i) : null)}
        renderFullDoc={() => pages.map(renderPage)}
      />

      {/* Hidden specimen — measured for exact block/row heights (off-screen).
          Renders ALL lines once so the measured row heights align 1:1 with the
          pack. Same Sarabun-Print font the sheets/print use. */}
      {open && (
        <div
          ref={measureRef}
          aria-hidden
          className="invisible pointer-events-none"
          style={{ position: 'absolute', left: -10000, top: 0, width: A4P_CONTENT_W, fontFamily: "'Sarabun Print', sans-serif" }}
        >
          {headerBlock}
          {partiesBlock}
          <table className="w-full border-collapse text-sm" style={{ tableLayout: 'fixed' }}>
            {colgroup}
            <thead data-m="thead">{theadRow}</thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} data-m="row">{rowCells(l, i)}</tr>
              ))}
            </tbody>
          </table>
          {totalsBlock}
          {signatureBlock}
        </div>
      )}
    </>
  )
}
