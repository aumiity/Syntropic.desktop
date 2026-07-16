import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverTrigger, PopoverContent, PopoverHeader, PopoverTitle } from '@/components/ui/popover'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Pagination, type PageSize } from '@/components/ui/pagination'
import { TintIcon } from '@/components/ui/tint-icon'
import { MultiDatePicker, type MultiDateMode, rangeForMultiMode } from '@/components/ui/multi-date-picker'
import { useToast } from '@/components/ui/toast'
import { formatThaiShortBE } from '@/lib/thaiDate'
import { formatDate } from '@/lib/utils'
import { printDomSheets } from '@/lib/print/printDomSheets'
import type { Setting } from '@/types'
import type { FdaOutletContext } from './FdaReports'
import { A4Sheet, A4_CONTENT_W, A4_CONTENT_H, FOOTER_H, PACK_SAFETY } from './a4'
import ReportPrintDialog from './ReportPrintDialog'
import { FileText, Printer, Filter } from 'lucide-react'

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
  const { setSummary, setActions } = useOutletContext<FdaOutletContext>()

  // รายงาน ข.ย. ผู้ตรวจดูเป็นรายเดือนเท่านั้น → ล็อกตัวเลือกวันที่ไว้ที่โหมด 'month'
  const [dateMode, setDateMode] = useState<MultiDateMode>('month')
  const [dateFrom, setDateFrom] = useState(() => rangeForMultiMode('month').from)
  const [dateTo, setDateTo] = useState(() => rangeForMultiMode('month').to)
  const [rows, setRows] = useState<KhorYor9Row[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [shopName, setShopName] = useState('')
  const [pages, setPages] = useState<Page9[]>([])
  const [blankRender, setBlankRender] = useState(false) // mount the hidden .a4-blank only while printing a blank form
  const [printOpen, setPrintOpen] = useState(false)      // print preview/settings modal

  // Supplier exclusion — transient (reset whenever the month/rows change). The
  // only filter on ข.ย.๙: unchecking a supplier drops all its rows from print.
  const [excludedSuppliers, setExcludedSuppliers] = useState<Set<string>>(new Set())
  const [supplierSearch, setSupplierSearch] = useState('')

  // On-screen table pagination (client-side; independent of the A4 print pagination).
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSize>(50)

  const measureRef = useRef<HTMLDivElement>(null)
  // Heights measured from the specimen — reused to fill a blank form to the page bottom.
  const metricsRef = useRef({ headerH: 0, theadH: 0, fillerH: 33 })

  useEffect(() => { setSummary(null) }, [setSummary])

  // Mount this report's print actions on the FDA sub-tab line (h-10).
  useEffect(() => {
    setActions(
      <>
        <Button size="lg" variant="elevated" className="h-10" disabled={loading} onClick={() => setBlankRender(true)}>
          <FileText className="size-4" /> ฟอร์มเปล่า
        </Button>
        <Button size="lg" variant="default" className="h-10" disabled={loading} onClick={() => setPrintOpen(true)}>
          <Printer className="size-4" /> พิมพ์
        </Button>
      </>
    )
    return () => setActions(null)
  }, [loading, setActions])

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

  // New data (new month) → clear the transient supplier exclusions.
  useEffect(() => { setExcludedSuppliers(new Set()) }, [rows])

  // Jump back to page 1 whenever the data / filter / page size changes.
  useEffect(() => { setPage(1) }, [rows, excludedSuppliers, pageSize])

  const isEmpty = !loading && rows && rows.length === 0
  const total = rows?.length ?? 0

  // Rows that will actually print — everything whose supplier is not excluded.
  const includedRows = useMemo(
    () => (rows ?? []).filter(r => !excludedSuppliers.has(r.supplier_name)),
    [rows, excludedSuppliers],
  )

  // Slice the included rows down to the current on-screen page.
  const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(includedRows.length / pageSize))
  const pageStart = pageSize === 'all' ? 0 : (page - 1) * pageSize
  const pagedRows = pageSize === 'all' ? includedRows : includedRows.slice(pageStart, pageStart + pageSize)

  // Distinct suppliers in the loaded month (+ row counts), Thai-sorted. '' is a
  // valid key (grouped + labelled "(ไม่ระบุผู้ขาย)").
  const suppliers = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows ?? []) m.set(r.supplier_name, (m.get(r.supplier_name) ?? 0) + 1)
    return Array.from(m.entries())
      .map(([name, count]) => ({ name, label: name || '(ไม่ระบุผู้ขาย)', count }))
      .sort((a, b) => a.label.localeCompare(b.label, 'th'))
  }, [rows])

  const filteredSuppliers = useMemo(() => {
    const q = supplierSearch.trim().toLowerCase()
    if (!q) return suppliers
    return suppliers.filter(s => s.label.toLowerCase().includes(q))
  }, [suppliers, supplierSearch])

  const toggleSupplier = (name: string, include: boolean) => {
    setExcludedSuppliers(prev => {
      const next = new Set(prev)
      if (include) next.delete(name)
      else next.add(name)
      return next
    })
  }

  // Empty ruled rows that fill one blank page to the bottom (from measured heights).
  const blankFillerCount = () => {
    const m = metricsRef.current
    const avail = A4_CONTENT_H - m.headerH - FOOTER_H - m.theadH - PACK_SAFETY
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

  // Measure real row/header heights from the hidden specimen, then greedily pack
  // INCLUDED rows into fixed-height A4 pages. Runs before paint (useLayoutEffect)
  // so the print preview never flashes an un-paginated state.
  useLayoutEffect(() => {
    if (loading) return
    const root = measureRef.current
    if (!root) return
    const headerH = (root.querySelector('[data-m="header"]') as HTMLElement)?.offsetHeight ?? 0
    const theadH = (root.querySelector('[data-m="thead"]') as HTMLElement)?.offsetHeight ?? 0
    const fillerH = (root.querySelector('[data-m="filler"]') as HTMLElement)?.offsetHeight ?? 33
    metricsRef.current = { headerH, theadH, fillerH }
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
    // Depend on the STABLE memoized `includedRows` (NOT a fresh array each render)
    // — otherwise setPages re-renders → new array → effect → loop.
  }, [loading, includedRows, shopName])

  const headerBlock = (
    <div data-m="header" className="relative pb-4">
      <span className="absolute right-0 top-0 text-sm whitespace-nowrap">แบบ ข.ย. 9</span>
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

  // One paginated A4 sheet — shared by the modal's single-page preview and the
  // hidden full-document render used for printing.
  const renderPage = (pg: Page9, pi: number) => (
    <A4Sheet key={pi} header={headerBlock} pageNo={pi + 1} pageCount={pages.length}>
      <table className="w-full border-collapse text-sm" style={{ tableLayout: 'fixed' }}>
        {colgroup}
        <thead>{theadRow}</thead>
        <tbody>
          {includedRows.slice(pg.start, pg.end).map((r, idx) => dataRow(r, pg.start + idx))}
          {Array.from({ length: pg.filler }).map((_, i) => fillerRow(`f-${i}`))}
        </tbody>
      </table>
    </A4Sheet>
  )

  // Empty/all-filtered sheet: a plain blank ruled form (operator strikes it
  // through by hand — more flexible than an auto diagonal).
  const renderEmptySheet = () => (
    <A4Sheet header={headerBlock} pageNo={1} pageCount={1}>
      <table className="w-full border-collapse text-sm" style={{ tableLayout: 'fixed' }}>
        {colgroup}
        <thead>{theadRow}</thead>
        <tbody>
          {Array.from({ length: blankFillerCount() }).map((_, i) => fillerRow(`e-${i}`))}
        </tbody>
      </table>
    </A4Sheet>
  )

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Review table card — full height, internal scroll (mirrors ProductsList). */}
      <div className="flex flex-1 flex-col min-h-0 bg-card rounded-card shadow-card border border-border overflow-hidden">
        {/* px-4 = 16px, matches the table's border-l-[16px]/r-[16px] inset. */}
        <div className="no-print px-4 h-12 shrink-0 flex items-center gap-3">
          <div className="flex items-center gap-3 shrink-0">
            <TintIcon icon={FileText} tint="elevated" size="sm" />
            <h3 className="text-lg font-semibold text-foreground">ข.ย.9 บัญชีการซื้อยา</h3>
            <Badge variant="neutral">{includedRows.length}/{total}</Badge>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <MultiDatePicker
              mode={dateMode}
              from={dateFrom}
              to={dateTo}
              onChange={(m, f, t) => { setDateMode(m); setDateFrom(f); setDateTo(t) }}
              allowedModes={['month']}
              className="shrink-0"
            />

            {/* Supplier filter popover */}
            <Popover>
              <PopoverTrigger asChild>
                <Button size="lg" variant="elevated" className="h-9 shrink-0">
                  <Filter className="size-4" /> ผู้จำหน่าย
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64">
                <PopoverHeader className="flex-row items-center justify-between mb-2">
                  <PopoverTitle>กรองผู้จำหน่าย</PopoverTitle>
                  {/* Single toggle: select all ↔ clear all. */}
                  <Button
                    variant="elevated"
                    className="h-7 px-2 text-sm"
                    onClick={() => setExcludedSuppliers(
                      excludedSuppliers.size === 0 ? new Set(suppliers.map(s => s.name)) : new Set()
                    )}
                  >
                    {excludedSuppliers.size === 0 ? 'เอาออกทั้งหมด' : 'เลือกทั้งหมด'}
                  </Button>
                </PopoverHeader>
                <Input
                  value={supplierSearch}
                  onChange={e => setSupplierSearch(e.target.value)}
                  placeholder="ค้นหาผู้จำหน่าย..."
                  className="h-9 mb-2"
                />
                <div className="max-h-72 overflow-auto scrollbar-thin">
                  {filteredSuppliers.map(s => (
                    <label key={s.name} className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                      <Checkbox checked={!excludedSuppliers.has(s.name)} onCheckedChange={v => toggleSupplier(s.name, v === true)} />
                      <span className="text-sm flex-1 overflow-x-clip overflow-y-visible">{s.label}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{s.count}</span>
                    </label>
                  ))}
                  {filteredSuppliers.length === 0 && (
                    <div className="text-sm text-muted-foreground px-2 py-3 text-center">ไม่พบผู้จำหน่าย</div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Table body — scrolls internally; sticky header from the Table primitive. */}
        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-[16px] border-r-[16px] border-card">
          {loading ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">กำลังโหลด…</div>
          ) : isEmpty ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">ไม่มีรายการซื้อยาในเดือนนี้</div>
          ) : includedRows.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">กรองผู้จำหน่ายออกหมดแล้ว — ไม่มีรายการให้แสดง</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">ลำดับ</TableHead>
                  <TableHead className="min-w-10">วันที่ซื้อ</TableHead>
                  <TableHead className="min-w-[180px]">ชื่อผู้ขาย</TableHead>
                  <TableHead className="min-w-[200px]">ชื่อยา</TableHead>
                  <TableHead className="min-w-10">เลขที่ผลิต</TableHead>
                  <TableHead className="min-w-10 text-center">จำนวน</TableHead>
                  <TableHead className="min-w-24">เลขที่ใบส่งของ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedRows.map((r, idx) => {
                  const num = pageStart + idx + 1
                  return (
                    <TableRow key={num}>
                      <TableCell className="text-center">{num}</TableCell>
                      <TableCell>{formatDate(r.purchase_date)}</TableCell>
                      <TableCell>{r.supplier_name || '(ไม่ระบุผู้ขาย)'}</TableCell>
                      <TableCell>{r.drug_name}</TableCell>
                      <TableCell>{r.lot_number}</TableCell>
                      <TableCell className="text-center">{formatQty(r.qty)}{r.unit_name ? ` ${r.unit_name}` : ''}</TableCell>
                      <TableCell>{r.invoice_no}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Bottom bar — on-screen table pagination (independent of the A4 print pagination). */}
        {!loading && includedRows.length > 0 && (
          <div className="no-print px-4 h-12 shrink-0 flex items-center border-t border-border">
            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
            />
          </div>
        )}
      </div>

      {/* Print preview + settings modal (shared shell). Pagination/atoms live here;
          the shell just hosts the render fns + the print UX. */}
      <ReportPrintDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
        title="พิมพ์รายงาน ข.ย.9"
        pageCount={includedRows.length === 0 ? 1 : pages.length}
        renderPreview={(i) => includedRows.length === 0
          ? renderEmptySheet()
          : (pages[i] ? renderPage(pages[i], i) : null)}
        renderFullDoc={() => includedRows.length === 0
          ? renderEmptySheet()
          : pages.map(renderPage)}
      />

      {/* Hidden BLANK form — one ruled page (no data) mounted only while printing it. */}
      {blankRender && (
        <div className="a4-blank" aria-hidden style={{ position: 'absolute', left: -100000, top: 0 }}>
          <A4Sheet header={headerBlock} pageNo={1} pageCount={1}>
            <table className="w-full border-collapse text-sm" style={{ tableLayout: 'fixed' }}>
              {colgroup}
              <thead>{theadRow}</thead>
              <tbody>
                {Array.from({ length: blankFillerCount() }).map((_, i) => fillerRow(`b-${i}`))}
              </tbody>
            </table>
          </A4Sheet>
        </div>
      )}

      {/* Hidden specimen — measured for exact row/header heights (kept off-screen).
          Renders includedRows so the measured row heights align 1:1 with packing. */}
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
            {includedRows.map((r, i) => (
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
