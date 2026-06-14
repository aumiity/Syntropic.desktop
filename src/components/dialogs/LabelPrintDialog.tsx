import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { CircleAlert, Edit, Languages, PenLine, Plus, Printer, Tag } from 'lucide-react'
import { useCartStore } from '@/stores/cartStore'
import type { Product, ProductLabel } from '@/types'
import { LABEL_DEFAULTS, type LabelSettingsForm } from '@/lib/label/sections'
import { composeLabelContent, todayBE, LANG_OPTIONS, type LabelLang } from '@/lib/label/content'
import { buildLabelSheetHtml } from '@/lib/label/html'
import { buildBlankLabelHtml } from '@/lib/label/blankLabel'
import { LabelPaper } from '@/components/label/LabelPaper'
import { ScaledPaper } from '@/components/label/ScaledPaper'
import { LabelFormDialog, type LabelFormLookups } from '@/components/label/LabelFormDialog'

interface Props {
  open: boolean
  onClose: () => void
}

// One print row per DISTINCT cart product (a drug label is per-product, not
// per-unit, so two cart lines of the same product collapse to one row). Bundles
// are excluded entirely (no drug label). `labels` holds only ACTIVE labels.
interface Row {
  productId: number
  product: Product
  labels: ProductLabel[]
  checked: boolean
  selectedLabelId: number | null
  copies: string
}

const emptyLookups: LabelFormLookups = {
  labelFrequencies: [], labelDosages: [], labelMealRelations: [], labelTimes: [], labelAdvices: [],
}

// Sentinel value for the "+ เพิ่มฉลากใหม่" action item inside the label-select
// dropdown — picking it opens the add-label form instead of selecting a label.
const ADD_LABEL_VALUE = '__add_label__'

function productName(product: Product) {
  return product.name_for_print || product.trade_name || '-'
}

// Clamp a raw copies string to 1..99, returned as a string. Empty/invalid → '1'.
// Applied on blur (not on every keystroke) so the field stays freely editable —
// the user can clear it and type a fresh number without it snapping to 1.
function normalizeCopies(raw: string): string {
  const n = parseInt(raw, 10)
  return String(Number.isNaN(n) ? 1 : Math.max(1, Math.min(99, n)))
}

// The integer used for counting / printing — tolerates the transient empty/raw
// string while the field is being edited.
function copiesNum(raw: string): number {
  return Math.max(1, Math.min(99, parseInt(raw, 10) || 1))
}

export function LabelPrintDialog({ open, onClose }: Props) {
  const { toast } = useToast()
  const items = useCartStore(s => s.items)

  const [labelSettings, setLabelSettings] = useState<LabelSettingsForm>(LABEL_DEFAULTS)
  const [shop, setShop] = useState<any>(null)
  const [lookups, setLookups] = useState<LabelFormLookups>(emptyLookups)
  const [rows, setRows] = useState<Row[]>([])
  const [lang, setLang] = useState<LabelLang>('th')
  const [printing, setPrinting] = useState(false)
  const [quickAddProductId, setQuickAddProductId] = useState<number | null>(null)
  const [formLabel, setFormLabel] = useState<ProductLabel | null>(null)
  const [activeProductId, setActiveProductId] = useState<number | null>(null)

  // Blank "write-your-own" label — a fixed pre-printed form, independent of the
  // cart. Has its own copies + print action; the left preview swaps to it when
  // `blankActive`.
  const [blankActive, setBlankActive] = useState(false)
  const [blankCopies, setBlankCopies] = useState('1')
  const [blankHtml, setBlankHtml] = useState('')
  const [blankPrinting, setBlankPrinting] = useState(false)

  // Load print settings + shop + lookups once per open. Per-key overwrite so
  // stale UI-only keys never poison the LabelSettingsForm shape.
  useEffect(() => {
    if (!open) return
    setBlankCopies('1')
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
    Promise.all([
      window.api.settings.listLabelFrequencies(),
      window.api.settings.listLabelDosages(),
      window.api.settings.listLabelMealRelations(),
      window.api.settings.listLabelTimes(),
      window.api.settings.listLabelAdvices(),
    ]).then(([freqs, dosages, meals, times, advices]) => {
      setLookups({
        labelFrequencies: freqs as any[], labelDosages: dosages as any[],
        labelMealRelations: meals as any[], labelTimes: times as any[], labelAdvices: advices as any[],
      })
    }).catch(() => {})
  }, [open])

  // Build the row list from the cart each time the dialog opens. De-dup by
  // product_id; skip lines without a product and bundles. Fetch each product's
  // labels (joined names) and keep only active ones.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    const seen = new Set<number>()
    const distinct: Product[] = []
    for (const it of items) {
      const p = it.product
      if (!p || p.is_bundle === 1 || seen.has(p.id)) continue
      seen.add(p.id)
      distinct.push(p)
    }
    Promise.all(
      distinct.map(async p => {
        const all = (await window.api.products.getLabels(p.id)) as ProductLabel[]
        return { p, active: all.filter(l => l.is_active === 1) }
      }),
    ).then(results => {
      if (cancelled) return
      setRows(results.map(({ p, active }) => {
        const def = active.find(l => (l as any).is_default) ?? active[0] ?? null
        return {
          productId: p.id, product: p, labels: active,
          checked: active.length > 0,
          selectedLabelId: def ? def.id : null,
          copies: '1',
        }
      }))
      setActiveProductId(results[0]?.p.id ?? null)
      // Empty cart → there's nothing to preview but the blank form, so show it.
      setBlankActive(results.length === 0)
    }).catch(() => {})
    return () => { cancelled = true }
    // items intentionally read at open-time only; cart is frozen while printing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const patchRow = (productId: number, patch: Partial<Row>) =>
    setRows(rs => rs.map(r => (r.productId === productId ? { ...r, ...patch } : r)))

  // Build the 1-page blank-label preview (preview = print 1:1) whenever paper /
  // font / shop changes. The print job rebuilds with the real copies count.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    buildBlankLabelHtml(labelSettings, shop, 1)
      .then(h => { if (!cancelled) setBlankHtml(h) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [open, labelSettings, shop])

  const labeledRows = useMemo(() => rows.filter(r => r.labels.length > 0), [rows])
  const noLabelCount = rows.length - labeledRows.length
  const checkedCount = useMemo(() => labeledRows.filter(r => r.checked).length, [labeledRows])
  const totalCopies = useMemo(
    () => rows.reduce((sum, r) => sum + (r.checked && r.selectedLabelId != null ? copiesNum(r.copies) : 0), 0),
    [rows],
  )

  // Active row drives the LEFT preview. Falls back to the first labeled row,
  // else the first row, so the preview pane is never blank while rows exist.
  const activeRow = useMemo(() => {
    if (rows.length === 0) return null
    return rows.find(r => r.productId === activeProductId)
      ?? rows.find(r => r.labels.length > 0) ?? rows[0]
  }, [activeProductId, rows])

  const activeLabel = activeRow?.labels.find(l => l.id === activeRow.selectedLabelId) ?? activeRow?.labels[0] ?? null
  const previewSettings = activeLabel
    ? { ...labelSettings, show_barcode: (activeLabel as any).show_barcode ? 1 : 0 }
    : labelSettings
  const previewContent = activeRow
    ? composeLabelContent(activeLabel, activeRow.product, shop, lookups, lang)
    : {}

  // Open the shared label form for a product. null label = add a new one (the
  // list's per-row "เพิ่มฉลาก"); a label = edit it (the language-row edit button).
  const openAddLabel = (productId: number) => { setFormLabel(null); setQuickAddProductId(productId) }
  const openEditLabel = (productId: number, label: ProductLabel) => { setFormLabel(label); setQuickAddProductId(productId) }

  // After a label save (add OR edit), re-fetch that product's labels (joined
  // names) and fold the row into the labeled group, pre-checked.
  const handleQuickAddSaved = async () => {
    const pid = quickAddProductId
    setQuickAddProductId(null)
    setFormLabel(null)
    if (pid == null) return
    try {
      const all = (await window.api.products.getLabels(pid)) as ProductLabel[]
      const active = all.filter(l => l.is_active === 1)
      const def = active.find(l => (l as any).is_default) ?? active[0] ?? null
      patchRow(pid, {
        labels: active,
        checked: active.length > 0,
        selectedLabelId: def ? def.id : null,
        copies: '1',
      })
      setActiveProductId(pid)
    } catch { /* ignore — row stays in the no-label group */ }
  }

  const handleSelectAll = () => {
    const allSelected = labeledRows.length > 0 && labeledRows.every(r => r.checked)
    setRows(rs => rs.map(r => (r.labels.length > 0 ? { ...r, checked: !allSelected } : r)))
  }

  const handlePrint = async () => {
    if (printing) return
    if (!(labelSettings.width_mm > 0) || !(labelSettings.height_mm > 0)) {
      toast({ title: 'ยังไม่ได้ตั้งขนาดกระดาษฉลาก', description: 'ไปที่ ตั้งค่า > ฉลากยา เพื่อกำหนดขนาดกระดาษก่อน', variant: 'error' })
      return
    }
    const checked = rows.filter(r => r.checked && r.selectedLabelId != null)
    if (checked.length === 0) {
      toast({ title: 'ยังไม่ได้เลือกฉลากที่จะพิมพ์', variant: 'error' })
      return
    }
    setPrinting(true)
    try {
      const entries: { settings: LabelSettingsForm; content: any; date: string }[] = []
      for (const r of checked) {
        const label = r.labels.find(l => l.id === r.selectedLabelId)
        if (!label) continue
        const effective: LabelSettingsForm = { ...labelSettings, show_barcode: (label as any).show_barcode ? 1 : 0 }
        const content = composeLabelContent(label, r.product, shop, lookups, lang)
        const copies = copiesNum(r.copies)
        for (let i = 0; i < copies; i++) entries.push({ settings: effective, content, date: todayBE() })
      }
      const html = await buildLabelSheetHtml(labelSettings, entries)
      const res = await window.api.printer.printLabel({
        html,
        printerName: labelSettings.printer_name,
        paperWidthMm: labelSettings.width_mm,
        paperHeightMm: labelSettings.height_mm,
      })
      if (res.success) {
        toast({ title: 'ส่งงานพิมพ์ฉลากแล้ว', variant: 'success' })
        onClose()
      } else {
        toast({ title: 'พิมพ์ไม่สำเร็จ', description: res.error, variant: 'error' })
      }
    } catch (e: any) {
      toast({ title: 'พิมพ์ไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally {
      setPrinting(false)
    }
  }

  const handlePrintBlank = async () => {
    if (blankPrinting) return
    if (!(labelSettings.width_mm > 0) || !(labelSettings.height_mm > 0)) {
      toast({ title: 'ยังไม่ได้ตั้งขนาดกระดาษฉลาก', description: 'ไปที่ ตั้งค่า > ฉลากยา เพื่อกำหนดขนาดกระดาษก่อน', variant: 'error' })
      return
    }
    setBlankPrinting(true)
    try {
      const html = await buildBlankLabelHtml(labelSettings, shop, copiesNum(blankCopies))
      const res = await window.api.printer.printLabel({
        html,
        printerName: labelSettings.printer_name,
        paperWidthMm: labelSettings.width_mm,
        paperHeightMm: labelSettings.height_mm,
      })
      if (res.success) toast({ title: 'ส่งงานพิมพ์ฉลากเปล่าแล้ว', variant: 'success' })
      else toast({ title: 'พิมพ์ไม่สำเร็จ', description: res.error, variant: 'error' })
    } catch (e: any) {
      toast({ title: 'พิมพ์ไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally {
      setBlankPrinting(false)
    }
  }

  const quickAddRow = quickAddProductId != null ? rows.find(r => r.productId === quickAddProductId) : undefined

  return (
    <>
      <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
        <DialogContent
          size="full"
          divided
          className="h-[min(760px,calc(100vh-3rem))] max-w-[min(1240px,calc(100vw-3rem))] grid-rows-[auto_1fr_auto] gap-0 p-0"
        >
          <DialogHeader className="px-4 pt-4">
            <DialogTitle>
              พิมพ์ฉลากยา
            </DialogTitle>
          </DialogHeader>

          <DialogBody className="flex min-h-0 overflow-hidden rounded-none p-0">
            <div className="grid min-h-0 flex-1 grid-cols-[480px_minmax(0,1fr)] overflow-hidden max-[960px]:grid-cols-1">

              {/* ============ LEFT — live preview of the active product's label ============ */}
              <aside className="flex min-h-0 flex-col border-r border-border bg-muted max-[960px]:hidden">
                <div className="flex h-12 shrink-0 items-center border-b border-border bg-card px-4">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">
                      {blankActive ? 'ฉลากเปล่า (เขียนเอง)' : activeRow ? productName(activeRow.product) : 'ตัวอย่างฉลาก'}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {blankActive
                        ? 'พิมพ์ฟอร์มเปล่าสำหรับเขียน/วงเอง'
                        : activeLabel
                          ? `ฉลาก: ${activeLabel.label_name || 'ฉลากไม่มีชื่อ'}`
                          : 'เลือกสินค้าที่มีฉลากเพื่อดูตัวอย่าง'}
                    </div>
                  </div>
                </div>

                <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-4">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-foreground">
                      <Languages className="size-4 text-muted-foreground" /> ภาษา
                    </span>
                    <Tabs value={lang} onValueChange={v => setLang(v as LabelLang)}>
                      <TabsList variant="toggle">
                        {LANG_OPTIONS.map(o => (
                          <TabsTrigger key={o.value} value={o.value} className="px-2.5 text-sm" disabled={printing || blankActive}>
                            {o.label}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </Tabs>
                  </div>
                  <Button
                    variant="elevated"
                    size="lg"
                    className="h-9 w-9 shrink-0 p-0"
                    title="แก้ไขฉลากนี้"
                    disabled={!activeLabel || printing || blankActive}
                    onClick={() => activeRow && activeLabel && openEditLabel(activeRow.productId, activeLabel)}
                  >
                    <Edit className="size-4" />
                  </Button>
                </div>

                <div className="min-h-0 flex-1 overflow-hidden bg-muted/30 p-5">
                  {blankActive ? (
                    <ScaledPaper widthMm={labelSettings.width_mm} heightMm={labelSettings.height_mm}>
                      <iframe
                        title="ตัวอย่างฉลากเปล่า"
                        srcDoc={blankHtml}
                        scrolling="no"
                        className="block border-0 bg-white"
                        style={{
                          width: `${labelSettings.width_mm}mm`,
                          height: `${labelSettings.height_mm}mm`,
                          boxShadow: '0 4px 5px rgb(0 0 0 / 0.20), 0 12px 14px rgb(0 0 0 / 0.16)',
                        }}
                      />
                    </ScaledPaper>
                  ) : activeRow && activeLabel ? (
                    <ScaledPaper widthMm={previewSettings.width_mm} heightMm={previewSettings.height_mm}>
                      <LabelPaper settings={previewSettings} content={previewContent} date={todayBE()} />
                    </ScaledPaper>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                      <Tag className="size-10 opacity-30" />
                      <span className="text-sm">ไม่มีฉลากให้พรีวิว</span>
                    </div>
                  )}
                </div>
              </aside>

              {/* ============ RIGHT — cart products: pick label + copies per row ============ */}
              <section className="flex min-h-0 flex-col bg-card max-[960px]:col-span-full">
                <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Button
                      variant="elevated"
                      size="lg"
                      onClick={handleSelectAll}
                      disabled={labeledRows.length === 0 || printing}
                    >
                      เลือกทั้งหมด
                    </Button>
                    <span className="truncate text-sm text-muted-foreground">
                      เลือก <strong className="text-foreground">{checkedCount}</strong>/{labeledRows.length} รายการ
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge variant="success-outline">พร้อมพิมพ์ {labeledRows.length}</Badge>
                    {noLabelCount > 0 ? <Badge variant="warning-outline">ไม่มีฉลาก {noLabelCount}</Badge> : null}
                  </div>
                </div>

                <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
                  {/* Blank write-your-own label — always available, even with an
                      empty cart. Own copies + own print action (separate job). */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setBlankActive(true)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setBlankActive(true) }
                    }}
                    className={cn(
                      'grid grid-cols-[32px_minmax(0,1fr)_176px_72px] items-center gap-2.5 rounded-lg border-2 bg-card p-2.5 shadow-sm transition-colors',
                      blankActive ? 'border-primary bg-primary-soft/40' : 'border-border hover:bg-primary-soft/30',
                    )}
                  >
                    <PenLine className="size-5 justify-self-center text-primary" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">ฉลากเปล่า (เขียนเอง)</div>
                      <div className="mt-0.5 flex h-[22px] items-center text-xs text-muted-foreground">
                        <span className="truncate">พิมพ์ฟอร์มเปล่าสำหรับเขียน/วงเอง</span>
                      </div>
                    </div>
                    <Button
                      variant="elevated"
                      size="lg"
                      onClick={e => { e.stopPropagation(); handlePrintBlank() }}
                      disabled={blankPrinting}
                    >
                      <Printer className="size-4" /> {blankPrinting ? 'กำลังพิมพ์...' : 'พิมพ์ฉลากเปล่า'}
                    </Button>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={blankCopies}
                      onChange={e => setBlankCopies(e.target.value.replace(/\D/g, '').slice(0, 2))}
                      onFocus={e => e.currentTarget.select()}
                      onBlur={() => setBlankCopies(normalizeCopies(blankCopies))}
                      onClick={e => e.stopPropagation()}
                      className="h-9 w-full text-center"
                      aria-label="จำนวนสำเนาฉลากเปล่า"
                      disabled={blankPrinting}
                    />
                  </div>

                  {rows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
                      <Tag className="size-10 opacity-30" />
                      <span className="text-sm">ยังไม่มีสินค้าในตะกร้า</span>
                    </div>
                  ) : (
                    rows.map(row => {
                      const hasLabel = row.labels.length > 0
                      const isActive = !blankActive && activeRow?.productId === row.productId
                      const isDefaultSel = row.labels.some(l => l.id === row.selectedLabelId && (l as any).is_default)
                      return (
                        <div
                          key={row.productId}
                          role="button"
                          tabIndex={0}
                          onClick={() => { setActiveProductId(row.productId); setBlankActive(false) }}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveProductId(row.productId); setBlankActive(false) }
                          }}
                          className={cn(
                            'grid grid-cols-[32px_minmax(0,1fr)_176px_72px] items-center gap-2.5 rounded-lg border-2 bg-card p-2.5 shadow-sm transition-colors',
                            isActive ? 'border-primary bg-primary-soft/40' : 'border-border hover:bg-primary-soft/30',
                          )}
                        >
                          {hasLabel ? (
                            <Checkbox
                              size="lg"
                              checked={row.checked}
                              onCheckedChange={v => patchRow(row.productId, { checked: !!v })}
                              onClick={e => e.stopPropagation()}
                              disabled={printing}
                              className="justify-self-center"
                            />
                          ) : (
                            <CircleAlert className="size-5 justify-self-center text-warning" />
                          )}

                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-foreground">{productName(row.product)}</div>
                            {/* Fixed height = the "ค่าเริ่มต้น" badge height (22px) so the
                                row doesn't grow/shrink when the badge appears or hides. */}
                            <div className="mt-0.5 flex h-[22px] items-center gap-2 overflow-hidden text-xs text-muted-foreground">
                              {hasLabel ? (
                                <>
                                  <span className="truncate">{row.labels.length > 1 ? `มี ${row.labels.length} ฉลาก` : 'มีฉลาก'}</span>
                                  {isDefaultSel ? <Badge variant="success-outline" className="shrink-0">ค่าเริ่มต้น</Badge> : null}
                                </>
                              ) : (
                                <span className="truncate">ยังไม่มีฉลากที่เปิดใช้งาน</span>
                              )}
                            </div>
                          </div>

                          {hasLabel ? (
                            <>
                              <Select
                                value={String(row.selectedLabelId ?? '')}
                                onValueChange={v => {
                                  if (v === ADD_LABEL_VALUE) { openAddLabel(row.productId); return }
                                  patchRow(row.productId, { selectedLabelId: Number(v) })
                                }}
                                disabled={printing}
                              >
                                <SelectTrigger className="h-9 w-full" onClick={e => e.stopPropagation()}>
                                  <SelectValue placeholder="เลือกฉลาก" />
                                </SelectTrigger>
                                <SelectContent>
                                  {row.labels.map(label => (
                                    <SelectItem key={label.id} value={String(label.id)}>
                                      {label.label_name || 'ฉลากไม่มีชื่อ'}
                                    </SelectItem>
                                  ))}
                                  <SelectSeparator />
                                  <SelectItem value={ADD_LABEL_VALUE} className="text-primary focus:text-primary">
                                    <span className="flex items-center gap-1.5"><Plus className="size-4" /> เพิ่มฉลากใหม่</span>
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <Input
                                type="text"
                                inputMode="numeric"
                                value={row.copies}
                                onChange={e => patchRow(row.productId, { copies: e.target.value.replace(/\D/g, '').slice(0, 2) })}
                                onFocus={e => e.currentTarget.select()}
                                onBlur={() => patchRow(row.productId, { copies: normalizeCopies(row.copies) })}
                                onClick={e => e.stopPropagation()}
                                className="h-9 w-full text-center"
                                aria-label="จำนวนสำเนา"
                                disabled={printing}
                              />
                            </>
                          ) : (
                            <Button
                              variant="elevated"
                              size="lg"
                              className="col-span-2 w-full"
                              onClick={e => { e.stopPropagation(); openAddLabel(row.productId) }}
                              disabled={printing}
                            >
                              <Plus className="size-4" /> เพิ่มฉลาก
                            </Button>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </section>
            </div>
          </DialogBody>

          <DialogFooter className="items-center justify-between px-4 pb-4 sm:justify-between">
            <div className="text-sm font-medium text-muted-foreground">
              เลือก <strong className="text-foreground">{checkedCount}</strong> รายการ · รวม <strong className="text-foreground">{totalCopies}</strong> ดวง
            </div>
            <div className="flex items-center gap-2">
              <Button variant="elevated" size="xl" onClick={onClose}>ยกเลิก</Button>
              <Button size="xl" onClick={handlePrint} disabled={checkedCount === 0 || printing}>
                <Printer className="size-4" /> {printing ? 'กำลังพิมพ์...' : 'พิมพ์ฉลาก'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick-add: full label form, stacked on top of this dialog */}
      {quickAddRow && (
        <LabelFormDialog
          open={quickAddProductId != null}
          onOpenChange={v => { if (!v) { setQuickAddProductId(null); setFormLabel(null) } }}
          productId={quickAddRow.productId}
          productName={productName(quickAddRow.product)}
          editingLabel={formLabel}
          productBarcode={quickAddRow.product.barcode}
          lookups={lookups}
          onSaved={handleQuickAddSaved}
        />
      )}
    </>
  )
}
