import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Toggle } from '@/components/ui/switch'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { Pill, Printer, Plus, Languages } from 'lucide-react'
import { useCartStore } from '@/stores/cartStore'
import type { Product, ProductLabel } from '@/types'
import { LABEL_DEFAULTS, type LabelSettingsForm } from '@/lib/label/sections'
import { composeLabelContent, todayBE, type LabelLang } from '@/lib/label/content'
import { buildLabelSheetHtml } from '@/lib/label/html'
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
  copies: number
}

const LANG_OPTIONS: { value: LabelLang; label: string }[] = [
  { value: 'th', label: 'ไทย' },
  { value: 'en', label: 'English' },
  { value: 'mm', label: 'พม่า' },
  { value: 'zh', label: 'จีน' },
]

const emptyLookups: LabelFormLookups = {
  labelFrequencies: [], labelDosages: [], labelMealRelations: [], labelTimes: [], labelAdvices: [],
}

export function LabelPrintDialog({ open, onClose }: Props) {
  const { toast } = useToast()
  const items = useCartStore(s => s.items)

  const [labelSettings, setLabelSettings] = useState<LabelSettingsForm>(LABEL_DEFAULTS)
  const [shop, setShop] = useState<any>(null)
  const [lookups, setLookups] = useState<LabelFormLookups>(emptyLookups)
  const [rows, setRows] = useState<Row[]>([])
  const [showNoLabel, setShowNoLabel] = useState(false)
  const [lang, setLang] = useState<LabelLang>('th')
  const [printing, setPrinting] = useState(false)
  const [quickAddProductId, setQuickAddProductId] = useState<number | null>(null)

  // Load print settings + shop + lookups once per open. Per-key overwrite so
  // stale UI-only keys never poison the LabelSettingsForm shape.
  useEffect(() => {
    if (!open) return
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
          copies: 1,
        }
      }))
    }).catch(() => {})
    return () => { cancelled = true }
    // items intentionally read at open-time only; cart is frozen while printing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const patchRow = (productId: number, patch: Partial<Row>) =>
    setRows(rs => rs.map(r => (r.productId === productId ? { ...r, ...patch } : r)))

  const labeledRows = useMemo(() => rows.filter(r => r.labels.length > 0), [rows])
  const noLabelRows = useMemo(() => rows.filter(r => r.labels.length === 0), [rows])
  const checkedCount = useMemo(() => labeledRows.filter(r => r.checked).length, [labeledRows])

  const productName = (p: Product) => p.name_for_print || p.trade_name || '-'

  // After a quick-add label save, re-fetch that product's labels (joined names)
  // and fold the row into the labeled group, pre-checked.
  const handleQuickAddSaved = async () => {
    const pid = quickAddProductId
    setQuickAddProductId(null)
    if (pid == null) return
    try {
      const all = (await window.api.products.getLabels(pid)) as ProductLabel[]
      const active = all.filter(l => l.is_active === 1)
      const def = active.find(l => (l as any).is_default) ?? active[0] ?? null
      patchRow(pid, {
        labels: active,
        checked: active.length > 0,
        selectedLabelId: def ? def.id : null,
        copies: 1,
      })
    } catch { /* ignore — row stays in the no-label group */ }
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
        const copies = Math.max(1, Math.min(99, Math.floor(r.copies) || 1))
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

  const quickAddRow = quickAddProductId != null ? rows.find(r => r.productId === quickAddProductId) : undefined

  return (
    <>
      <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
        <DialogContent size="xl" divided className="max-h-[85vh] grid-rows-[auto_1fr_auto]">
          <DialogHeader>
            <DialogTitle>พิมพ์ฉลากยา</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4 overflow-y-auto min-h-0 scrollbar-thin">

            {/* Language — one choice for the whole print run */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Languages className="size-4 text-muted-foreground" /> ภาษาฉลาก
              </div>
              <Select value={lang} onValueChange={v => setLang(v as LabelLang)}>
                <SelectTrigger className="h-9 w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANG_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Labeled products */}
            {labeledRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
                <Pill className="size-10 opacity-30" />
                <span className="text-sm">ยังไม่มีสินค้าที่ตั้งฉลากไว้ — เปิดสวิตช์ด้านล่างเพื่อเพิ่มฉลาก</span>
              </div>
            ) : (
              <div className="space-y-2">
                {labeledRows.map(r => (
                  <div key={r.productId} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                    <Checkbox
                      checked={r.checked}
                      onCheckedChange={v => patchRow(r.productId, { checked: !!v })}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                      {productName(r.product)}
                    </span>
                    <Select
                      value={String(r.selectedLabelId ?? '')}
                      onValueChange={v => patchRow(r.productId, { selectedLabelId: Number(v) })}
                    >
                      <SelectTrigger className="h-9 w-52 shrink-0">
                        <SelectValue placeholder="— เลือกฉลาก —" />
                      </SelectTrigger>
                      <SelectContent>
                        {r.labels.map(l => (
                          <SelectItem key={l.id} value={String(l.id)}>{l.label_name || 'ฉลากไม่มีชื่อ'}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min={1}
                      max={99}
                      value={r.copies}
                      onChange={e => {
                        const n = parseInt(e.target.value, 10)
                        patchRow(r.productId, { copies: Number.isNaN(n) ? 1 : Math.max(1, Math.min(99, n)) })
                      }}
                      className="h-9 w-20 shrink-0 text-center"
                      title="จำนวนสำเนา"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Switch — reveal products without a label */}
            <Toggle
              framed size="lg"
              checked={showNoLabel}
              onChange={setShowNoLabel}
              label="แสดงรายการที่ไม่มีฉลาก"
              className="justify-between w-full"
            />

            {showNoLabel && (
              noLabelRows.length === 0 ? (
                <div className="py-4 text-center text-sm text-muted-foreground">สินค้าในตะกร้ามีฉลากครบทุกตัวแล้ว</div>
              ) : (
                <div className="space-y-2">
                  {noLabelRows.map(r => (
                    <div key={r.productId} className="flex items-center gap-3 rounded-lg border border-dashed border-border px-3 py-2">
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{productName(r.product)}</span>
                      <Badge variant="neutral-outline" className="rounded-md shrink-0">ไม่มีฉลาก</Badge>
                      <Button variant="elevated" size="lg" className="h-9 shrink-0" onClick={() => setQuickAddProductId(r.productId)}>
                        <Plus className="size-4" /> เพิ่มฉลาก
                      </Button>
                    </div>
                  ))}
                </div>
              )
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="elevated" size="xl" onClick={onClose}>ยกเลิก</Button>
            <Button size="xl" onClick={handlePrint} disabled={checkedCount === 0 || printing}>
              <Printer className="size-4" /> {printing ? 'กำลังพิมพ์...' : `พิมพ์ (${checkedCount})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick-add: full label form, stacked on top of this dialog */}
      {quickAddRow && (
        <LabelFormDialog
          open={quickAddProductId != null}
          onOpenChange={v => { if (!v) setQuickAddProductId(null) }}
          productId={quickAddRow.productId}
          editingLabel={null}
          productBarcode={quickAddRow.product.barcode}
          lookups={lookups}
          onSaved={handleQuickAddSaved}
        />
      )}
    </>
  )
}
