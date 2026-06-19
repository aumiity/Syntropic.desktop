import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { SectionCard } from '@/components/ui/card'
import { ZoomControl } from '@/components/ui/zoom-control'
import { cn } from '@/lib/utils'
import { Plus, Trash2, Edit, Pill, List, Printer, Languages } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ProductLabel } from '@/types'
import type { FullProduct } from './shared'
// Label anatomy (settings shape / defaults) — SSOT shared with the Settings
// label-designer, so this preview matches the print 1:1. LabelPaper does the
// actual rendering; composeLabelContent maps this product's label → text.
import { LABEL_DEFAULTS, type LabelSettingsForm } from '@/lib/label/sections'
import { composeLabelContent, todayBE, LANG_OPTIONS, type LabelLang } from '@/lib/label/content'
import { buildLabelHtml } from '@/lib/label/html'
import { LabelPaper } from '@/components/label/LabelPaper'
import { LabelFormDialog } from '@/components/label/LabelFormDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

interface Props {
  product: FullProduct
  productId: number
  labelFrequencies: any[]
  labelDosages: any[]
  labelMealRelations: any[]
  labelTimes: any[]
  labelAdvices: any[]
  onRefresh: () => Promise<void> | void
}

export function LabelsTab({
  product, productId,
  labelFrequencies, labelDosages, labelMealRelations, labelTimes, labelAdvices,
  onRefresh,
}: Props) {
  const { toast } = useToast()

  const [labelDialog, setLabelDialog] = useState(false)
  const [editingLabel, setEditingLabel] = useState<ProductLabel | null>(null)
  // Delete confirm — holds the label pending deletion (null = dialog closed).
  const [confirmDelete, setConfirmDelete] = useState<ProductLabel | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Selected label drives the LEFT preview. Falls back to the default label
  // (else the first) and follows the list as labels are added / removed.
  const [selectedId, setSelectedId] = useState<number | null>(null)
  // Label paper/font settings — loaded once so the preview matches the printed
  // sticker 1:1. Shop info feeds the preview's top (หัวร้าน) section.
  const [labelSettings, setLabelSettings] = useState<LabelSettingsForm>(LABEL_DEFAULTS)
  const [shop, setShop] = useState<any>(null)
  const [printing, setPrinting] = useState(false)
  // Preview zoom — the paper renders at true 1:1 mm (small on screen), so let the
  // user magnify it. CSS `zoom` (Chromium) scales the real layout box so the
  // overflow-auto container can scroll to the edges. Mirrors the Settings designer.
  const [zoom, setZoom] = useState(1)
  const ZOOM_MIN = 1, ZOOM_MAX = 2, ZOOM_STEP = 0.5
  // Preview/print language. Threaded into composeLabelContent for BOTH the
  // on-screen preview and the print/PDF builder so what you see = what prints
  // (the label system's preview = print 1:1 invariant). Defaults to 'th'.
  const [lang, setLang] = useState<LabelLang>('th')

  useEffect(() => {
    // Per-key overwrite so stale UI-only keys never poison the settings shape.
    window.api.settings.getLabelSettings().then((data: any) => {
      if (!data) return
      setLabelSettings(prev => {
        const next = { ...prev }
        for (const k of Object.keys(prev) as (keyof LabelSettingsForm)[]) {
          const val = (data as any)[k]
          if (val !== undefined && val !== null) (next as any)[k] = val
        }
        return next
      })
    }).catch(() => {})
    window.api.settings.getShop().then((s: any) => setShop(s)).catch(() => {})
  }, [])

  const labels = product.labels ?? []
  const selected = useMemo(() => {
    if (selectedId != null) {
      const hit = labels.find(l => l.id === selectedId)
      if (hit) return hit
    }
    return labels.find(l => (l as any).is_default) ?? labels[0] ?? null
  }, [selectedId, labels])

  // The per-label "แสดงบาร์โค้ด" switch is the REAL on/off for the barcode
  // section on a printed label. The global label_settings.show_barcode only
  // governs the Settings designer preview (so the owner can see + position the
  // sample barcode) — it must NOT gate real output. Override it here with the
  // selected label's switch so the product-level decision wins. Offset/height
  // (offset_*_barcode, font_size_barcode) still come from labelSettings.
  // The barcode also self-hides when the product has no barcode value
  // (barcodeSvg → '' ⇒ row dropped), so an empty barcode never prints a stub.
  const effectiveSettings = useMemo<LabelSettingsForm>(() => ({
    ...labelSettings,
    show_barcode: (selected as any)?.show_barcode ? 1 : 0,
  }), [labelSettings, selected])

  // The add/edit form lives in the shared <LabelFormDialog>; these just pick the
  // target (null = add) and open it. Saving + payload build happen inside it.
  const openAddLabel = () => {
    setEditingLabel(null)
    setLabelDialog(true)
  }

  const openEditLabel = (l: ProductLabel) => {
    setEditingLabel(l)
    setLabelDialog(true)
  }

  // Actual delete — fired only after the confirm dialog is accepted.
  const handleDeleteLabel = async () => {
    if (!confirmDelete || deleting) return
    setDeleting(true)
    try {
      await window.api.products.deleteLabel(confirmDelete.id)
      toast({ title: 'ลบฉลากสำเร็จ', variant: 'success' })
      setConfirmDelete(null)
      await onRefresh()
    } catch (e: any) {
      toast({ title: 'ลบไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally {
      setDeleting(false)
    }
  }

  // Build print-ready HTML for the currently-selected label, via the SAME
  // shared builder the Settings designer uses (so print === preview).
  const selectedLabelHtml = () =>
    buildLabelHtml(
      effectiveSettings,
      composeLabelContent(selected as any, product, shop, { labelDosages, labelFrequencies, labelMealRelations, labelTimes, labelAdvices }, lang),
      todayBE(),
    )

  // Gate print/PDF: need a selected label + a configured paper size (set in
  // ตั้งค่า > ฉลากยา). Toasts and returns false on failure.
  const canPrint = (): boolean => {
    if (!selected) { toast({ title: 'เลือกฉลากก่อนพิมพ์', variant: 'error' }); return false }
    if (!(labelSettings.width_mm > 0) || !(labelSettings.height_mm > 0)) {
      toast({ title: 'ยังไม่ได้ตั้งขนาดกระดาษฉลาก', description: 'ไปที่ ตั้งค่า > ฉลากยา เพื่อกำหนดขนาดกระดาษก่อน', variant: 'error' })
      return false
    }
    return true
  }

  const handlePrintLabel = async () => {
    if (printing || !canPrint()) return
    setPrinting(true)
    try {
      const res = await window.api.printer.printLabel({
        html: await selectedLabelHtml(),
        printerName: labelSettings.printer_name,
        paperWidthMm: labelSettings.width_mm,
        paperHeightMm: labelSettings.height_mm,
      })
      if (res.success) toast({ title: 'ส่งงานพิมพ์แล้ว', variant: 'success' })
      else             toast({ title: 'พิมพ์ไม่สำเร็จ', description: res.error, variant: 'error' })
    } catch (e: any) {
      toast({ title: 'พิมพ์ไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally {
      setPrinting(false)
    }
  }

  return (
    <>
      <div className="grid grid-cols-[3fr_2fr] gap-4 pt-4 items-start">

        {/* LEFT — faithful 1:1 preview of the selected label */}
        <SectionCard
          className="min-w-0 sticky top-0 self-start"
          icon={Pill}
          title="ตัวอย่างฉลาก"
          tint="success"
          right={
            <div className="flex items-center gap-2">
              <ZoomControl value={zoom} min={ZOOM_MIN} max={ZOOM_MAX} step={ZOOM_STEP} onChange={setZoom} />
              <Button onClick={handlePrintLabel} disabled={!selected || printing} className="h-9 px-3">
                <Printer className="size-4" /> {printing ? 'กำลังพิมพ์...' : 'พิมพ์ฉลาก'}
              </Button>
            </div>
          }
        >
          {/* The label paper is rendered by the shared LabelPaper component
              (also used by the Settings designer preview) so this matches the
              printed sticker 1:1. composeLabelContent maps this label → text.
              The zoom wrapper uses CSS `zoom` (not transform) so the scaled box
              keeps its layout size and overflow-auto can scroll to its edges;
              `mx-auto` centers while it fits, then left-aligns when it overflows. */}
          {/* Language strip — switches BOTH the preview and the print/PDF output
              (composeLabelContent receives `lang`), keeping preview = print 1:1. */}
          <div className="mb-3 flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Languages className="size-4 text-muted-foreground" /> ภาษา
            </div>
            <Tabs value={lang} onValueChange={v => setLang(v as LabelLang)}>
              <TabsList variant="toggle">
                {LANG_OPTIONS.map(o => (
                  <TabsTrigger key={o.value} value={o.value} className="text-sm px-3">{o.label}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
          <div className="bg-muted/30 rounded-lg p-6 overflow-auto max-h-[70vh]">
            <div className="w-fit mx-auto" style={{ zoom }}>
              {selected ? (
                <LabelPaper
                  settings={effectiveSettings}
                  content={composeLabelContent(selected as any, product, shop, { labelDosages, labelFrequencies, labelMealRelations, labelTimes, labelAdvices }, lang)}
                  date={todayBE()}
                />
              ) : (
                <div
                  className="border-2 border-dashed border-border bg-card text-foreground-subtle flex flex-col items-center justify-center gap-2 shrink-0"
                  style={{ width: `${labelSettings.width_mm}mm`, height: `${labelSettings.height_mm}mm` }}
                >
                  <Pill className="size-8 opacity-40" />
                  <span className="text-sm">เลือกฉลากเพื่อดูตัวอย่าง</span>
                </div>
              )}
            </div>
          </div>
        </SectionCard>

        {/* RIGHT — label list: ชื่อ + สถานะ + ปุ่มจัดการ (รายละเอียดดูจาก preview) */}
        <SectionCard
          icon={List}
          title="รายการฉลาก"
          tint="secondary"
          right={
            <Button variant="elevated" onClick={openAddLabel} className="h-9 px-3">
              <Plus className="size-4" /> เพิ่มฉลาก
            </Button>
          }
        >
          {labels.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
              <Pill className="size-10 opacity-30" />
              <span className="text-sm">ยังไม่มีฉลาก — กด เพิ่มฉลาก เพื่อเริ่ม</span>
            </div>
          ) : (
            <div className="space-y-2">
              {labels.map(l => {
                const isSel = selected?.id === l.id
                return (
                  <div
                    key={l.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(l.id)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(l.id) } }}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors',
                      isSel ? 'border-2 border-primary bg-primary-soft/40' : 'border-border hover:bg-primary-soft/30',
                      !l.is_active && 'opacity-60',
                    )}
                  >
                    <div className="min-w-0 flex-1 flex items-center gap-2">
                      <span className="text-sm font-semibold overflow-x-clip overflow-y-visible whitespace-nowrap">
                        {l.label_name || 'ฉลากไม่มีชื่อ'}
                      </span>
                      <div className="ml-auto flex items-center gap-2 shrink-0">
                        {(l as any).is_default ? <Badge variant="primary-outline" className="rounded-md">ค่าเริ่มต้น</Badge> : null}
                        {!l.is_active ? <Badge variant="neutral-outline" className="rounded-md">ปิด</Badge> : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button size="icon-lg" variant="elevated" onClick={e => { e.stopPropagation(); openEditLabel(l) }} tooltip="แก้ไข">
                        <Edit />
                      </Button>
                      <Button size="icon-lg" variant="elevated-destructive" onClick={e => { e.stopPropagation(); setConfirmDelete(l) }} tooltip="ลบ">
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </SectionCard>
      </div>

      {/* ======================== LABEL DIALOG ======================== */}
      <LabelFormDialog
        open={labelDialog}
        onOpenChange={setLabelDialog}
        productId={productId}
        productName={product.name_for_print || product.trade_name || ''}
        editingLabel={editingLabel}
        productBarcode={product.barcode}
        lookups={{ labelFrequencies, labelDosages, labelMealRelations, labelTimes, labelAdvices }}
        onSaved={() => onRefresh()}
      />

      {/* Delete confirm — names the label in the description; destructive variant */}
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={open => { if (!open && !deleting) setConfirmDelete(null) }}
        title="ลบฉลากนี้?"
        description={
          <>
            คุณต้องการลบฉลาก "{confirmDelete?.label_name || 'ฉลากไม่มีชื่อ'}"
            <br />
            ไม่สามารถกู้คืนได้อีก
          </>
        }
        variant="destructive"
        confirmLabel={deleting ? 'กำลังลบ...' : 'ยืนยัน'}
        cancelLabel="ยกเลิก"
        busy={deleting}
        onConfirm={handleDeleteLabel}
      />
    </>
  )
}
