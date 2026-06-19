import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import ReportPrintDialog from '@/pages/Reports/ReportPrintDialog'
import { A4Sheet, A4P_CONTENT_W, A4P_CONTENT_H, FOOTER_H, PACK_SAFETY } from '@/pages/Reports/a4'
import { taxInvoiceSheetParts } from '@/components/receipt/taxInvoiceSheet'
import { printDomSheets } from '@/lib/print/printDomSheets'
import { useToast } from '@/components/ui/toast'
import { getCurrentUserId } from '@/stores/userStore'
import type { SaleForPrint, Setting, TaxInvoice } from '@/types'
import { AlertTriangle } from 'lucide-react'

// One contiguous slice of data rows on a single A4 page.
interface Page { start: number; end: number }

// Read-only tax-invoice issuer (ม.86/4) → A4-portrait print-preview popup
// (React A4Sheet + printDomSheets, same stack as GR/ข.ย.). The buyer comes ONLY
// from the sale's linked customer (or the legal snapshot if one was already
// issued) — NO picker, NO free-text editing (it renders read-only inside the
// preview's ลูกค้า/ผู้ซื้อ box). To change the buyer, reassign the bill's customer
// in SaleDetailDialog. Deferred lock (P0): the on-screen preview uses a TRANSIENT
// record (never issueOrGet); the first successful "ต้นฉบับ" print locks the bill
// via tax.confirmOriginalPrinted, ONLY inside `if (success && !copy)` — a
// cancelled/failed print leaves the bill unlocked.
export function TaxInvoiceBuyerDialog({
  open, onOpenChange, saleId, sale, buyer, onIssued,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  saleId: number | null
  sale: SaleForPrint | null
  /** Buyer pulled from the bill's linked customer — read-only. */
  buyer?: { name?: string; address?: string; taxId?: string; branch?: string }
  /** Fired after a successful issue/print so callers can refresh their list. */
  onIssued?: () => void
}) {
  const { toast } = useToast()
  const [shop, setShop] = useState<Partial<Setting>>({})
  // Resolved buyer = snapshot (if a tax invoice exists) ELSE the bill's customer.
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [taxId, setTaxId] = useState('')
  const [branch, setBranch] = useState('')
  const [alreadyOriginal, setAlreadyOriginal] = useState(false)
  const [pages, setPages] = useState<Page[]>([])
  const measureRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || saleId == null) return
    window.api.settings.getShop().then(d => setShop((d as Setting) ?? {}))
    window.api.tax.get(saleId).then((rec: TaxInvoice | null) => {
      if (rec) {
        // A prior issuance is the legal snapshot — its buyer values win.
        setName(rec.buyer_name)
        setAddress(rec.buyer_address)
        setTaxId(rec.buyer_tax_id)
        setBranch(rec.buyer_branch || 'สำนักงานใหญ่')
        setAlreadyOriginal(rec.original_printed === 1)
      } else {
        setName(buyer?.name ?? '')
        setAddress(buyer?.address ?? '')
        setTaxId(buyer?.taxId ?? '')
        setBranch(buyer?.branch || 'สำนักงานใหญ่')
        setAlreadyOriginal(false)
      }
    })
  }, [open, saleId, buyer])

  // A full tax invoice needs at least a name + address — block printing otherwise.
  const incomplete = !name.trim() || !address.trim()
  // The ต้นฉบับ/สำเนา stamp is known at open (a prior original → this print = สำเนา).
  const copy = alreadyOriginal

  const lines = useMemo(() => sale?.items ?? [], [sale])

  // Transient record for RENDERING only — never persisted, never issued.
  const transient = useMemo<TaxInvoice>(() => ({
    id: 0,
    sale_id: saleId ?? 0,
    doc_no: sale?.invoice_no ?? '',
    buyer_name: name,
    buyer_address: address,
    buyer_tax_id: taxId,
    buyer_branch: branch,
    original_printed: alreadyOriginal ? 1 : 0,
    issued_at: '',
  }), [saleId, sale, name, address, taxId, branch, alreadyOriginal])

  const parts = sale ? taxInvoiceSheetParts({ sale, shop, tax: transient, copy }) : null

  // Measure the hidden specimen, then greedily pack rows into fixed-height
  // portrait pages. Totals = a trailing pseudo-row reserved on the LAST page
  // (spills to a fresh page if the final data page is full) so it can't be
  // clipped by A4Sheet's overflow-hidden. Pre-paint so the preview never flashes.
  useLayoutEffect(() => {
    if (!open || !sale) return
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
    // (amount-words + VAT box + signatures) is LAST page only → reserved as a
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
      const last = out[out.length - 1]
      const lastUsed = rowHs.slice(last.start, last.end).reduce((s, x) => s + x, 0)
      if (lastUsed + footerH > budget) out.push({ start: last.end, end: last.end })
    }
    setPages(out)
    // Deps = stable memoized lines + shop + buyer fields (all feed the measured
    // header/parties/rows). Never a freshly-derived array (would loop via setPages).
  }, [open, sale, lines, shop, name, address, taxId, branch, copy])

  const renderPage = (pg: Page, i: number) => {
    if (!parts) return null
    const isLast = i === pages.length - 1
    return (
      <A4Sheet key={i} orientation="portrait" header={parts.headerBlock} pageNo={i + 1} pageCount={pages.length}>
        <div className="flex h-full flex-col">
          {parts.partiesBlock}
          {/* The boxed table fills the leftover height (filler row stretches the
              column dividers to the page bottom). Totals (last page) + signature
              sit below it. */}
          <div className="flex-1 min-h-0">
            {parts.renderTable(
              lines.slice(pg.start, pg.end).map((it, idx) => (
                <tr key={pg.start + idx}>{parts.rowCells(it, pg.start + idx)}</tr>
              )),
            )}
          </div>
          {isLast ? parts.totalsBlock : null}
          {isLast ? parts.signatureBlock : null}
        </div>
      </A4Sheet>
    )
  }

  // Caller-owned print: issue the snapshot → spool → lock (ต้นฉบับ only). Runs
  // ONLY here (never on open/preview). copy comes from issueOrGet (NOT
  // alreadyOriginal); confirmOriginalPrinted only inside `if (success && !copy)`.
  const handlePrintGuarded = async ({ pages: pageSel, copies }: { pages: number[] | 'all'; copies: number }) => {
    if (!sale || saleId == null || incomplete) return
    try {
      const { copy: isCopy } = await window.api.tax.issueOrGet({
        sale_id: saleId,
        buyer_name: name.trim(),
        buyer_address: address.trim(),
        buyer_tax_id: taxId.trim(),
        buyer_branch: branch.trim(),
        issued_by: getCurrentUserId(),
      }) as { record: TaxInvoice; copy: boolean }
      const ds = (await window.api.settings.getDocumentSettings()) as any
      const res = await printDomSheets({
        docSelector: '.a4-doc',
        pages: pageSel,
        printerName: ds?.printer_name || '',
        copies,
        orientation: 'portrait',
      })
      if (res.success) {
        // Deferred lock — only an ORIGINAL print (!isCopy), only after success.
        if (!isCopy) await window.api.tax.confirmOriginalPrinted(saleId)
        toast({ title: isCopy ? 'พิมพ์ใบกำกับภาษี (สำเนา) แล้ว' : 'พิมพ์ใบกำกับภาษี (ต้นฉบับ) แล้ว', variant: 'success' })
        onIssued?.()
        onOpenChange(false)
      } else {
        toast({ title: 'พิมพ์ไม่สำเร็จ', description: res.error, variant: 'error' })
      }
    } catch (e: any) {
      toast({ title: 'ออกใบกำกับไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    }
  }

  const incompleteWarning = (
    <div className="flex items-center gap-2 text-warning-strong">
      <AlertTriangle className="size-4 shrink-0" />
      <span>ไม่สามารถดำเนินการได้ เนื่องจากข้อมูลลูกค้าไม่ถูกต้อง</span>
    </div>
  )

  return (
    <>
      <ReportPrintDialog
        open={open}
        onOpenChange={onOpenChange}
        orientation="portrait"
        defaultZoom={1}
        title="ใบกำกับภาษี"
        pageCount={pages.length || 1}
        renderPreview={(i) => (parts && pages[i] ? renderPage(pages[i], i) : null)}
        renderFullDoc={() => (parts ? pages.map(renderPage) : null)}
        printLabel={alreadyOriginal ? 'พิมพ์สำเนา' : 'พิมพ์ใบกำกับภาษี'}
        printDisabled={incomplete}
        footerNote={incomplete ? incompleteWarning : undefined}
        onPrint={handlePrintGuarded}
      />

      {/* Hidden specimen — measured for exact block/row heights (off-screen),
          same Sarabun-Print font the sheets/print use. */}
      {open && sale && parts && (
        <div
          ref={measureRef}
          aria-hidden
          className="invisible pointer-events-none"
          style={{ position: 'absolute', left: -10000, top: 0, width: A4P_CONTENT_W, fontFamily: "'Sarabun Print', sans-serif" }}
        >
          {parts.headerBlock}
          {parts.partiesBlock}
          <table className="w-full border-collapse text-sm" style={{ tableLayout: 'fixed' }}>
            {parts.colgroup}
            <thead data-m="thead">{parts.theadRow}</thead>
            <tbody>
              {lines.map((it, i) => (
                <tr key={i} data-m="row">{parts.rowCells(it, i)}</tr>
              ))}
            </tbody>
          </table>
          {parts.totalsBlock}
          {parts.signatureBlock}
        </div>
      )}
    </>
  )
}
