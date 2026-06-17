import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SectionCard } from '@/components/ui/card'
import { MultiDatePicker, type MultiDateMode, rangeForMultiMode } from '@/components/ui/multi-date-picker'
import { useToast } from '@/components/ui/toast'
import { formatThaiShortBE } from '@/lib/thaiDate'
import { printDomSheets, parsePageSelection } from '@/lib/print/printDomSheets'
import type { Setting } from '@/types'
import type { ReportsOutletContext } from './index'
import { A4Sheet, A4_CONTENT_W, A4_CONTENT_H, FOOTER_H, PACK_SAFETY } from './a4'
import { ChevronLeft, ChevronRight, Printer, FileText } from 'lucide-react'

interface SaleLedgerRow {
  lot_id: number | null
  product_id: number
  drug_name: string
  supplier_name: string
  lot_number: string
  qty_received: number
  lot_received_date: string | null
  sold_at: string
  qty: number
  unit_name: string
  customer_code: string | null
  customer_full_name: string
  customer_name_free: string
}

interface KhorYorSaleLedgerProps {
  formCode: string
  title: string
  flag: 10 | 11
}

interface LotSection { key: string; head: SaleLedgerRow; rows: SaleLedgerRow[] }

// One lot section's rows [rowStart, rowEnd) placed on a page. `continued` repeats
// the lot header with "(ต่อ)" when a section spills onto a new page.
interface Chunk { si: number; rowStart: number; rowEnd: number; continued: boolean }
interface PageL { chunks: Chunk[]; used: number; filler: number }

// Vertical spacing (px) that the render applies, mirrored in the packing math so a
// page can never be planned tighter than it actually renders.
const GAP_BETWEEN_SECTIONS = 24   // mt-6 between two lot sections on the same page
const GAP_LOTHEAD_TO_TABLE = 12   // mt-3 from the lot header to its sale table
const BODY_TOP = 8                // mt-2 above the first section on every page

function formatQty(n: number): string {
  if (n == null || isNaN(n)) return ''
  return n % 1 === 0 ? String(n) : parseFloat(n.toFixed(2)).toString()
}

const HEADERS = [
  'ลำดับที่',
  'วัน เดือน ปี ที่ขาย',
  'จำนวน / ปริมาณที่ขาย',
  'ชื่อ - สกุล ผู้ซื้อ',
  'ลายมือชื่อผู้มีหน้าที่ปฏิบัติการ',
  'หมายเหตุ',
]

export default function KhorYorSaleLedger({ formCode, title, flag }: KhorYorSaleLedgerProps) {
  const { toast } = useToast()
  const { setSummary } = useOutletContext<ReportsOutletContext>()

  // รายงาน ข.ย. ผู้ตรวจดูเป็นรายเดือนเท่านั้น → ล็อกตัวเลือกวันที่ไว้ที่โหมด 'month'
  const [dateMode, setDateMode] = useState<MultiDateMode>('month')
  const [dateFrom, setDateFrom] = useState(() => rangeForMultiMode('month').from)
  const [dateTo, setDateTo] = useState(() => rangeForMultiMode('month').to)
  const [rows, setRows] = useState<SaleLedgerRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [shopName, setShopName] = useState('')
  const [pages, setPages] = useState<PageL[]>([])
  const [pageInput, setPageInput] = useState('')   // "" = ทุกหน้า; เช่น "1-3,5"
  const [viewPage, setViewPage] = useState(1)      // 1-based page shown in the preview
  const [printRender, setPrintRender] = useState(false) // mount the full hidden .a4-doc only while printing
  const [blankRender, setBlankRender] = useState(false) // mount the hidden .a4-blank only while printing a blank form

  const measureRef = useRef<HTMLDivElement>(null)
  // Heights measured from the specimen — reused to fill a blank form to the page bottom.
  const metricsRef = useRef({ headerH: 0, saleHeadH: 0, fillerH: 33, blankLotHeadH: 90 })

  useEffect(() => { setSummary(null) }, [setSummary])
  // New data / re-pagination → jump back to the first page.
  useEffect(() => { setViewPage(1) }, [pages])

  useEffect(() => {
    (window.api.settings as any).getShop().then((data: Setting | null) => {
      setShopName(data?.shop_name ?? '')
    }).catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(window.api.reports as any)
      .khorYorSale({ form: flag, date_from: dateFrom, date_to: dateTo })
      .then((data: SaleLedgerRow[]) => {
        if (cancelled) return
        setRows(data)
        setLoading(false)
      })
      .catch((err: any) => {
        if (cancelled) return
        toast({ title: 'โหลดรายงานไม่สำเร็จ', description: String(err?.message ?? err), variant: 'destructive' })
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [dateFrom, dateTo, flag, toast])

  const isEmpty = !loading && rows && rows.length === 0

  // Silent-print to the configured A4 printer (Settings → เครื่องพิมพ์ → เอกสาร A4).
  // The preview keeps only the viewed sheet mounted, so printing first mounts a
  // hidden FULL .a4-doc (printRender) and the effect below prints it once it's
  // committed to the DOM, then unmounts it.
  const handlePrint = () => {
    if (loading || pages.length === 0) return
    setPrintRender(true)
  }

  // Print a BLANK form (one ruled page: blank lot header + empty sale rows) to fill by hand.
  const handlePrintBlank = () => {
    if (loading) return
    setBlankRender(true)
  }

  // Empty sale rows that fill one blank page to the bottom (from measured heights).
  const blankFillerCount = () => {
    const m = metricsRef.current
    const avail = A4_CONTENT_H - m.headerH - FOOTER_H - BODY_TOP - PACK_SAFETY
      - m.blankLotHeadH - GAP_LOTHEAD_TO_TABLE - m.saleHeadH
    return Math.max(1, Math.floor(avail / (m.fillerH || 33)))
  }

  useEffect(() => {
    if (!blankRender) return
    let cancelled = false
    ;(async () => {
      try {
        const ds = (await window.api.settings.getDocumentSettings()) as any
        const res = await printDomSheets({
          docSelector: '.a4-blank',
          pages: 'all',
          printerName: ds?.printer_name || '',
          copies: Math.max(1, Number(ds?.copies) || 1),
        })
        if (cancelled) return
        if (res.success) toast({ title: 'ส่งฟอร์มเปล่าไปยังเครื่องพิมพ์แล้ว', variant: 'success' })
        else if (res.error) toast({ title: 'พิมพ์ไม่สำเร็จ', description: res.error, variant: 'destructive' })
      } finally {
        if (!cancelled) setBlankRender(false)
      }
    })()
    return () => { cancelled = true }
  }, [blankRender, toast])

  useEffect(() => {
    if (!printRender) return
    let cancelled = false
    ;(async () => {
      try {
        const ds = (await window.api.settings.getDocumentSettings()) as any
        const res = await printDomSheets({
          docSelector: '.a4-doc',
          pages: parsePageSelection(pageInput, pages.length),
          printerName: ds?.printer_name || '',
          copies: Math.max(1, Number(ds?.copies) || 1),
        })
        if (cancelled) return
        if (res.success) toast({ title: 'ส่งไปยังเครื่องพิมพ์แล้ว', variant: 'success' })
        else if (res.error) toast({ title: 'พิมพ์ไม่สำเร็จ', description: res.error, variant: 'destructive' })
      } finally {
        if (!cancelled) setPrintRender(false)
      }
    })()
    return () => { cancelled = true }
  }, [printRender, pageInput, pages.length, toast])

  // Group lot-cut rows into per-lot sections — one header block + its sale rows.
  // Keyed on `rows` (stable state ref) so `sections` only changes on real data
  // changes — feeding the pagination effect a stable dep (no setPages loop).
  const sections = useMemo<LotSection[]>(() => {
    const map = new Map<string, LotSection>()
    for (const r of rows ?? []) {
      const key = r.lot_id != null ? `L${r.lot_id}` : `P${r.product_id}:${r.lot_number}`
      if (!map.has(key)) map.set(key, { key, head: r, rows: [] })
      map.get(key)!.rows.push(r)
    }
    return Array.from(map.values())
  }, [rows])

  // Measure real heights from the hidden specimen, then pack lot sections into
  // fixed-height A4 pages — splitting a long section across pages and repeating
  // its lot header. Runs before paint so the sheets never flash unpaginated.
  useLayoutEffect(() => {
    if (loading) return
    const root = measureRef.current
    if (!root) return
    const headerH = (root.querySelector('[data-m="header"]') as HTMLElement)?.offsetHeight ?? 0
    const saleHeadH = (root.querySelector('[data-m="salehead"]') as HTMLElement)?.offsetHeight ?? 0
    const fillerH = (root.querySelector('[data-m="filler"]') as HTMLElement)?.offsetHeight ?? 33
    metricsRef.current = {
      headerH, saleHeadH, fillerH,
      blankLotHeadH: (root.querySelector('[data-m="blanklothead"]') as HTMLElement)?.offsetHeight ?? 90,
    }

    const avail = A4_CONTENT_H - headerH - FOOTER_H - BODY_TOP - PACK_SAFETY
    const out: PageL[] = []
    let cur: PageL = { chunks: [], used: 0, filler: 0 }
    const flush = () => { out.push(cur); cur = { chunks: [], used: 0, filler: 0 } }

    sections.forEach((sec, si) => {
      const lotH = (root.querySelector(`[data-m="lothead"][data-si="${si}"]`) as HTMLElement)?.offsetHeight ?? 0
      const rowHs = sec.rows.map((_, ri) =>
        (root.querySelector(`[data-m="srow"][data-si="${si}"][data-ri="${ri}"]`) as HTMLElement)?.offsetHeight ?? fillerH)
      const overheadBase = lotH + GAP_LOTHEAD_TO_TABLE + saleHeadH

      let ri = 0
      let first = true
      do {
        let gap = cur.chunks.length > 0 ? GAP_BETWEEN_SECTIONS : 0
        const minRowH = rowHs.length > 0 ? rowHs[ri] : fillerH
        // Not enough room for this section's header + first row on the current
        // page → start a fresh page (only if the page already has content).
        if (cur.chunks.length > 0 && cur.used + gap + overheadBase + minRowH > avail) {
          flush(); gap = 0
        }
        cur.used += gap + overheadBase
        const rs = ri
        while (ri < rowHs.length && cur.used + rowHs[ri] <= avail) { cur.used += rowHs[ri]; ri++ }
        if (ri === rs && ri < rowHs.length) { cur.used += rowHs[ri]; ri++ } // over-tall row guard
        cur.chunks.push({ si, rowStart: rs, rowEnd: ri, continued: !first })
        first = false
        if (ri < rowHs.length) flush()  // rows remain → continue on a new page
      } while (ri < rowHs.length)
    })
    if (cur.chunks.length > 0 || out.length === 0) out.push(cur)
    for (const pg of out) pg.filler = Math.max(0, Math.floor((avail - pg.used) / fillerH))
    setPages(out)
  }, [loading, sections, shopName])

  const headerBlock = (
    <div data-m="header" className="relative pb-1">
      <span className="absolute right-0 top-0 text-sm whitespace-nowrap">แบบ {formCode}</span>
      <h1 className="text-xl font-semibold text-center pt-1">{title}</h1>
      <div className="mt-3 text-center text-sm">
        <span className="inline-block min-w-[480px] border-b border-dotted border-foreground/60 pb-0.5">
          {shopName || ' '}
        </span>
        <div className="text-foreground-subtle mt-1">(ชื่อสถานที่ขายยา)</div>
      </div>
    </div>
  )

  const lotHeaderInner = (head: SaleLedgerRow, continued: boolean) => (
    <div className="text-sm space-y-1 pb-2 border-b border-dotted border-foreground/60">
      <div>
        <span className="text-foreground-subtle">ชื่อยา</span>{' '}
        <span className="font-medium">{head.drug_name}</span>
        {continued && <span className="text-foreground-subtle"> (ต่อ)</span>}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <span>
          <span className="text-foreground-subtle">ชื่อผู้ผลิต / ผู้นำเข้า</span>{' '}
          <span className="inline-block min-w-[140px] border-b border-dotted border-foreground/60">&nbsp;</span>
        </span>
        <span>
          <span className="text-foreground-subtle">เลขที่หรืออักษรของครั้งที่ผลิต</span>{' '}
          <span className="font-medium">{head.lot_number || ' '}</span>
        </span>
        <span>
          <span className="text-foreground-subtle">ขนาดบรรจุ</span>{' '}
          <span className="inline-block min-w-[100px] border-b border-dotted border-foreground/60">&nbsp;</span>
        </span>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <span>
          <span className="text-foreground-subtle">ได้มาจาก</span>{' '}
          <span className="font-medium">{head.supplier_name || ' '}</span>
        </span>
        <span>
          <span className="text-foreground-subtle">จำนวนรับ</span>{' '}
          <span className="font-medium">{formatQty(head.qty_received)}{head.unit_name ? ` ${head.unit_name}` : ''}</span>
        </span>
        <span>
          <span className="text-foreground-subtle">วันที่รับ</span>{' '}
          <span className="font-medium">{formatThaiShortBE(head.lot_received_date)}</span>
        </span>
      </div>
    </div>
  )

  // Blank lot-header block — every fill-in field is a dotted line (for ฟอร์มเปล่า).
  const blankLotHeader = (
    <div className="text-sm space-y-1 pb-2 border-b border-dotted border-foreground/60">
      <div>
        <span className="text-foreground-subtle">ชื่อยา</span>{' '}
        <span className="inline-block min-w-[320px] border-b border-dotted border-foreground/60">&nbsp;</span>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <span><span className="text-foreground-subtle">ชื่อผู้ผลิต / ผู้นำเข้า</span>{' '}<span className="inline-block min-w-[140px] border-b border-dotted border-foreground/60">&nbsp;</span></span>
        <span><span className="text-foreground-subtle">เลขที่หรืออักษรของครั้งที่ผลิต</span>{' '}<span className="inline-block min-w-[120px] border-b border-dotted border-foreground/60">&nbsp;</span></span>
        <span><span className="text-foreground-subtle">ขนาดบรรจุ</span>{' '}<span className="inline-block min-w-[100px] border-b border-dotted border-foreground/60">&nbsp;</span></span>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <span><span className="text-foreground-subtle">ได้มาจาก</span>{' '}<span className="inline-block min-w-[160px] border-b border-dotted border-foreground/60">&nbsp;</span></span>
        <span><span className="text-foreground-subtle">จำนวนรับ</span>{' '}<span className="inline-block min-w-[100px] border-b border-dotted border-foreground/60">&nbsp;</span></span>
        <span><span className="text-foreground-subtle">วันที่รับ</span>{' '}<span className="inline-block min-w-[120px] border-b border-dotted border-foreground/60">&nbsp;</span></span>
      </div>
    </div>
  )

  const saleColgroup = (
    <colgroup>
      <col style={{ width: '7%' }} />
      <col style={{ width: '16%' }} />
      <col style={{ width: '15%' }} />
      <col style={{ width: '24%' }} />
      <col style={{ width: '24%' }} />
      <col style={{ width: '14%' }} />
    </colgroup>
  )

  const saleTheadRow = (
    <tr>
      {HEADERS.map((h) => (
        <th key={h} className="border border-foreground/80 px-2 py-2 text-sm font-semibold text-center align-middle bg-card">
          {h}
        </th>
      ))}
    </tr>
  )

  const buyerOf = (r: SaleLedgerRow) =>
    r.customer_code === 'C0000' ? (r.customer_name_free || '') : r.customer_full_name

  const saleDataRow = (r: SaleLedgerRow, num: number, key: string | number) => (
    <tr key={key}>
      <td className="border border-foreground/80 px-2 py-1 text-center">{num}</td>
      <td className="border border-foreground/80 px-2 py-1 text-center">{formatThaiShortBE(r.sold_at)}</td>
      <td className="border border-foreground/80 px-2 py-1 text-center">
        {formatQty(r.qty)}{r.unit_name ? ` ${r.unit_name}` : ''}
      </td>
      <td className="border border-foreground/80 px-2 py-1">{buyerOf(r)}</td>
      <td className="border border-foreground/80 px-2 py-1"></td>
      <td className="border border-foreground/80 px-2 py-1"></td>
    </tr>
  )

  const fillerRow = (key: string | number) => (
    <tr key={key}>
      {Array.from({ length: 6 }).map((_, j) => (
        <td key={j} className="border border-foreground/80 px-2 py-1 h-8"></td>
      ))}
    </tr>
  )

  // One paginated A4 sheet (lot sections + their sale rows) — shared by the
  // single-page preview and the hidden full-document render used for printing.
  const renderPage = (pg: PageL, pi: number) => (
    <A4Sheet key={pi} header={headerBlock} pageNo={pi + 1} pageCount={pages.length}>
      {pg.chunks.map((c, ci) => {
        const sec = sections[c.si]
        const isLast = ci === pg.chunks.length - 1
        return (
          <div key={ci} className={ci === 0 ? 'mt-2' : 'mt-6'}>
            {lotHeaderInner(sec.head, c.continued)}
            <table className="mt-3 w-full border-collapse text-sm" style={{ tableLayout: 'fixed' }}>
              {saleColgroup}
              <thead>{saleTheadRow}</thead>
              <tbody>
                {sec.rows.slice(c.rowStart, c.rowEnd).map((r, idx) =>
                  saleDataRow(r, c.rowStart + idx + 1, `${c.si}-${c.rowStart + idx}`))}
                {isLast && Array.from({ length: pg.filler }).map((_, i) => fillerRow(`f-${i}`))}
              </tbody>
            </table>
          </div>
        )
      })}
    </A4Sheet>
  )

  // Diagonal strike (bottom-left → top-right) + centered message over a table —
  // the FDA-required marking for a month with no entries.
  const diagonalOverlay = (message: string) => (
    <div className="absolute inset-0 pointer-events-none text-foreground">
      <svg width="100%" height="100%" className="block">
        <line x1="0" y1="100%" x2="100%" y2="0" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="px-4 py-1 text-lg font-semibold bg-card">{message}</span>
      </div>
    </div>
  )

  // Empty-month sheet: the blank ruled form, its sale table struck through + message.
  const renderEmptySheet = () => (
    <A4Sheet header={headerBlock} pageNo={1} pageCount={1}>
      <div className="mt-2">
        {blankLotHeader}
        <div className="relative mt-3">
          <table className="w-full border-collapse text-sm" style={{ tableLayout: 'fixed' }}>
            {saleColgroup}
            <thead>{saleTheadRow}</thead>
            <tbody>
              {Array.from({ length: blankFillerCount() }).map((_, i) => fillerRow(`e-${i}`))}
            </tbody>
          </table>
          {diagonalOverlay('ไม่มีรายการขายยาในเดือนนี้')}
        </div>
      </div>
    </A4Sheet>
  )

  return (
    <div className="flex flex-1 flex-col min-h-0 gap-3">
      {/* Filter strip — hidden when printing */}
      <div className="no-print h-12 flex items-center justify-end gap-2 shrink-0">
        <MultiDatePicker
          mode={dateMode}
          from={dateFrom}
          to={dateTo}
          onChange={(m, f, t) => { setDateMode(m); setDateFrom(f); setDateTo(t) }}
          allowedModes={['month']}
          className="shrink-0"
        />
      </div>

      {/* Paged A4 preview — also the print surface (one .a4-sheet = one page).
          Frame + header-right print controls mirror the Settings document-preview
          card (DocumentSettingsTab → SectionCard "ตัวอย่างเอกสาร"). */}
      <SectionCard
        title="ตัวอย่างเอกสาร"
        tint="success"
        fill
        className="flex-1 min-h-0"
        right={
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground shrink-0">หน้า</span>
            <Input
              value={pageInput}
              onChange={e => setPageInput(e.target.value)}
              placeholder={pages.length > 1 ? `ทุกหน้า (1-${pages.length})` : 'ทุกหน้า'}
              className="h-9 w-36 shrink-0"
            />
            <Button className="h-9" onClick={handlePrintBlank} disabled={loading} variant="elevated">
              <FileText className="size-4" /> ฟอร์มเปล่า
            </Button>
            <Button className="h-9" onClick={handlePrint} disabled={loading || pages.length === 0} variant="elevated">
              <Printer className="size-4" /> พิมพ์
            </Button>
          </div>
        }
      >
        <div className="h-full flex flex-col gap-3">
          {/* Viewer — ONE page at a time (no long stacked scroll). */}
          <div className="flex-1 min-h-0 overflow-auto bg-muted/30 rounded-lg p-6 [scrollbar-gutter:stable]">
            {loading ? (
              <A4Sheet header={headerBlock} pageNo={1} pageCount={1}>
                <div className="mt-6">
                  <div className="space-y-2 pb-3 border-b border-dotted border-foreground/60">
                    {Array.from({ length: 3 }).map((_, li) => (
                      <div key={li} className="h-3 rounded bg-muted/60 animate-pulse" style={{ width: `${60 + li * 10}%` }} />
                    ))}
                  </div>
                  <table className="mt-3 w-full border-collapse text-sm" style={{ tableLayout: 'fixed' }}>
                    {saleColgroup}
                    <tbody>
                      {Array.from({ length: 10 }).map((_, i) => (
                        <tr key={i}>
                          {Array.from({ length: 6 }).map((__, j) => (
                            <td key={j} className="border border-foreground/80 px-2 py-1 h-8">
                              <div className="h-3 rounded bg-muted/60 animate-pulse" />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </A4Sheet>
            ) : sections.length === 0 ? (
              renderEmptySheet()
            ) : pages[viewPage - 1] ? (
              renderPage(pages[viewPage - 1], viewPage - 1)
            ) : null}
          </div>

          {/* Page navigation — only when there is more than one page. */}
          {!loading && pages.length > 1 && (
            <div className="shrink-0 flex items-center justify-center gap-3">
              <Button
                variant="elevated" size="icon-lg" className="h-9 w-9 p-0"
                onClick={() => setViewPage(p => Math.max(1, p - 1))}
                disabled={viewPage <= 1} tooltip="หน้าก่อนหน้า"
              >
                <ChevronLeft />
              </Button>
              <span className="text-sm text-muted-foreground select-none">หน้า {viewPage} / {pages.length}</span>
              <Button
                variant="elevated" size="icon-lg" className="h-9 w-9 p-0"
                onClick={() => setViewPage(p => Math.min(pages.length, p + 1))}
                disabled={viewPage >= pages.length} tooltip="หน้าถัดไป"
              >
                <ChevronRight />
              </Button>
            </div>
          )}
        </div>
      </SectionCard>

      {/* Hidden FULL-document render — mounted only while printing so the print
          path (printDomSheets clones .a4-sheet from the live DOM) still emits every
          page even though the preview shows just one. Off-screen but laid out, so
          the baked computed styles stay correct. */}
      {printRender && !loading && (
        <div className="a4-doc" aria-hidden style={{ position: 'absolute', left: -100000, top: 0 }}>
          {sections.length === 0 ? (
            renderEmptySheet()
          ) : (
            pages.map(renderPage)
          )}
        </div>
      )}

      {/* Hidden BLANK form — one ruled page (blank lot header + empty sale rows). */}
      {blankRender && (
        <div className="a4-blank" aria-hidden style={{ position: 'absolute', left: -100000, top: 0 }}>
          <A4Sheet header={headerBlock} pageNo={1} pageCount={1}>
            <div className="mt-2">
              {blankLotHeader}
              <table className="mt-3 w-full border-collapse text-sm" style={{ tableLayout: 'fixed' }}>
                {saleColgroup}
                <thead>{saleTheadRow}</thead>
                <tbody>
                  {Array.from({ length: blankFillerCount() }).map((_, i) => fillerRow(`b-${i}`))}
                </tbody>
              </table>
            </div>
          </A4Sheet>
        </div>
      )}

      {/* Hidden specimen — measured for exact lot-header / row / table-header heights */}
      <div
        ref={measureRef}
        aria-hidden
        className="a4-measure invisible pointer-events-none"
        // Measure in the SAME font the sheets/print use (Sarabun) so row heights match.
        style={{ position: 'absolute', left: -10000, top: 0, width: A4_CONTENT_W, fontFamily: "'Sarabun Print', sans-serif" }}
      >
        {headerBlock}
        {/* salehead + filler reference */}
        <table className="w-full border-collapse text-sm" style={{ tableLayout: 'fixed' }}>
          {saleColgroup}
          <thead data-m="salehead">{saleTheadRow}</thead>
          <tbody>
            <tr data-m="filler">
              {Array.from({ length: 6 }).map((_, j) => (
                <td key={j} className="border border-foreground/80 px-2 py-1 h-8"></td>
              ))}
            </tr>
          </tbody>
        </table>
        {/* blank lot-header reference — height used to fill the blank form */}
        <div data-m="blanklothead">{blankLotHeader}</div>
        {sections.map((sec, si) => (
          <div key={sec.key}>
            <div data-m="lothead" data-si={si}>{lotHeaderInner(sec.head, false)}</div>
            <table className="w-full border-collapse text-sm" style={{ tableLayout: 'fixed' }}>
              {saleColgroup}
              <tbody>
                {sec.rows.map((r, ri) => (
                  <tr key={ri} data-m="srow" data-si={si} data-ri={ri}>
                    <td className="border border-foreground/80 px-2 py-1 text-center">{ri + 1}</td>
                    <td className="border border-foreground/80 px-2 py-1 text-center">{formatThaiShortBE(r.sold_at)}</td>
                    <td className="border border-foreground/80 px-2 py-1 text-center">
                      {formatQty(r.qty)}{r.unit_name ? ` ${r.unit_name}` : ''}
                    </td>
                    <td className="border border-foreground/80 px-2 py-1">{buyerOf(r)}</td>
                    <td className="border border-foreground/80 px-2 py-1"></td>
                    <td className="border border-foreground/80 px-2 py-1"></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  )
}
