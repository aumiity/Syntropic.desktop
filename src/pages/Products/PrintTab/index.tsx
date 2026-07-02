import { useEffect, useMemo, useRef, useState } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Checkbox, CheckRow } from '@/components/ui/checkbox'
import { NumInput } from '@/components/ui/num-input'
import { SectionCard } from '@/components/ui/card'
import { ZoomControl } from '@/components/ui/zoom-control'
import { QtyDialog } from '@/components/ui/qty-dialog'
import { useToast } from '@/components/ui/toast'
import { TagProductSearchDialog } from '@/components/dialogs/TagProductSearchDialog'
import { BarcodeCsvImportDialog } from '@/components/dialogs/BarcodeCsvImportDialog'
import { GridEditor, padCells } from './GridEditor'
import { PriceTagList } from './PriceTagList'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Printer, FileText, PenLine, AlignLeft, AlignCenter, AlignRight, ClipboardPaste, RefreshCcw, RotateCcw, Plus, FileUp } from 'lucide-react'
import {
  resolveStickerLayout,
  resolvePriceTagPreset,
} from '@/lib/tags/presets'
import { buildBarcodeStickerHtml } from '@/lib/tags/stickerHtml'
import { buildPriceTagHtml } from '@/lib/tags/priceTagHtml'
import {
  BARCODE_STICKER_DEFAULTS,
  PRICE_TAG_DEFAULTS,
  PRICE_TAG_STYLE_PRESETS,
  type BarcodeStickerForm,
  type PriceTagForm,
  type TagCell,
} from '@/lib/tags/types'
import { LABEL_DEFAULTS, type LabelSettingsForm } from '@/lib/label/sections'
import { buildBlankLabelHtml, type BlankLabelShop } from '@/lib/label/blankLabel'
import { useTagDraftStore } from '@/stores/tagDraftStore'

type Mode = 'sticker' | 'pricetag' | 'blank'
// A5 removed system-wide → A4 only (document_settings.paper_size is forced 'A4').
type PaperSize = 'A4'

interface DocSettings {
  printer_name: string
  paper_size: PaperSize
}

const A4_DIMS: Record<PaperSize, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
}

// Price-tag per-element display settings are HIDDEN for now — the "รูปแบบ" presets
// cover them. Code is kept intact; flip this to `true` to bring the rows back.
const SHOW_PRICETAG_DETAILS = false

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
  // Blank label: print today's date in the shop row, or leave it blank to write
  // by hand. Pre-printed stock → uncheck; print-on-demand → keep checked.
  const [printDate, setPrintDate] = useState(true)
  // Cells are kept per mode so switching back and forth doesn't lose work.
  // Sticker cells are page-local (quick to rebuild); the PRICE-TAG list lives in a
  // draft store so it survives navigating away (selling to a walk-in) and back.
  const [stickerCells, setStickerCells] = useState<(TagCell | null)[]>([])
  const priceCells = useTagDraftStore((s) => s.priceItems)
  const setPriceCells = useTagDraftStore((s) => s.setPriceItems)

  const [searchOpen, setSearchOpen] = useState(false)
  const [searchIdx, setSearchIdx] = useState<number | null>(null)
  // Bulk CSV/scan import (price-tag mode only).
  const [importOpen, setImportOpen] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')
  const [busy, setBusy] = useState(false)
  // Copies are chosen in a modal (QtyDialog) that pops up on พิมพ์, not inline.
  const [copiesOpen, setCopiesOpen] = useState(false)
  // Reset-to-defaults confirm (resets only the active mode's display settings).
  const [resetOpen, setResetOpen] = useState(false)
  // Sticker preview zoom — the label renders at true 1:1 mm (small on screen),
  // so let the user magnify it. Mirrors the drug-label preview (LabelsTab).
  const [zoom, setZoom] = useState(1)
  const ZOOM_MIN = 1, ZOOM_MAX = 2, ZOOM_STEP = 0.5
  // Price-tag preview: the A4 page renders at real mm size (210×297mm ≈ 794×1123px),
  // far bigger than the preview box. An <iframe> does NOT scale its inner document to
  // the element size, so we transform:scale() the iframe to FIT the box (measured via
  // ResizeObserver). Mirrors the sticker preview's scale technique (CSS `zoom` on a
  // wrapper would not magnify the iframe's inner mm layout in lockstep).
  const tagBoxRef = useRef<HTMLDivElement>(null)
  const [tagFit, setTagFit] = useState(0.3)

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
      if (dc) setDoc({ printer_name: dc.printer_name ?? '', paper_size: 'A4' })
      if (sk) setStickerCfg({ ...BARCODE_STICKER_DEFAULTS, ...sk })
      // preset is LOCKED to '50up' (picker removed) — ignore any older saved value.
      if (pt) setPriceCfg({ ...PRICE_TAG_DEFAULTS, ...pt, preset: '50up' })
      setPrinters(((prs as any[]) ?? []).map((p) => p.name))
      if (sh) setShop(sh as BlankLabelShop)
      setLoaded(true)
    })
  }, [])

  // Resolved layout for the active mode → cols/rows for the grid + tooSmall.
  // Sticker count is auto-derived from the label paper; price tags are LOCKED to
  // '50up' (5×10) — the per-sheet picker was removed.
  const layout = useMemo(
    () => (mode === 'sticker' ? resolveStickerLayout(label) : resolvePriceTagPreset('50up', doc.paper_size)),
    [mode, label, doc.paper_size],
  )

  const cells = mode === 'sticker' ? stickerCells : priceCells
  const setCells = mode === 'sticker' ? setStickerCells : setPriceCells
  const maxCopies = mode === 'pricetag' ? 20 : 50
  // Price tags = a DENSE ordered list (no null holes); the table caps it at 50.
  const PRICE_MAX = layout.cols * layout.rows // 50 (5×10)
  const priceItems = priceCells.filter((c): c is TagCell => c != null)
  // Highlight the ready-made style whose values all match the current config.
  const activeStyle = PRICE_TAG_STYLE_PRESETS.find(
    (p) => Object.entries(p.values).every(([k, v]) => (priceCfg as unknown as Record<string, number>)[k] === v),
  )?.key

  // Sticker keeps the fixed grid (slice/pad to the auto-derived count). Price tags
  // are a dense list, so NO padding — items are appended/removed explicitly.
  const total = layout.cols * layout.rows
  useEffect(() => {
    const L = resolveStickerLayout(label)
    setStickerCells((c) => padCells(c, L.cols * L.rows))
  }, [label])

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
            ? await buildBlankLabelHtml(label, shop, 1, printDate)
            : await buildPriceTagHtml(priceCfg, cells, doc.paper_size)
      if (!cancelled) setPreviewHtml(html)
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [mode, label, stickerCfg, priceCfg, cells, doc.paper_size, shop, printDate])

  // Fit the A4 page to the preview WIDTH only (fills the block horizontally). The
  // height follows the A4 aspect at natural size — if it's taller than the area,
  // the MAIN page (the outer grid's overflow-y-auto) scrolls, NOT an inner bar.
  // Measure the PREVIEW COLUMN width (stable; the box's own size must not feed back).
  useEffect(() => {
    if (mode !== 'pricetag') return
    const el = tagBoxRef.current
    if (!el) return
    const PW = (210 * 96) / 25.4 // A4 width in CSS px @96dpi
    const compute = () => {
      const cw = el.clientWidth - 40 // card horizontal padding
      if (cw > 0) setTagFit(Math.max(0.05, cw / PW))
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [mode])

  const hasAny = cells.some((c) => c != null)
  // Blank labels need no product cells, so they're always printable. Sticker /
  // price-tag modes still require at least one assigned cell.
  const canPrint = mode === 'blank' ? true : hasAny

  const openSearch = (index: number) => { setSearchIdx(index); setSearchOpen(true) }
  // Price-tag "เพิ่มสินค้า" → append mode (no target cell index).
  const openAdd = () => { setSearchIdx(null); setSearchOpen(true) }
  const assignCell = (cell: TagCell) => {
    // Price tags: APPEND to the list (no in-place replace; capped at PRICE_MAX).
    if (mode === 'pricetag') { setPriceCells((arr) => arr.length >= PRICE_MAX ? arr : [...arr, cell]); return }
    if (searchIdx == null) return
    setCells((arr) => { const next = arr.slice(); next[searchIdx] = cell; return next })
  }
  // Bulk import (price-tag only): append resolved cells in order, capped at PRICE_MAX.
  const importCells = (incoming: TagCell[]) =>
    setPriceCells((arr) => [...arr, ...incoming].slice(0, PRICE_MAX))
  const removeCell = (index: number) => setCells((arr) => { const next = arr.slice(); next[index] = null; return next })
  const copyFirst = () => setCells((arr) => { const f = arr[0]; return f ? arr.map(() => ({ ...f })) : arr })
  const clearAll = () => { if (mode === 'pricetag') setPriceCells([]); else setCells((arr) => arr.map(() => null)) }

  // Price-tag list row actions: duplicate (insert a copy after) / delete.
  const duplicatePrice = (i: number) =>
    setPriceCells((a) => a.length >= PRICE_MAX ? a : [...a.slice(0, i + 1), { ...(a[i] as TagCell) }, ...a.slice(i + 1)])
  const removePrice = (i: number) => setPriceCells((a) => a.filter((_, j) => j !== i))

  // รีเซ็ตการแสดงผลของโหมดปัจจุบันเป็นค่าเริ่มต้น (auto-persist effect เซฟให้เอง).
  const resetSettings = () => {
    if (mode === 'sticker') setStickerCfg(BARCODE_STICKER_DEFAULTS)
    else setPriceCfg(PRICE_TAG_DEFAULTS)
    setResetOpen(false)
    toast('รีเซ็ตการตั้งค่าเป็นค่าเริ่มต้นแล้ว', 'success')
  }

  // Resolve the printer label shown read-only above the preview.
  const printerName = mode === 'pricetag' ? doc.printer_name : label.printer_name
  const printerLabel = !printerName
    ? 'เครื่องพิมพ์เริ่มต้นของระบบ'
    : printers.includes(printerName)
      ? printerName
      : `${printerName} (ไม่พบเครื่องพิมพ์)`
  const printerMissing = !!printerName && !printers.includes(printerName)
  const paperLabel = mode === 'pricetag' ? doc.paper_size : `${label.width_mm}×${label.height_mm} มม.`

  const handlePrint = async (n: number) => {
    if (!canPrint || busy) return
    setBusy(true)
    try {
      if (mode === 'blank') {
        const html = await buildBlankLabelHtml(label, shop, n, printDate)
        const res = await window.api.printer.printLabel({
          html,
          printerName: label.printer_name || '',
          paperWidthMm: label.width_mm,
          paperHeightMm: label.height_mm,
        })
        if (res.success) toast('ส่งงานพิมพ์ฉลากเปล่าแล้ว', 'success')
        else toast(res.error || 'พิมพ์ไม่สำเร็จ', 'error')
      } else if (mode === 'sticker') {
        const html = await buildBarcodeStickerHtml(label, stickerCfg, cells, n)
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
          copies: n,
        })
        if (res.success) toast('ส่งงานพิมพ์ป้ายราคาแล้ว', 'success')
        else toast(res.error || 'พิมพ์ไม่สำเร็จ', 'error')
      }
    } finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col h-full min-h-0 gap-3">
      {/* Top bar: mode toggle only — copies/preview/print + zoom now ride the
          preview card header (same row as ZoomControl), mirroring LabelsTab. */}
      <div className="flex items-center gap-3 h-12 shrink-0">
        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)} className="flex-1">
          <TabsList variant="line" className="w-full">
            <TabsTrigger value="sticker" className="flex-1 px-4 py-2"><Printer /> สติ๊กเกอร์บาร์โค้ด</TabsTrigger>
            <TabsTrigger value="pricetag" className="flex-1 px-4 py-2"><FileText /> ป้ายราคา A4</TabsTrigger>
            <TabsTrigger value="blank" className="flex-1 px-4 py-2"><PenLine /> ฉลากเปล่า</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[5fr_4fr] gap-3 overflow-y-auto scrollbar-thin">
        {/* Right: settings + grid */}
        <div className="space-y-3 min-w-0 order-2">
          {mode === 'blank' ? (
          <SectionCard title="ฉลากเปล่า (เขียนเอง)" icon={PenLine} tint="primary">
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="text-foreground">
                ใช้รูปแบบเดียวกับฉลากยาที่ตั้งค่าไว้ทุกประการ (ตำแหน่ง/ฟอนต์/ขนาด) แต่ช่องข้อมูลยาเว้นว่างไว้ให้เขียน/วงด้วยปากกาเอง
              </p>
              <ul className="list-inside list-disc space-y-1">
                <li>ส่วนหัวร้าน (ชื่อร้าน/ที่อยู่/โทร/LINE) ดึงจากที่ตั้งค่าไว้จริง</li>
                <li>ช่อง "ชื่อยา" "รับประทานครั้งละ" "ความถี่" เว้นเส้นให้เขียนเอง</li>
                <li>มื้อ (ก่อน/หลัง/พร้อมอาหาร) และ เวลา (เช้า/กลางวัน/เย็น/ก่อนนอน) ให้วงเลือกเอง</li>
                <li>section ที่ปิดไว้ใน ตั้งค่า &gt; ฉลากยา จะไม่แสดงบนฉลากเปล่าเช่นกัน</li>
              </ul>
            </div>
            <CheckRow
              framed
              className="h-12"
              label="ใส่ช่องวันที่ (เขียนเอง)"
              checked={printDate}
              onChange={setPrintDate}
            />
          </SectionCard>
          ) : (
          <>
          <SectionCard
            title="ตั้งค่า"
            icon={FileText}
            tint="primary"
            right={
              // Price tags restore defaults via the "รูปแบบ" presets → no reset button.
              // Stickers have no presets, so they keep the reset.
              mode === 'sticker' ? (
                <Button variant="elevated" size="lg" className="h-9" onClick={() => setResetOpen(true)} tooltip="รีเซ็ตการตั้งค่าเป็นค่าเริ่มต้น">
                  <RotateCcw className="size-4" /> รีเซ็ต
                </Button>
              ) : undefined
            }
          >
            {/* Price tags are LOCKED to 50/sheet (5×10) — the per-sheet picker was
                removed. Sticker count is auto-derived from the label paper. */}
            {mode === 'pricetag' && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-foreground">รูปแบบสำเร็จรูป</div>
                <div className="flex flex-wrap gap-2">
                  {PRICE_TAG_STYLE_PRESETS.map((p) => (
                    <Button
                      key={p.key}
                      variant={activeStyle === p.key ? 'default' : 'outline'}
                      size="lg"
                      className="h-9"
                      onClick={() => setPriceCfg((c) => ({ ...c, ...p.values }))}
                    >
                      {p.label}
                    </Button>
                  ))}
                </div>
                {/* Yellow-fill toggle stays visible even while the detailed settings
                    are hidden (it's the one option the operator toggles per print). */}
                <CheckRow
                  framed
                  className="h-12 w-full"
                  label="พื้นหลังสีเหลือง (แบบ 7-11)"
                  checked={!!priceCfg.fill_yellow}
                  onChange={(v) => setPriceCfg((c) => ({ ...c, fill_yellow: v ? 1 : 0 }))}
                />
              </div>
            )}

            {(mode === 'sticker' || SHOW_PRICETAG_DETAILS) && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">การแสดงผล</div>
              {mode === 'sticker' ? (
                // Each element owns ONE row: checkbox (toggle visibility) on the
                // left + its size stepper on the right (greyed when hidden). The
                // barcode-height row has no toggle (the barcode always prints when
                // the product has one) — its label is indented to align with the rest.
                <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card divide-y divide-border">
                  <div className="flex h-12 items-center justify-between px-3">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <Checkbox checked={!!stickerCfg.show_name} onCheckedChange={(v) => setStickerCfg((c) => ({ ...c, show_name: v === true ? 1 : 0 }))} />
                      <span className="text-sm">ชื่อสินค้า</span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      {/* จัดวางชื่อ: ชิดซ้าย / กลาง / ชิดขวา (connected toggle, h-9) */}
                      <Tabs value={stickerCfg.name_align} onValueChange={(v) => setStickerCfg((c) => ({ ...c, name_align: v }))}>
                        <TabsList variant="toggle">
                          <TabsTrigger value="left" className="px-2.5" disabled={!stickerCfg.show_name} aria-label="ชิดซ้าย"><AlignLeft /></TabsTrigger>
                          <TabsTrigger value="center" className="px-2.5" disabled={!stickerCfg.show_name} aria-label="กึ่งกลาง"><AlignCenter /></TabsTrigger>
                          <TabsTrigger value="right" className="px-2.5" disabled={!stickerCfg.show_name} aria-label="ชิดขวา"><AlignRight /></TabsTrigger>
                        </TabsList>
                      </Tabs>
                      <NumInput stepper value={stickerCfg.font_name_pt} onChange={(n) => setStickerCfg((c) => ({ ...c, font_name_pt: n }))} className="w-16" min={6} max={20} step={1} disabled={!stickerCfg.show_name} />
                      <span className="w-8 text-xs text-muted-foreground">pt</span>
                    </div>
                  </div>
                  <div className="flex h-12 items-center justify-between px-3">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <Checkbox checked={!!stickerCfg.show_digits} onCheckedChange={(v) => setStickerCfg((c) => ({ ...c, show_digits: v === true ? 1 : 0 }))} />
                      <span className="text-sm">ตัวเลขบาร์โค้ด</span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      <NumInput stepper value={stickerCfg.font_digits_pt} onChange={(n) => setStickerCfg((c) => ({ ...c, font_digits_pt: n }))} className="w-16" min={5} max={18} step={1} disabled={!stickerCfg.show_digits} />
                      <span className="w-8 text-xs text-muted-foreground">pt</span>
                    </div>
                  </div>
                  <div className="flex h-12 items-center justify-between px-3">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <Checkbox checked={!!stickerCfg.show_price} onCheckedChange={(v) => setStickerCfg((c) => ({ ...c, show_price: v === true ? 1 : 0 }))} />
                      <span className="text-sm">ราคา</span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      <NumInput stepper value={stickerCfg.font_price_pt} onChange={(n) => setStickerCfg((c) => ({ ...c, font_price_pt: n }))} className="w-16" min={5} max={18} step={1} disabled={!stickerCfg.show_price} />
                      <span className="w-8 text-xs text-muted-foreground">pt</span>
                    </div>
                  </div>
                  <div className="flex h-12 items-center justify-between px-3">
                    {/* บาร์โค้ดบังคับเปิดเสมอ (พิมพ์เมื่อสินค้ามีรหัส) — checkbox ติ๊ก+disable
                        ไว้เพื่อให้แถวจัดแนวตรงกับแถวบน; ปรับได้แค่ "ความสูง" */}
                    <label className="flex items-center gap-3 select-none" title="บาร์โค้ดพิมพ์เสมอเมื่อสินค้ามีรหัสบาร์โค้ด">
                      <Checkbox checked disabled />
                      <span className="text-sm text-muted-foreground">บาร์โค้ด</span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">กว้าง</span>
                      <NumInput stepper value={stickerCfg.barcode_w_mm} onChange={(n) => setStickerCfg((c) => ({ ...c, barcode_w_mm: n }))} className="w-16" min={15} max={38} step={0.5} />
                      <span className="text-xs text-muted-foreground">สูง</span>
                      <NumInput stepper value={stickerCfg.barcode_h_mm} onChange={(n) => setStickerCfg((c) => ({ ...c, barcode_h_mm: n }))} className="w-16" min={3} max={12} step={0.5} />
                      <span className="w-8 text-xs text-muted-foreground">มม.</span>
                    </div>
                  </div>
                </div>
              ) : (
                // Same treatment as the sticker rows: each element = checkbox +
                // its own size stepper (greyed when hidden). เส้นตัด is a plain toggle.
                <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card divide-y divide-border">
                  <div className="flex h-12 items-center justify-between px-3">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <Checkbox checked={!!priceCfg.show_name} onCheckedChange={(v) => setPriceCfg((c) => ({ ...c, show_name: v === true ? 1 : 0 }))} />
                      <span className="text-sm">ชื่อสินค้า</span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      <NumInput stepper value={priceCfg.font_name_pt} onChange={(n) => setPriceCfg((c) => ({ ...c, font_name_pt: n }))} className="w-16" min={6} max={28} step={1} disabled={!priceCfg.show_name} />
                      <span className="w-8 text-xs text-muted-foreground">pt</span>
                    </div>
                  </div>
                  <div className="flex h-12 items-center justify-between px-3">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <Checkbox checked={!!priceCfg.show_price} onCheckedChange={(v) => setPriceCfg((c) => ({ ...c, show_price: v === true ? 1 : 0 }))} />
                      <span className="text-sm">ราคา</span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      <NumInput stepper value={priceCfg.font_price_pt} onChange={(n) => setPriceCfg((c) => ({ ...c, font_price_pt: n }))} className="w-16" min={8} max={40} step={1} disabled={!priceCfg.show_price} />
                      <span className="w-8 text-xs text-muted-foreground">pt</span>
                    </div>
                  </div>
                  <div className="flex h-12 items-center justify-between px-3">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <Checkbox checked={!!priceCfg.show_code} onCheckedChange={(v) => setPriceCfg((c) => ({ ...c, show_code: v === true ? 1 : 0 }))} />
                      <span className="text-sm">วันที่พิมพ์</span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      <NumInput stepper value={priceCfg.font_code_pt} onChange={(n) => setPriceCfg((c) => ({ ...c, font_code_pt: n }))} className="w-16" min={5} max={16} step={1} disabled={!priceCfg.show_code} />
                      <span className="w-8 text-xs text-muted-foreground">pt</span>
                    </div>
                  </div>
                  <div className="flex h-12 items-center justify-between px-3">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <Checkbox checked={!!priceCfg.show_unit} onCheckedChange={(v) => setPriceCfg((c) => ({ ...c, show_unit: v === true ? 1 : 0 }))} />
                      <span className="text-sm">หน่วย</span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      <NumInput stepper value={priceCfg.font_unit_pt} onChange={(n) => setPriceCfg((c) => ({ ...c, font_unit_pt: n }))} className="w-16" min={5} max={16} step={1} disabled={!priceCfg.show_unit} />
                      <span className="w-8 text-xs text-muted-foreground">pt</span>
                    </div>
                  </div>
                  <div className="flex h-12 items-center justify-between px-3">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <Checkbox checked={!!priceCfg.show_barcode} onCheckedChange={(v) => setPriceCfg((c) => ({ ...c, show_barcode: v === true ? 1 : 0 }))} />
                      <span className="text-sm">บาร์โค้ด</span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      {/* บาร์โค้ดเต็มความกว้างเสมอ (แบบ 7-11) → ปรับได้แค่ความสูง */}
                      <span className="text-xs text-muted-foreground">สูง</span>
                      <NumInput stepper value={priceCfg.barcode_h_mm} onChange={(n) => setPriceCfg((c) => ({ ...c, barcode_h_mm: n }))} className="w-16" min={3} max={16} step={0.5} disabled={!priceCfg.show_barcode} />
                      <span className="w-8 text-xs text-muted-foreground">มม.</span>
                    </div>
                  </div>
                  <div className="flex h-12 items-center px-3">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <Checkbox checked={!!priceCfg.show_cut_lines} onCheckedChange={(v) => setPriceCfg((c) => ({ ...c, show_cut_lines: v === true ? 1 : 0 }))} />
                      <span className="text-sm">เส้นตัด</span>
                    </label>
                  </div>
                  <div className="flex h-12 items-center px-3">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <Checkbox checked={!!priceCfg.fill_yellow} onCheckedChange={(v) => setPriceCfg((c) => ({ ...c, fill_yellow: v === true ? 1 : 0 }))} />
                      <span className="text-sm">พื้นหลังสีเหลือง (แบบ 7-11)</span>
                    </label>
                  </div>
                  <div className="flex h-12 items-center px-3">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <Checkbox checked={!!priceCfg.price_compact} onCheckedChange={(v) => setPriceCfg((c) => ({ ...c, price_compact: v === true ? 1 : 0 }))} />
                      <span className="text-sm">ราคาแบบย่อ (ตัด .00 และ บาท)</span>
                    </label>
                  </div>
                  <div className="flex h-12 items-center justify-between px-3">
                    <span className="text-sm">ระยะห่างบรรทัด</span>
                    <div className="flex items-center gap-1.5">
                      <NumInput stepper value={priceCfg.line_gap_mm} onChange={(n) => setPriceCfg((c) => ({ ...c, line_gap_mm: n }))} className="w-16" min={0} max={6} step={0.5} />
                      <span className="w-8 text-xs text-muted-foreground">มม.</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            )}
          </SectionCard>

          <SectionCard
            title="รายการสินค้า"
            icon={Printer}
            tint="info-soft"
            right={
              mode === 'pricetag' ? (
                <div className="flex items-center gap-2">
                  <span className="mr-1 text-xs text-muted-foreground">{priceItems.length} / {PRICE_MAX}</span>
                  <Button variant="primary-soft" size="lg" className="h-9" disabled={priceItems.length >= PRICE_MAX} onClick={openAdd}>
                    <Plus className="size-4" /> เพิ่มสินค้า
                  </Button>
                  <Button variant="elevated" size="lg" className="h-9" disabled={priceItems.length >= PRICE_MAX} onClick={() => setImportOpen(true)} tooltip="วางบาร์โค้ดจาก Excel หรือเลือกไฟล์ CSV">
                    <FileUp className="size-4" /> นำเข้า CSV
                  </Button>
                  <Button variant="outline" size="lg" className="h-9" disabled={priceItems.length === 0} onClick={clearAll}>
                    <RefreshCcw className="size-4" /> ล้างทั้งหมด
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Button variant="primary-soft" size="lg" className="h-9" disabled={cells[0] == null} onClick={copyFirst}>
                    <ClipboardPaste className="size-4" /> วางทั้งหมด
                  </Button>
                  <Button variant="outline" size="lg" className="h-9" disabled={!hasAny} onClick={clearAll}>
                    <RefreshCcw className="size-4" /> ล้างทั้งหมด
                  </Button>
                </div>
              )
            }
          >
            {mode === 'pricetag' ? (
              <PriceTagList items={priceItems} max={PRICE_MAX} onDuplicate={duplicatePrice} onRemove={removePrice} />
            ) : (
              <GridEditor
                cols={layout.cols}
                rows={layout.rows}
                cells={padCells(cells, total)}
                onAssignClick={openSearch}
                onRemove={removeCell}
              />
            )}
          </SectionCard>
          </>
          )}
        </div>

        {/* Left: live preview + read-only printer/paper */}
        <div ref={tagBoxRef} className="min-w-0 order-1">
          <SectionCard
            title="ตัวอย่าง"
            icon={FileText}
            tint="amber"
            fill={mode !== 'pricetag'}
            className={mode === 'pricetag' ? undefined : 'h-full'}
            right={
              <div className="flex items-center gap-2">
                {mode !== 'pricetag' && (
                  <ZoomControl value={zoom} min={ZOOM_MIN} max={ZOOM_MAX} step={ZOOM_STEP} onChange={setZoom} />
                )}
                <Button size="lg" className="h-9" disabled={!canPrint || busy} onClick={() => setCopiesOpen(true)}>
                  <Printer className="size-4" /> พิมพ์
                </Button>
              </div>
            }
          >
            {mode !== 'pricetag' ? (
              // Full-label preview: the iframe is sized to the real label paper
              // (width_mm × height_mm) with a paper shadow, mirroring the
              // drug-label preview (LabelPaper). UNLIKE that preview (inline DOM),
              // this is an isolated <iframe>, so CSS `zoom` on a wrapper would
              // enlarge the iframe box WITHOUT magnifying its inner mm-laid-out
              // document in lockstep — paper frame grows but contents stay ~physical
              // size, breaking WYSIWYG. So we scale the iframe itself with
              // `transform: scale()` (rasterises the whole element + its content
              // together) and size the wrapper to the scaled box so overflow-auto
              // still scrolls to the edges; mx-auto centers while it fits.
              <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-border bg-muted/30 p-6">
                <div
                  className="mx-auto"
                  style={{
                    width: `calc(${label.width_mm}mm * ${zoom})`,
                    height: `calc(${label.height_mm}mm * ${zoom})`,
                  }}
                >
                  <iframe
                    title={mode === 'blank' ? 'ตัวอย่างฉลากเปล่า' : 'ตัวอย่างฉลากสติ๊กเกอร์'}
                    srcDoc={previewHtml}
                    scrolling="no"
                    className="block border-0 bg-white"
                    style={{
                      width: `${label.width_mm}mm`,
                      height: `${label.height_mm}mm`,
                      transform: `scale(${zoom})`,
                      transformOrigin: 'top left',
                      boxShadow: '0 4px 5px rgb(0 0 0 / 0.20), 0 12px 14px rgb(0 0 0 / 0.16)',
                    }}
                  />
                </div>
              </div>
            ) : (
              // A4 fitted to the block WIDTH (fills horizontally), natural height. If
              // taller than the viewport, the MAIN page scrolls (outer grid), not an
              // inner scrollbar — so no maxHeight / overflow here.
              <div className="flex justify-center">
                <div
                  className="shrink-0 overflow-hidden rounded-lg border border-border bg-white"
                  style={{
                    width: `calc(210mm * ${tagFit})`,
                    height: `calc(297mm * ${tagFit})`,
                    boxShadow: '0 4px 5px rgb(0 0 0 / 0.20), 0 12px 14px rgb(0 0 0 / 0.16)',
                  }}
                >
                  <iframe
                    title="ตัวอย่างงานพิมพ์"
                    srcDoc={previewHtml}
                    scrolling="no"
                    className="block border-0 bg-white"
                    style={{
                      width: '210mm',
                      height: '297mm',
                      transform: `scale(${tagFit})`,
                      transformOrigin: 'top left',
                    }}
                  />
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                เครื่องพิมพ์: <span className={printerMissing ? 'text-warning-strong font-medium' : 'text-foreground'}>{printerLabel}</span>
              </span>
              <span>กระดาษ: <span className="text-foreground">{paperLabel}</span></span>
            </div>
          </SectionCard>
        </div>
      </div>

      <TagProductSearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onPick={assignCell}
      />

      {/* Bulk import: paste a scanned barcode column (Excel) or a CSV file →
          resolve each barcode exactly → append to the price-tag list. */}
      <BarcodeCsvImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        remaining={PRICE_MAX - priceItems.length}
        onImport={importCells}
      />

      {/* Copies modal — pops up on พิมพ์, then prints the chosen count. Reuses
          the shared POS QtyDialog (center field + flanking +/- + ตกลง/ยกเลิก);
          no price/stock props so its summary strip stays hidden. */}
      <QtyDialog
        open={copiesOpen}
        onClose={() => setCopiesOpen(false)}
        itemName={mode === 'sticker' ? 'สติ๊กเกอร์บาร์โค้ด' : mode === 'pricetag' ? 'ป้ายราคา A4' : 'ฉลากเปล่า'}
        unitName="สำเนา"
        initialQty={copies}
        presets={[]}
        applyLabel="พิมพ์"
        onApply={(qty) => {
          const n = Math.min(maxCopies, Math.max(1, Math.round(qty)))
          setCopies(n)
          handlePrint(n)
        }}
      />

      {/* รีเซ็ตการตั้งค่าของโหมดปัจจุบันเป็นค่าเริ่มต้น (เตือนก่อน เพราะทับค่าที่ปรับไว้) */}
      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        variant="warning"
        title="รีเซ็ตการตั้งค่า"
        description={`การตั้งค่าการแสดงผล${mode === 'sticker' ? 'สติ๊กเกอร์บาร์โค้ด' : 'ป้ายราคา'}ทั้งหมดจะกลับเป็นค่าเริ่มต้น`}
        confirmLabel="รีเซ็ต"
        onConfirm={resetSettings}
      />
    </div>
  )
}
