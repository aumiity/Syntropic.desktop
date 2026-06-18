import { useEffect, useState, type ReactNode } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { printDomSheets, parsePageSelection } from '@/lib/print/printDomSheets'
import { ZoomControl } from '@/components/ui/zoom-control'
import { A4 } from './a4'
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react'

// Preview zoom (multiplier). Default 0.75 (75%) — the whole A4-landscape sheet
// fits the dialog width at 75% without horizontal scroll; higher levels scroll.
// Quarter steps over 75%–200% (75/100/125/150/175/200) via the shared ZoomControl.
const DEFAULT_ZOOM = 0.75
const ZOOM_MIN = 0.75, ZOOM_MAX = 1.75, ZOOM_STEP = 0.25

// Shared, form-agnostic print modal for the FDA registers (ข.ย.๙/๑๐/๑๑).
// The caller does the measuring + pagination (it owns the report-specific A4
// atoms) and passes `pageCount` + two render functions:
//   renderPreview(i) → ONE <A4Sheet> for the on-screen zoomable preview
//   renderFullDoc()  → ALL <A4Sheet>s, mounted off-screen only while printing
// This shell adds the Dialog chrome, the zoomable paged preview, page-range +
// copies controls, and the silent print plumbing (printDomSheets on `.a4-doc`).
interface ReportPrintDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  pageCount: number
  renderPreview: (pageIndex: number) => ReactNode
  renderFullDoc: () => ReactNode
}

export default function ReportPrintDialog({
  open, onOpenChange, title, pageCount, renderPreview, renderFullDoc,
}: ReportPrintDialogProps) {
  const { toast } = useToast()
  const [viewPage, setViewPage] = useState(1)       // 1-based page shown
  const [pageInput, setPageInput] = useState('')    // "" = ทุกหน้า; เช่น "1-3,5"
  const [copies, setCopies] = useState(1)           // per-print, default 1, NOT persisted
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)     // preview zoom %, default 75
  const [printRender, setPrintRender] = useState(false)

  // Reset controls on the open rising edge so a prior open never carries over.
  useEffect(() => {
    if (open) { setViewPage(1); setPageInput(''); setCopies(1); setZoom(DEFAULT_ZOOM) }
  }, [open])

  // Clamp viewPage if the parent recomputes fewer pages while the modal is open.
  useEffect(() => {
    if (viewPage > pageCount) setViewPage(Math.max(1, pageCount))
  }, [pageCount, viewPage])

  const scale = zoom

  const handlePrint = () => {
    if (pageCount === 0) return
    setPrintRender(true)
  }

  // Mount the hidden FULL .a4-doc (renderFullDoc), then spool the chosen pages
  // silently to the configured A4 printer, then unmount it.
  useEffect(() => {
    if (!printRender) return
    let cancelled = false
    ;(async () => {
      try {
        const ds = (await window.api.settings.getDocumentSettings()) as any
        const res = await printDomSheets({
          docSelector: '.a4-doc',
          pages: parsePageSelection(pageInput, pageCount),
          printerName: ds?.printer_name || '',
          copies: Math.max(1, Number(copies) || 1),
        })
        if (cancelled) return
        if (res.success) toast({ title: 'ส่งไปยังเครื่องพิมพ์แล้ว', variant: 'success' })
        else if (res.error) toast({ title: 'พิมพ์ไม่สำเร็จ', description: res.error, variant: 'destructive' })
      } finally {
        if (!cancelled) setPrintRender(false)
      }
    })()
    return () => { cancelled = true }
  }, [printRender, pageInput, pageCount, copies, toast])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="full"
        className="h-[88vh] grid-rows-[auto_1fr_auto]"
        // Enter triggers the primary action (print). dialog.tsx does NOT auto-wire
        // Enter (only Esc/no-outside-close). Skip when focus is on a Button so we
        // don't double-fire that button's native Enter-to-click.
        onKeyDown={(e) => {
          const t = e.target as HTMLElement
          if (e.key === 'Enter' && !e.nativeEvent.isComposing && t.tagName !== 'BUTTON') {
            e.preventDefault()
            handlePrint()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <DialogBody className="min-h-0 overflow-hidden flex flex-col gap-3">
          {/* Zoomable A4 preview. The scroll container fills a `relative` wrapper
              so the zoom control can float (absolute) in the top-right WITHOUT
              scrolling away with the content. The reserved box uses mx-auto so it
              centers when it fits and stays fully scrollable (left edge reachable)
              when zoomed past the viewport width. */}
          <div className="relative flex-1 min-h-0">
            <div className="absolute inset-0 overflow-auto scrollbar-thin bg-muted/30 rounded-lg p-6 [scrollbar-gutter:stable]">
              <div className="mx-auto" style={{ width: A4.W * scale, height: A4.H * scale }}>
                <div style={{ width: A4.W, height: A4.H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                  {renderPreview(viewPage - 1)}
                </div>
              </div>
            </div>

            {/* Floating zoom control — top-right, pinned over the preview.
                Same widget as the Settings (เครื่องพิมพ์) previews. */}
            <ZoomControl
              value={zoom}
              min={ZOOM_MIN}
              max={ZOOM_MAX}
              step={ZOOM_STEP}
              onChange={setZoom}
              className="absolute top-3 right-3 z-10"
            />
          </div>

          {/* Page navigation — centered, only when more than one page. */}
          {pageCount > 1 && (
            <div className="shrink-0 flex items-center justify-center gap-3">
              <Button
                variant="elevated" size="icon-lg" className="h-9 w-9 p-0"
                onClick={() => setViewPage(p => Math.max(1, p - 1))}
                disabled={viewPage <= 1} tooltip="หน้าก่อนหน้า"
              >
                <ChevronLeft />
              </Button>
              <span className="text-sm text-muted-foreground select-none">หน้า {viewPage} / {pageCount}</span>
              <Button
                variant="elevated" size="icon-lg" className="h-9 w-9 p-0"
                onClick={() => setViewPage(p => Math.min(pageCount, p + 1))}
                disabled={viewPage >= pageCount} tooltip="หน้าถัดไป"
              >
                <ChevronRight />
              </Button>
            </div>
          )}
        </DialogBody>

        <DialogFooter className="sm:items-center">
          <div className="flex items-center gap-2 mr-auto">
            <span className="text-sm text-muted-foreground shrink-0">หน้า</span>
            <Input
              value={pageInput}
              onChange={e => setPageInput(e.target.value)}
              placeholder={pageCount > 1 ? `ทุกหน้า (1-${pageCount})` : 'ทุกหน้า'}
              className="h-9 w-36 shrink-0"
            />
            <span className="text-sm text-muted-foreground shrink-0 ml-2">จำนวนชุด</span>
            <Input
              type="number" min={1}
              value={copies}
              onChange={e => setCopies(Math.max(1, Number(e.target.value) || 1))}
              className="h-9 w-24 shrink-0"
            />
          </div>
          <Button variant="elevated" className="h-9" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button variant="default" className="h-9" onClick={handlePrint} disabled={pageCount === 0}>
            <Printer className="size-4" /> พิมพ์
          </Button>
        </DialogFooter>

        {/* Hidden FULL-document render — mounted only while printing so
            printDomSheets can clone every .a4-sheet (off-screen but laid out). */}
        {printRender && (
          <div className="a4-doc" aria-hidden style={{ position: 'absolute', left: -100000, top: 0 }}>
            {renderFullDoc()}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
