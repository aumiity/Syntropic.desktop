import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react'

interface KhorYor9Row {
  invoice_no: string
  purchase_date: string
  supplier_name: string
  drug_name: string
  lot_number: string
  qty: number
  unit_name: string
}

function formatQty(n: number): string {
  if (n == null || isNaN(n)) return ''
  return n % 1 === 0 ? String(n) : parseFloat(n.toFixed(2)).toString()
}

const HEADERS = [
  'ลำดับที่',
  'วัน เดือน ปี ที่ซื้อ',
  'ชื่อผู้ขาย',
  'ชื่อยา',
  'เลขที่หรืออักษรของครั้งที่ผลิต',
  'จำนวน / ปริมาณ',
  'ลายมือชื่อผู้มีหน้าที่ปฏิบัติการ',
  'หมายเหตุ',
]

// One contiguous slice of data rows on a single page, plus how many empty ruled
// rows to append so the table reaches the page bottom (เติมจนเต็มหน้า).
interface Page9 { start: number; end: number; filler: number }

export default function KhorYor9Page() {
  const { toast } = useToast()
  const { setSummary } = useOutletContext<ReportsOutletContext>()

  // รายงาน ข.ย. ผู้ตรวจดูเป็นรายเดือนเท่านั้น → ล็อกตัวเลือกวันที่ไว้ที่โหมด 'month'
  const [dateMode, setDateMode] = useState<MultiDateMode>('month')
  const [dateFrom, setDateFrom] = useState(() => rangeForMultiMode('month').from)
  const [dateTo, setDateTo] = useState(() => rangeForMultiMode('month').to)
  const [rows, setRows] = useState<KhorYor9Row[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [shopName, setShopName] = useState('')
  const [pages, setPages] = useState<Page9[]>([])
  const [pageInput, setPageInput] = useState('')   // "" = ทุกหน้า; เช่น "1-3,5"
  const [viewPage, setViewPage] = useState(1)      // 1-based page shown in the preview
  const [printRender, setPrintRender] = useState(false) // mount the full hidden .a4-doc only while printing

  const measureRef = useRef<HTMLDivElement>(null)

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
      .khorYor9({ date_from: dateFrom, date_to: dateTo })
      .then((data: KhorYor9Row[]) => {
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
  }, [dateFrom, dateTo, toast])

  const isEmpty = !loading && rows && rows.length === 0
  const displayRows = rows ?? []

  // Silent-print to the configured A4 printer (Settings → เครื่องพิมพ์ → เอกสาร A4).
  // The preview keeps only the viewed sheet mounted, so printing first mounts a
  // hidden FULL .a4-doc (printRender) and the effect below prints it once it's
  // committed to the DOM, then unmounts it.
  const handlePrint = () => {
    if (loading || pages.length === 0) return
    setPrintRender(true)
  }

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

  // Measure real row/header heights from the hidden specimen, then greedily pack
  // rows into fixed-height A4 pages. Runs before paint (useLayoutEffect) so the
  // visible sheets never flash an un-paginated state.
  useLayoutEffect(() => {
    if (loading) return
    const root = measureRef.current
    if (!root) return
    const headerH = (root.querySelector('[data-m="header"]') as HTMLElement)?.offsetHeight ?? 0
    const theadH = (root.querySelector('[data-m="thead"]') as HTMLElement)?.offsetHeight ?? 0
    const fillerH = (root.querySelector('[data-m="filler"]') as HTMLElement)?.offsetHeight ?? 33
    const rowEls = Array.from(root.querySelectorAll('[data-m="row"]')) as HTMLElement[]
    const rowHs = rowEls.map(e => e.offsetHeight)

    const avail = A4_CONTENT_H - headerH - FOOTER_H - theadH - PACK_SAFETY
    const out: Page9[] = []

    if (rowHs.length === 0) {
      out.push({ start: 0, end: 0, filler: Math.max(0, Math.floor(avail / fillerH)) })
    } else {
      let i = 0
      while (i < rowHs.length) {
        let used = 0
        const start = i
        while (i < rowHs.length && used + rowHs[i] <= avail) { used += rowHs[i]; i++ }
        if (i === start) { used += rowHs[i]; i++ } // a single over-tall row: place it anyway
        out.push({ start, end: i, filler: Math.max(0, Math.floor((avail - used) / fillerH)) })
      }
    }
    setPages(out)
    // Depend on `rows` (stable state ref), NOT `displayRows` (a fresh [] each
    // render) — otherwise setPages re-renders → new displayRows → effect → loop.
  }, [loading, rows, shopName])

  const headerBlock = (
    <div data-m="header" className="relative pb-4">
      <span className="absolute right-0 top-0 text-sm whitespace-nowrap">แบบ ข.ย. ๙</span>
      <h1 className="text-xl font-semibold text-center pt-1">บัญชีการซื้อยา</h1>
      <div className="mt-3 text-center text-sm">
        <span className="inline-block min-w-[480px] border-b border-dotted border-foreground/60 pb-0.5">
          {shopName || ' '}
        </span>
        <div className="text-foreground-subtle mt-1">(ชื่อสถานที่ขายยา)</div>
      </div>
    </div>
  )

  const colgroup = (
    <colgroup>
      <col style={{ width: '6%' }} />
      <col style={{ width: '12%' }} />
      <col style={{ width: '16%' }} />
      <col style={{ width: '20%' }} />
      <col style={{ width: '13%' }} />
      <col style={{ width: '11%' }} />
      <col style={{ width: '14%' }} />
      <col style={{ width: '8%' }} />
    </colgroup>
  )

  const theadRow = (
    <tr>
      {HEADERS.map((h) => (
        <th key={h} className="border border-foreground/80 px-2 py-2 text-sm font-semibold text-center align-middle bg-card">
          {h}
        </th>
      ))}
    </tr>
  )

  const dataRow = (r: KhorYor9Row, idx: number) => (
    <tr key={`${r.invoice_no}-${idx}`}>
      <td className="border border-foreground/80 px-2 py-1 text-center">{idx + 1}</td>
      <td className="border border-foreground/80 px-2 py-1 text-center">{formatThaiShortBE(r.purchase_date)}</td>
      <td className="border border-foreground/80 px-2 py-1">{r.supplier_name}</td>
      <td className="border border-foreground/80 px-2 py-1">{r.drug_name}</td>
      <td className="border border-foreground/80 px-2 py-1">{r.lot_number}</td>
      <td className="border border-foreground/80 px-2 py-1 text-center">
        {formatQty(r.qty)}{r.unit_name ? ` ${r.unit_name}` : ''}
      </td>
      <td className="border border-foreground/80 px-2 py-1"></td>
      <td className="border border-foreground/80 px-2 py-1"></td>
    </tr>
  )

  const fillerRow = (key: string | number) => (
    <tr key={key}>
      {Array.from({ length: 8 }).map((_, j) => (
        <td key={j} className="border border-foreground/80 px-2 py-1 h-8"></td>
      ))}
    </tr>
  )

  // One paginated A4 sheet — shared by the single-page preview and the hidden
  // full-document render used for printing.
  const renderPage = (pg: Page9, pi: number) => (
    <A4Sheet key={pi} header={headerBlock} pageNo={pi + 1} pageCount={pages.length}>
      <table className="w-full border-collapse text-sm" style={{ tableLayout: 'fixed' }}>
        {colgroup}
        <thead>{theadRow}</thead>
        <tbody>
          {displayRows.slice(pg.start, pg.end).map((r, idx) => dataRow(r, pg.start + idx))}
          {Array.from({ length: pg.filler }).map((_, i) => fillerRow(`f-${i}`))}
        </tbody>
      </table>
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
                <table className="w-full border-collapse text-sm" style={{ tableLayout: 'fixed' }}>
                  {colgroup}
                  <thead>{theadRow}</thead>
                  <tbody>
                    {Array.from({ length: 16 }).map((_, i) => (
                      <tr key={`sk-${i}`}>
                        {Array.from({ length: 8 }).map((__, j) => (
                          <td key={j} className="border border-foreground/80 px-2 py-1 h-8">
                            <div className="h-3 rounded bg-muted/60 animate-pulse" />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </A4Sheet>
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
          {pages.map(renderPage)}
        </div>
      )}

      {/* Hidden specimen — measured for exact row/header heights (kept off-screen) */}
      <div
        ref={measureRef}
        aria-hidden
        className="a4-measure invisible pointer-events-none"
        // Measure in the SAME font the sheets/print use (Sarabun) so row heights match.
        style={{ position: 'absolute', left: -10000, top: 0, width: A4_CONTENT_W, fontFamily: "'Sarabun Print', sans-serif" }}
      >
        {headerBlock}
        <table className="w-full border-collapse text-sm" style={{ tableLayout: 'fixed' }}>
          {colgroup}
          <thead data-m="thead">{theadRow}</thead>
          <tbody>
            {displayRows.map((r, i) => (
              <tr key={i} data-m="row">
                <td className="border border-foreground/80 px-2 py-1 text-center">{i + 1}</td>
                <td className="border border-foreground/80 px-2 py-1 text-center">{formatThaiShortBE(r.purchase_date)}</td>
                <td className="border border-foreground/80 px-2 py-1">{r.supplier_name}</td>
                <td className="border border-foreground/80 px-2 py-1">{r.drug_name}</td>
                <td className="border border-foreground/80 px-2 py-1">{r.lot_number}</td>
                <td className="border border-foreground/80 px-2 py-1 text-center">
                  {formatQty(r.qty)}{r.unit_name ? ` ${r.unit_name}` : ''}
                </td>
                <td className="border border-foreground/80 px-2 py-1"></td>
                <td className="border border-foreground/80 px-2 py-1"></td>
              </tr>
            ))}
            <tr data-m="filler">
              {Array.from({ length: 8 }).map((_, j) => (
                <td key={j} className="border border-foreground/80 px-2 py-1 h-8"></td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
