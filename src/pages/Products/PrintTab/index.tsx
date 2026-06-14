import { useEffect, useMemo, useRef, useState } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CheckRow } from '@/components/ui/checkbox'
import { SectionCard } from '@/components/ui/card'
import { ZoomControl } from '@/components/ui/zoom-control'
import { useToast } from '@/components/ui/toast'
import { TagProductSearchDialog } from '@/components/dialogs/TagProductSearchDialog'
import { GridEditor, padCells } from './GridEditor'
import { Printer, FileText, PenLine } from 'lucide-react'
import {
  priceTagPresets,
  resolveStickerLayout,
  resolvePriceTagPreset,
} from '@/lib/tags/presets'
import { buildBarcodeStickerHtml } from '@/lib/tags/stickerHtml'
import { buildPriceTagHtml } from '@/lib/tags/priceTagHtml'
import {
  BARCODE_STICKER_DEFAULTS,
  PRICE_TAG_DEFAULTS,
  type BarcodeStickerForm,
  type PriceTagForm,
  type TagCell,
} from '@/lib/tags/types'
import { LABEL_DEFAULTS, type LabelSettingsForm } from '@/lib/label/sections'
import { buildBlankLabelHtml, type BlankLabelShop } from '@/lib/label/blankLabel'

type Mode = 'sticker' | 'pricetag' | 'blank'
type PaperSize = 'A4' | 'A5'

interface DocSettings {
  printer_name: string
  paper_size: PaperSize
}

const A4_DIMS: Record<PaperSize, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
}

export default function PrintTab() {
  const { toast } = useToast()

  const [label, setLabel] = useState<LabelSettingsForm>(LABEL_DEFAULTS)
  const [doc, setDoc] = useState<DocSettings>({ printer_name: '', paper_size: 'A4' })
  const [stickerCfg, setStickerCfg] = useState<BarcodeStickerForm>(BARCODE_STICKER_DEFAULTS)
  const [priceCfg, setPriceCfg] = useState<PriceTagForm>(PRICE_TAG_DEFAULTS)
  const [shop, setShop] = useState<BlankLabelShop | null>(null)
  const [printers, setPrinters] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)

  const [mode, setMode] = useState<Mode>('sticker')
  const [copies, setCopies] = useState(1)
  // Cells are kept per mode so switching back and forth doesn't lose work.
  const [stickerCells, setStickerCells] = useState<(TagCell | null)[]>([])
  const [priceCells, setPriceCells] = useState<(TagCell | null)[]>([])

  const [searchOpen, setSearchOpen] = useState(false)
  const [searchIdx, setSearchIdx] = useState<number | null>(null)
  const [previewHtml, setPreviewHtml] = useState('')
  const [busy, setBusy] = useState(false)
  // Sticker preview zoom — the label renders at true 1:1 mm (small on screen),
  // so let the user magnify it. Mirrors the drug-label preview (LabelsTab).
  const [zoom, setZoom] = useState(1)
  const ZOOM_MIN = 1, ZOOM_MAX = 3, ZOOM_STEP = 0.5

  // Load all settings once on mount.
  useEffect(() => {
    Promise.all([
      window.api.settings.getLabelSettings(),
      window.api.settings.getDocumentSettings(),
      window.api.settings.getBarcodeStickerSettings(),
      window.api.settings.getPriceTagSettings(),
      window.api.printer.listPrinters(),
      window.api.settings.getShop(),
    ]).then(([lbl, dc, sk, pt, prs, sh]) => {
      if (lbl) setLabel({ ...LABEL_DEFAULTS, ...lbl })
      if (dc) setDoc({ printer_name: dc.printer_name ?? '', paper_size: (dc.paper_size as PaperSize) ?? 'A4' })
      if (sk) setStickerCfg({ ...BARCODE_STICKER_DEFAULTS, ...sk })
      if (pt) setPriceCfg({ ...PRICE_TAG_DEFAULTS, ...pt })
      setPrinters(((prs as any[]) ?? []).map((p) => p.name))
      if (sh) setShop(sh as BlankLabelShop)
      setLoaded(true)
    })
  }, [])

  // Resolved layout for the active mode → cols/rows for the grid + tooSmall.
  // Sticker count is auto-derived from the label paper (no preset choice).
  const layout = useMemo(
    () => (mode === 'sticker' ? resolveStickerLayout(label) : resolvePriceTagPreset(priceCfg.preset, doc.paper_size)),
    [mode, priceCfg.preset, label, doc.paper_size],
  )
  // Only price tags offer a per-sheet preset picker; stickers are auto.
  const presets = useMemo(
    () => (mode === 'pricetag' ? priceTagPresets(doc.paper_size) : []),
    [mode, doc.paper_size],
  )

  const cells = mode === 'sticker' ? stickerCells : priceCells
  const setCells = mode === 'sticker' ? setStickerCells : setPriceCells
  const maxCopies = mode === 'pricetag' ? 20 : 50

  // Keep each mode's cell array sized to its preset grid (slice/pad).
  const total = layout.cols * layout.rows
  useEffect(() => {
    const L = resolveStickerLayout(label)
    setStickerCells((c) => padCells(c, L.cols * L.rows))
  }, [label])
  useEffect(() => {
    const L = resolvePriceTagPreset(priceCfg.preset, doc.paper_size)
    setPriceCells((c) => padCells(c, L.cols * L.rows))
  }, [priceCfg.preset, doc.paper_size])

  // Clamp copies into the per-mode range whenever the mode changes.
  useEffect(() => { setCopies((c) => Math.min(Math.max(1, c), maxCopies)) }, [maxCopies])

  // Auto-persist config (debounced) once loaded.
  const skipFirstSticker = useRef(true)
  const skipFirstPrice = useRef(true)
  useEffect(() => {
    if (!loaded) return
    if (skipFirstSticker.current) { skipFirstSticker.current = false; return }
    const t = setTimeout(() => { window.api.settings.saveBarcodeStickerSettings(stickerCfg) }, 800)
    return () => clearTimeout(t)
  }, [stickerCfg, loaded])
  useEffect(() => {
    if (!loaded) return
    if (skipFirstPrice.current) { skipFirstPrice.current = false; return }
    const t = setTimeout(() => { window.api.settings.savePriceTagSettings(priceCfg) }, 800)
    return () => clearTimeout(t)
  }, [priceCfg, loaded])

  // Live preview: rebuild the same builder used for the real print job (1 page).
  useEffect(() => {
    let cancelled = false
    const t = setTimeout(async () => {
      const html =
        mode === 'sticker'
          ? await buildBarcodeStickerHtml(label, stickerCfg, cells, 1)
          : mode === 'blank'
            ? await buildBlankLabelHtml(label, shop, 1)
            : await buildPriceTagHtml(priceCfg, cells, doc.paper_size)
      if (!cancelled) setPreviewHtml(html)
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [mode, label, stickerCfg, priceCfg, cells, doc.paper_size, shop])

  const hasAny = cells.some((c) => c != null)
  // Blank labels need no product cells, so they're always printable. Sticker /
  // price-tag modes still require at least one assigned cell.
  const canPrint = mode === 'blank' ? true : hasAny

  const openSearch = (index: number) => { setSearchIdx(index); setSearchOpen(true) }
  const assignCell = (cell: TagCell) => {
    if (searchIdx == null) return
    setCells((arr) => { const next = arr.slice(); next[searchIdx] = cell; return next })
  }
  const removeCell = (index: number) => setCells((arr) => { const next = arr.slice(); next[index] = null; return next })
  const copyFirst = () => setCells((arr) => { const f = arr[0]; return f ? arr.map(() => ({ ...f })) : arr })
  const clearAll = () => setCells((arr) => arr.map(() => null))

  // Resolve the printer label shown read-only above the preview.
  const printerName = mode === 'pricetag' ? doc.printer_name : label.printer_name
  const printerLabel = !printerName
    ? 'เครื่องพิมพ์เริ่มต้นของระบบ'
    : printers.includes(printerName)
      ? printerName
      : `${printerName} (ไม่พบเครื่องพิมพ์)`
  const printerMissing = !!printerName && !printers.includes(printerName)
  const paperLabel = mode === 'pricetag' ? doc.paper_size : `${label.width_mm}×${label.height_mm} มม.`

  const clampCopies = () => Math.min(Math.max(1, Math.round(copies) || 1), maxCopies)

  const handlePrint = async () => {
    if (!canPrint || busy) return
    setBusy(true)
    try {
      if (mode === 'blank') {
        const html = await buildBlankLabelHtml(label, shop, clampCopies())
        const res = await window.api.printer.printLabel({
          html,
          printerName: label.printer_name || '',
          paperWidthMm: label.width_mm,
          paperHeightMm: label.height_mm,
        })
        if (res.success) toast('ส่งงานพิมพ์ฉลากเปล่าแล้ว', 'success')
        else toast(res.error || 'พิมพ์ไม่สำเร็จ', 'error')
      } else if (mode === 'sticker') {
        const html = await buildBarcodeStickerHtml(label, stickerCfg, cells, clampCopies())
        const res = await window.api.printer.printLabel({
          html,
          printerName: label.printer_name || '',
          paperWidthMm: label.width_mm,
          paperHeightMm: label.height_mm,
        })
        if (res.success) toast('ส่งงานพิมพ์สติ๊กเกอร์แล้ว', 'success')
        else toast(res.error || 'พิมพ์ไม่สำเร็จ', 'error')
      } else {
        const html = await buildPriceTagHtml(priceCfg, cells, doc.paper_size)
        const dims = A4_DIMS[doc.paper_size]
        const res = await window.api.printer.printHtml({
          html,
          printerName: doc.printer_name || '',
          paperWidthMm: dims.w,
          heightMm: dims.h,
          copies: clampCopies(),
        })
        if (res.success) toast('ส่งงานพิมพ์ป้ายราคาแล้ว', 'success')
        else toast(res.error || 'พิมพ์ไม่สำเร็จ', 'error')
      }
    } finally { setBusy(false) }
  }

  const handlePreview = async () => {
    if (!canPrint || busy) return
    setBusy(true)
    try {
      if (mode === 'blank') {
        const html = await buildBlankLabelHtml(label, shop, 1)
        const res = await window.api.printer.previewHtmlPdf({
          html,
          paperWidthMm: label.width_mm,
          heightMm: label.height_mm,
        })
        if (!res.success) toast(res.error || 'สร้างตัวอย่างไม่สำเร็จ', 'error')
      } else if (mode === 'sticker') {
        const html = await buildBarcodeStickerHtml(label, stickerCfg, cells, clampCopies())
        const res = await window.api.printer.previewHtmlPdf({
          html,
          paperWidthMm: label.width_mm,
          heightMm: label.height_mm,
        })
        if (!res.success) toast(res.error || 'สร้างตัวอย่างไม่สำเร็จ', 'error')
      } else {
        const html = await buildPriceTagHtml(priceCfg, cells, doc.paper_size)
        const res = await window.api.printer.previewHtmlPdf({ html, pageFormat: doc.paper_size })
        if (!res.success) toast(res.error || 'สร้างตัวอย่างไม่สำเร็จ', 'error')
      }
    } finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col h-full min-h-0 gap-3">
      {/* Top bar: mode toggle (left) + copies/preview/print (right). */}
      <div className="flex items-center gap-3 h-12 shrink-0">
        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <TabsList variant="line">
            <TabsTrigger value="sticker" className="flex-none px-4 py-2"><Printer /> สติ๊กเกอร์บาร์โค้ด</TabsTrigger>
            <TabsTrigger value="pricetag" className="flex-none px-4 py-2"><FileText /> ป้ายราคา A4</TabsTrigger>
            <TabsTrigger value="blank" className="flex-none px-4 py-2"><PenLine /> ฉลากเปล่า</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-muted-foreground">จำนวนสำเนา</span>
          <Input
            type="number"
            min={1}
            max={maxCopies}
            value={copies}
            onChange={(e) => setCopies(parseInt(e.target.value, 10) || 1)}
            className="h-9 w-20"
          />
          <Button variant="elevated" size="lg" className="h-9" disabled={!canPrint || busy} onClick={handlePreview}>
            ดูตัวอย่าง PDF
          </Button>
          <Button size="lg" className="h-9" disabled={!canPrint || busy} onClick={handlePrint}>
            <Printer className="size-4" /> พิมพ์
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-3 overflow-y-auto scrollbar-thin">
        {/* Right: settings + grid */}
        <div className="space-y-3 min-w-0 order-2">
          {mode === 'blank' ? (
          <SectionCard title="ฉลากเปล่า (เขียนเอง)" icon={PenLine} tint="primary">
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="text-foreground">
                ฟอร์มฉลากเปล่ารูปแบบมาตรฐาน สำหรับพิมพ์ออกมาแล้วเขียน/วงด้วยปากกาเอง
              </p>
              <ul className="list-inside list-disc space-y-1">
                <li>มีช่องว่างให้เขียน "ชื่อยา/อาการ" และ "รับประทานครั้งละ"</li>
                <li>มีคำว่า ก่อนอาหาร / หลังอาหาร / พร้อมอาหาร และ เช้า / กลางวัน / เย็น / ก่อนนอน ให้วงเลือกเอง</li>
                <li>พิมพ์ลงกระดาษฉลากและเครื่องพิมพ์เดียวกับฉลากยา (ตั้งค่าได้ที่ ตั้งค่า &gt; ฉลากยา)</li>
                <li>กำหนดจำนวนสำเนาได้ที่มุมขวาบน แล้วกด "พิมพ์"</li>
              </ul>
            </div>
          </SectionCard>
          ) : (
          <>
          <SectionCard title="ตั้งค่า" icon={FileText} tint="primary">
            {/* Sticker count is auto-derived from the paper → no picker. Only
                price tags choose a per-sheet preset. */}
            {mode === 'pricetag' && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-foreground">จำนวนต่อแผ่น</div>
                <div className="flex flex-wrap gap-2">
                  {presets.map((p) => {
                    const active = priceCfg.preset === p.key
                    return (
                      <Button
                        key={p.key}
                        variant={active ? 'default' : 'outline'}
                        size="lg"
                        className="h-9"
                        disabled={p.layout.tooSmall && !active}
                        onClick={() => setPriceCfg((c) => ({ ...c, preset: p.key }))}
                      >
                        {p.label}
                      </Button>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">การแสดงผล</div>
              <div className="flex flex-wrap gap-2">
                {mode === 'sticker' ? (
                  <>
                    <CheckRow framed label="ชื่อสินค้า" checked={!!stickerCfg.show_name} onChange={(v) => setStickerCfg((c) => ({ ...c, show_name: v ? 1 : 0 }))} />
                    <CheckRow framed label="ราคา" checked={!!stickerCfg.show_price} onChange={(v) => setStickerCfg((c) => ({ ...c, show_price: v ? 1 : 0 }))} />
                    <CheckRow framed label="ตัวเลขบาร์โค้ด" checked={!!stickerCfg.show_digits} onChange={(v) => setStickerCfg((c) => ({ ...c, show_digits: v ? 1 : 0 }))} />
                  </>
                ) : (
                  <>
                    <CheckRow framed label="ชื่อสินค้า" checked={!!priceCfg.show_name} onChange={(v) => setPriceCfg((c) => ({ ...c, show_name: v ? 1 : 0 }))} />
                    <CheckRow framed label="ราคา" checked={!!priceCfg.show_price} onChange={(v) => setPriceCfg((c) => ({ ...c, show_price: v ? 1 : 0 }))} />
                    <CheckRow framed label="บาร์โค้ด" checked={!!priceCfg.show_barcode} onChange={(v) => setPriceCfg((c) => ({ ...c, show_barcode: v ? 1 : 0 }))} />
                    <CheckRow framed label="รหัส" checked={!!priceCfg.show_code} onChange={(v) => setPriceCfg((c) => ({ ...c, show_code: v ? 1 : 0 }))} />
                    <CheckRow framed label="หน่วย" checked={!!priceCfg.show_unit} onChange={(v) => setPriceCfg((c) => ({ ...c, show_unit: v ? 1 : 0 }))} />
                    <CheckRow framed label="เส้นตัด" checked={!!priceCfg.show_cut_lines} onChange={(v) => setPriceCfg((c) => ({ ...c, show_cut_lines: v ? 1 : 0 }))} />
                  </>
                )}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="สินค้าในแผ่น" icon={Printer} tint="info-soft">
            <GridEditor
              cols={layout.cols}
              rows={layout.rows}
              cells={padCells(cells, total)}
              onAssignClick={openSearch}
              onRemove={removeCell}
              onCopyFirst={copyFirst}
              onClearAll={clearAll}
            />
          </SectionCard>
          </>
          )}
        </div>

        {/* Left: live preview + read-only printer/paper */}
        <div className="min-w-0 order-1">
          <SectionCard
            title="ตัวอย่าง"
            icon={FileText}
            tint="accent-soft"
            fill
            className="h-full"
            right={mode !== 'pricetag'
              ? <ZoomControl value={zoom} min={ZOOM_MIN} max={ZOOM_MAX} step={ZOOM_STEP} onChange={setZoom} />
              : undefined}
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                เครื่องพิมพ์: <span className={printerMissing ? 'text-warning-strong font-medium' : 'text-foreground'}>{printerLabel}</span>
              </span>
              <span>กระดาษ: <span className="text-foreground">{paperLabel}</span></span>
            </div>
            {mode !== 'pricetag' ? (
              // Full-label preview: the iframe is sized to the real label paper
              // (width_mm × height_mm) with a paper shadow + zoom, mirroring the
              // drug-label preview (LabelPaper). CSS `zoom` scales the layout box
              // so overflow-auto scrolls to the edges; mx-auto centers while it
              // fits. The builder's page is already true mm, so this is
              // preview = print 1:1. Shared by sticker + blank-label modes.
              <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-border bg-muted/30 p-6">
                <div className="w-fit mx-auto" style={{ zoom }}>
                  <iframe
                    title={mode === 'blank' ? 'ตัวอย่างฉลากเปล่า' : 'ตัวอย่างฉลากสติ๊กเกอร์'}
                    srcDoc={previewHtml}
                    scrolling="no"
                    className="block border-0 bg-white"
                    style={{
                      width: `${label.width_mm}mm`,
                      height: `${label.height_mm}mm`,
                      boxShadow: '0 4px 5px rgb(0 0 0 / 0.20), 0 12px 14px rgb(0 0 0 / 0.16)',
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex items-center justify-center rounded-lg border border-border bg-muted overflow-hidden">
                <iframe
                  title="ตัวอย่างงานพิมพ์"
                  srcDoc={previewHtml}
                  className="w-full h-full border-0 bg-card"
                />
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      <TagProductSearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onPick={assignCell}
      />
    </div>
  )
}
