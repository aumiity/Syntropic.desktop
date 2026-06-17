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
import { Printer } from 'lucide-react'

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

  const measureRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setSummary(null) }, [setSummary])

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

  // Silent-print the selected sheets to the configured A4 printer (Settings →
  // เครื่องพิมพ์ → เอกสาร A4). No OS dialog — Electron can't show one reliably.
  const handlePrint = async () => {
    if (loading || pages.length === 0) return
    const ds = (await window.api.settings.getDocumentSettings()) as any
    const res = await printDomSheets({
      docSelector: '.a4-doc',
      pages: parsePageSelection(pageInput, pages.length),
      printerName: ds?.printer_name || '',
      copies: Math.max(1, Number(ds?.copies) || 1),
    })
    if (res.success) toast({ title: 'ส่งไปยังเครื่องพิมพ์แล้ว', variant: 'success' })
    else if (res.error) toast({ title: 'พิมพ์ไม่สำเร็จ', description: res.error, variant: 'destructive' })
  }

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
      <span className="absolute right-0 top-0 text-sm">แบบ {formCode}</span>
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
        <th key={h} className="border border-foreground/40 px-2 py-2 text-sm font-semibold text-center align-middle bg-card">
          {h}
        </th>
      ))}
    </tr>
  )

  const buyerOf = (r: SaleLedgerRow) =>
    r.customer_code === 'C0000' ? (r.customer_name_free || '') : r.customer_full_name

  const saleDataRow = (r: SaleLedgerRow, num: number, key: string | number) => (
    <tr key={key}>
      <td className="border border-foreground/40 px-2 py-1 text-center">{num}</td>
      <td className="border border-foreground/40 px-2 py-1 text-center">{formatThaiShortBE(r.sold_at)}</td>
      <td className="border border-foreground/40 px-2 py-1 text-center">
        {formatQty(r.qty)}{r.unit_name ? ` ${r.unit_name}` : ''}
      </td>
      <td className="border border-foreground/40 px-2 py-1">{buyerOf(r)}</td>
      <td className="border border-foreground/40 px-2 py-1"></td>
      <td className="border border-foreground/40 px-2 py-1"></td>
    </tr>
  )

  const fillerRow = (key: string | number) => (
    <tr key={key}>
      {Array.from({ length: 6 }).map((_, j) => (
        <td key={j} className="border border-foreground/40 px-2 py-1 h-8"></td>
      ))}
    </tr>
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
        <div className="h-full overflow-auto bg-muted/30 rounded-lg [scrollbar-gutter:stable]">
        <div className="a4-doc flex flex-col items-center gap-6 py-6">
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
                          <td key={j} className="border border-foreground/40 px-2 py-1 h-8">
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
            <A4Sheet header={headerBlock} pageNo={1} pageCount={1}>
              <div className="mt-10 text-center text-sm italic text-muted-foreground">
                ไม่มีรายการขายยาในช่วงวันที่ที่เลือก
              </div>
            </A4Sheet>
          ) : (
            pages.map((pg, pi) => (
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
            ))
          )}
        </div>

        {isEmpty && (
          <div className="no-print mt-4 text-center text-sm italic text-muted-foreground">
            ไม่มีรายการขายยาในช่วงวันที่ที่เลือก
          </div>
        )}
        </div>
      </SectionCard>

      {/* Hidden specimen — measured for exact lot-header / row / table-header heights */}
      <div
        ref={measureRef}
        aria-hidden
        className="invisible pointer-events-none"
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
                <td key={j} className="border border-foreground/40 px-2 py-1 h-8"></td>
              ))}
            </tr>
          </tbody>
        </table>
        {sections.map((sec, si) => (
          <div key={sec.key}>
            <div data-m="lothead" data-si={si}>{lotHeaderInner(sec.head, false)}</div>
            <table className="w-full border-collapse text-sm" style={{ tableLayout: 'fixed' }}>
              {saleColgroup}
              <tbody>
                {sec.rows.map((r, ri) => (
                  <tr key={ri} data-m="srow" data-si={si} data-ri={ri}>
                    <td className="border border-foreground/40 px-2 py-1 text-center">{ri + 1}</td>
                    <td className="border border-foreground/40 px-2 py-1 text-center">{formatThaiShortBE(r.sold_at)}</td>
                    <td className="border border-foreground/40 px-2 py-1 text-center">
                      {formatQty(r.qty)}{r.unit_name ? ` ${r.unit_name}` : ''}
                    </td>
                    <td className="border border-foreground/40 px-2 py-1">{buyerOf(r)}</td>
                    <td className="border border-foreground/40 px-2 py-1"></td>
                    <td className="border border-foreground/40 px-2 py-1"></td>
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
