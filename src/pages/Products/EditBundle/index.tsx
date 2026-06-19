import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MetricCard } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { useManagerOverride } from '@/hooks/useManagerOverride'
import { TintIcon } from '@/components/ui/tint-icon'
import { PageHeader } from '@/components/layout/PageHeader'
import { TabStrip } from '@/components/layout/TabStrip'
import { ArrowLeft, FileText, Pill, Save, Info, Coins, Package, History, Tag } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { ProductCategory, ItemUnit, ProductBundleItem } from '@/types'
import type { FullProduct } from '../EditProduct/shared'
import { LabelsTab } from '../EditProduct/LabelsTab'
import { GeneralTab } from './GeneralTab'
import { ComponentsTab, type DraftItem } from './ComponentsTab'
import { HistoryTab } from './HistoryTab'
import { usePublishDevTab } from '@/stores/devTabStore'

// Map saved bundle_items → the in-progress DraftItem shape ComponentsTab edits.
// Module-scope pure helper (not a component) — keeps loadAll/refreshProduct
// seeding in one place without duplicating the mapping.
function seedDraftItems(prod: FullProduct): DraftItem[] {
  return (prod.bundle_items ?? []).map((bi: ProductBundleItem) => ({
    component_product_id: bi.component_product_id,
    component_name: bi.component_name ?? '—',
    component_unit_name: bi.component_unit_name,
    component_cost: Number(bi.component_cost ?? 0),
    component_sell_price: Number(bi.component_sell_price ?? 0),
    component_stock: Number(bi.component_stock ?? 0),
    qty_per_bundle: Number(bi.qty_per_bundle ?? 1),
  }))
}

const REQUIRED_FIELDS = ['trade_name', 'unit_id', 'price_retail'] as const
const REQUIRED_LABEL: Record<string, string> = {
  trade_name: 'ชื่อชุดสินค้า',
  unit_id: 'หน่วยหลัก',
  price_retail: 'ราคาขายปลีก',
}

// EditBundle is a slimmer EditProduct dedicated to is_bundle=1 products.
// Why a separate page (vs. a flag on EditProduct): bundles have a disjoint
// field set — no drug-info, no stock-alert, no FDA flags, no own lots — so
// rendering them in one form would mean half-disabled inputs. Two pages
// make the data model clearer and the UI sharper.
export default function EditBundlePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { toast } = useToast()
  // location.key === 'default' = direct URL / refresh, no history to pop.
  const backToOrigin = () => {
    if (location.key === 'default') navigate('/products/bundles')
    else navigate(-1)
  }
  // "new" mode = creating from scratch — no DB row exists yet. Atomic commit
  // on save (product + >=2 components in one transaction).
  const isNew = !id || id === 'new'
  const productId = isNew ? 0 : Number(id)

  // The "ข้อมูล & รายการ" view (key 'general') stacks the form + the components
  // table in one vertical scroll, so the operator sees both the prices and the
  // auto-summed component cost without tab-hopping. New mode locks to it (no tab
  // strip — single view); edit mode adds ฉลาก / ความเคลื่อนไหว tabs.
  const [tab, setTab] = useState('general')
  usePublishDevTab(tab) // DEV ONLY — surfaces open sub-tab file in TitleBar path
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const overridePrice = useManagerOverride()
  const [product, setProduct] = useState<FullProduct | null>(null)
  const [form, setForm] = useState<any>(isNew
    ? {
        trade_name: '', name_for_print: '', code: '',
        barcode: '', barcode2: '', barcode3: '', barcode4: '',
        category_id: 0, unit_id: 0,
        price_retail: 0, price_wholesale1: 0, price_wholesale2: 0,
        default_qty: 1,
        search_keywords: '', is_disabled: 0,
      }
    : {})
  const [errors, setErrors] = useState<Set<string>>(new Set())
  const [isDirty, setIsDirty] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  // Components draft — controlled in BOTH modes now. New mode commits it via
  // createBundle; edit mode via saveBundleItems (appended to the unified save).
  const [draftItems, setDraftItems] = useState<DraftItem[]>([])
  // Anchor for scrolling to the components table (replaces the old tab jump).
  const componentsRef = useRef<HTMLDivElement>(null)
  const scrollToComponents = () => componentsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [itemUnits, setItemUnits] = useState<ItemUnit[]>([])
  const [labelFrequencies, setLabelFrequencies] = useState<any[]>([])
  const [labelDosages, setLabelDosages] = useState<any[]>([])
  const [labelMealRelations, setLabelMealRelations] = useState<any[]>([])
  const [labelTimes, setLabelTimes] = useState<any[]>([])
  const [labelAdvices, setLabelAdvices] = useState<any[]>([])

  useEffect(() => { loadAll() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [productId, isNew])

  const loadAll = async () => {
    // In new mode we still need lookup tables (categories/units) but skip
    // products.get + label lookups (Labels tab is hidden until first save).
    if (isNew) {
      const [cats, units] = await Promise.all([
        window.api.settings.allCategories(),
        window.api.settings.allUnits(),
      ])
      setCategories(cats as ProductCategory[])
      setItemUnits(units as ItemUnit[])
      // Default unit = "ชุด" if present (most natural for a bundle).
      const bundleUnit = (units as ItemUnit[]).find(u => u.name === 'ชุด')
                     ?? (units as ItemUnit[])[0]
      if (bundleUnit) setForm((f: any) => ({ ...f, unit_id: bundleUnit.id }))
      return
    }
    setLoading(true)
    try {
      const [p, cats, units, freqs, dosages, meals, times, advices] = await Promise.all([
        window.api.products.get(productId),
        window.api.settings.allCategories(),
        window.api.settings.allUnits(),
        window.api.settings.listLabelFrequencies(),
        window.api.settings.listLabelDosages(),
        window.api.settings.listLabelMealRelations(),
        window.api.settings.listLabelTimes(),
        window.api.settings.listLabelAdvices(),
      ])
      if (!p) { navigate('/products/bundles'); return }
      const prod = p as FullProduct
      // Reciprocal guard: if the row isn't actually a bundle, bounce back
      // to EditProduct so the user doesn't edit it with the wrong form.
      if (prod.is_bundle !== 1) {
        navigate(`/products/${productId}/edit`, { replace: true })
        return
      }
      setProduct(prod)
      // Seed the components draft from the saved bundle_items. Raw setter (NOT
      // handleItemsChange) so the freshly-loaded list never flips isDirty.
      setDraftItems(seedDraftItems(prod))
      setCategories(cats as ProductCategory[])
      setItemUnits(units as ItemUnit[])
      setLabelFrequencies(freqs as any[])
      setLabelDosages(dosages as any[])
      setLabelMealRelations(meals as any[])
      setLabelTimes(times as any[])
      setLabelAdvices(advices as any[])
      setForm({
        trade_name: prod.trade_name ?? '',
        name_for_print: prod.name_for_print ?? '',
        code: prod.code ?? '',
        barcode: prod.barcode ?? '',
        barcode2: prod.barcode2 ?? '',
        barcode3: prod.barcode3 ?? '',
        barcode4: prod.barcode4 ?? '',
        category_id: prod.category_id ?? 0,
        unit_id: prod.unit_id ?? 0,
        price_retail: prod.price_retail ?? 0,
        price_wholesale1: prod.price_wholesale1 ?? 0,
        price_wholesale2: prod.price_wholesale2 ?? 0,
        default_qty: prod.default_qty ?? 1,
        search_keywords: prod.search_keywords ?? '',
        is_disabled: prod.is_disabled ?? 0,
      })
    } finally {
      setLoading(false)
    }
  }

  const refreshProduct = async () => {
    // cost_price is server-recomputed (recomputeBundleCost) but it isn't
    // managed in `form` — display reads it from `product.cost_price` directly,
    // so only the product snapshot needs refreshing.
    const updated = await window.api.products.get(productId) as FullProduct
    setProduct(updated)
    // Re-seed the components draft from the persisted result. Raw setter (NOT
    // handleItemsChange) so the post-save reload never re-flips isDirty.
    setDraftItems(seedDraftItems(updated))
  }

  const setF = (key: string, v: any) => {
    setForm((f: any) => ({ ...f, [key]: v }))
    setIsDirty(true)
    setErrors(prev => {
      if (!prev.has(key)) return prev
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }

  // Components edits flow through here so any add/remove/qty change marks the
  // page dirty (the seed paths use setDraftItems raw to avoid a false dirty).
  const handleItemsChange = (next: DraftItem[]) => {
    setDraftItems(next)
    setIsDirty(true)
  }

  // Returns the set of required-field keys missing/invalid (matches EditProduct).
  const validate = (): Set<string> => {
    const missing = new Set<string>()
    if (!form.trade_name?.trim()) missing.add('trade_name')
    if (!form.unit_id || Number(form.unit_id) <= 0) missing.add('unit_id')
    const retail = parseFloat(form.price_retail)
    if (!form.price_retail || Number.isNaN(retail) || retail <= 0) missing.add('price_retail')
    return missing
  }

  // beforeunload guard. In-app nav uses goBack() with the leave-confirm dialog.
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const goBack = () => {
    if (isDirty) { setShowLeaveConfirm(true); return }
    backToOrigin()
  }

  const handleSave = async () => {
    const missing = validate()
    if (missing.size > 0) {
      setErrors(missing)
      const labels = REQUIRED_FIELDS.filter(k => missing.has(k)).map(k => REQUIRED_LABEL[k])
      toast({ title: 'กรุณากรอกข้อมูลที่จำเป็น', description: labels.join(', '), variant: 'error' })
      const first = REQUIRED_FIELDS.find(k => missing.has(k))
      if (first) {
        setTimeout(() => {
          const el = document.querySelector(`[data-field="${first}"]`) as HTMLElement | null
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          ;(el?.querySelector('input, button') as HTMLElement | null)?.focus()
        }, 60)
      }
      return
    }
    // A bundle needs >=2 components (atomic create OR an edit save) — no empty
    // or single-line bundle ever persists. Same rule in both modes now.
    if (draftItems.length < 2) {
      toast({ title: 'ชุดสินค้าต้องมีรายการอย่างน้อย 2 รายการ', variant: 'error' })
      scrollToComponents()
      return
    }
    // Every component must carry a positive qty-per-bundle (moved here from
    // ComponentsTab.handleSave when the per-tab save was removed).
    for (const it of draftItems) {
      if (!it.qty_per_bundle || it.qty_per_bundle <= 0) {
        toast({ title: `จำนวนต่อชุดของ "${it.component_name}" ต้องมากกว่า 0`, variant: 'error' })
        scrollToComponents()
        return
      }
    }
    setSaving(true)
    try {
      // Explicit allow-list (NOT ...rest) — only fields a bundle uses go to
      // the IPC. is_bundle / is_stock_item are forced; cost_price is read-only
      // (recomputed by recomputeBundleCost on saveBundleItems).
      const payload: Record<string, any> = {
        trade_name: form.trade_name,
        name_for_print: form.name_for_print || null,
        barcode: form.barcode || null,
        barcode2: form.barcode2 || null,
        barcode3: form.barcode3 || null,
        barcode4: form.barcode4 || null,
        category_id: form.category_id || null,
        unit_id: form.unit_id || null,
        price_retail: parseFloat(form.price_retail) || 0,
        price_wholesale1: parseFloat(form.price_wholesale1) || 0,
        price_wholesale2: parseFloat(form.price_wholesale2) || 0,
        // Starting cart qty in POS — never blank→0 (qty must be ≥1); fallback 1.
        default_qty: parseFloat(String(form.default_qty)) > 0 ? parseFloat(String(form.default_qty)) : 1,
        search_keywords: form.search_keywords || null,
        is_disabled: form.is_disabled ? 1 : 0,
      }
      if (isNew) {
        const created: any = await window.api.products.createBundle({
          product: payload,
          items: draftItems.map(it => ({
            component_product_id: it.component_product_id,
            qty_per_bundle: it.qty_per_bundle,
          })),
        })
        setIsDirty(false)
        toast({ title: 'สร้างชุดสินค้าสำเร็จ', variant: 'success' })
        // Replace history entry so back doesn't return to /new with stale state.
        navigate(`/products/bundles/${created.id}/edit`, { replace: true })
      } else {
        // Audit price changes BEFORE the generic update (same shape as
        // EditProduct save flow). updatePrice is admin-only (override): only
        // call it for prices that ACTUALLY changed so a staff edit of non-price
        // fields never trips the override prompt.
        const priceNote = 'แก้ไขจากหน้าชุดสินค้า'
        const priceChanges: Array<{ price_type: 'retail' | 'wholesale1' | 'wholesale2'; new_price: number }> = []
        if ((Number(product?.price_retail) || 0) !== payload.price_retail) priceChanges.push({ price_type: 'retail', new_price: payload.price_retail })
        if ((Number(product?.price_wholesale1) || 0) !== payload.price_wholesale1) priceChanges.push({ price_type: 'wholesale1', new_price: payload.price_wholesale1 })
        if ((Number(product?.price_wholesale2) || 0) !== payload.price_wholesale2) priceChanges.push({ price_type: 'wholesale2', new_price: payload.price_wholesale2 })

        const updatePayload = { ...payload, code: form.code || null, is_bundle: 1, is_stock_item: 0 }
        // Items payload for saveBundleItems — only the two columns the backend
        // takes (it deletes+reinserts + recomputeBundleCost in one transaction).
        const itemsPayload = draftItems.map(it => ({
          component_product_id: it.component_product_id,
          qty_per_bundle: it.qty_per_bundle,
        }))
        const finishSave = async () => {
          setIsDirty(false)
          toast({ title: 'บันทึกสำเร็จ', variant: 'success' })
          // refreshProduct re-seeds draftItems from the persisted result.
          await refreshProduct()
        }

        if (priceChanges.length > 0) {
          overridePrice.run(
            // update BEFORE saveBundleItems: recomputeBundleCost (inside
            // saveBundleItems) writes cost_price last, so it isn't clobbered by
            // the generic update's column write.
            async (ov) => {
              await Promise.all(priceChanges.map(c =>
                window.api.products.updatePrice(productId, { ...c, note: priceNote }, ov)))
              await window.api.products.update(productId, updatePayload)
              await window.api.products.saveBundleItems(productId, itemsPayload)
            },
            {
              title: 'แก้ไขราคาขาย',
              onDone: () => { setSaving(false); finishSave() },
              onError: (e: any) => { setSaving(false); toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' }) },
            },
          )
          if (!overridePrice.isAdmin) setSaving(false)
          return
        }

        await window.api.products.update(productId, updatePayload)
        await window.api.products.saveBundleItems(productId, itemsPayload)
        await finishSave()
      }
    } catch (e: any) {
      toast({ title: isNew ? 'สร้างไม่สำเร็จ' : 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  if (!isNew && (loading || !product)) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        กำลังโหลด...
      </div>
    )
  }

  // Components draft drives the count in both modes (it's seeded from the
  // saved bundle_items on load and tracks live edits before save).
  const componentCount = draftItems.length
  const labelCount = isNew ? 0 : (product!.labels?.length ?? 0)

  // Derived stats for the 4-card row (mirrors EditProduct). Bundles have no
  // last_cost_price / own lots — cost_price is auto-computed from components
  // (recomputeBundleCost), so it's the right number for the cost card.
  const baseUnit = isNew
    ? (itemUnits.find(u => u.id === form.unit_id)?.name ?? '—')
    : (product!.unit_name ?? itemUnits.find(u => u.id === product!.unit_id)?.name ?? '—')
  const categoryName = categories.find(c => c.id === (isNew ? form.category_id : product!.category_id))?.name
  const cost = isNew
    ? draftItems.reduce((s, it) => s + it.component_cost * it.qty_per_bundle, 0)
    : (Number(product!.cost_price) || 0)
  const retail = isNew ? (Number(form.price_retail) || 0) : (Number(product!.price_retail) || 0)
  const profit = retail - cost
  const profitPct = cost > 0 ? (profit / cost) * 100 : 0

  const displayName = isNew ? (form.trade_name || 'ชุดสินค้าใหม่') : (product!.trade_name)
  const displayCode = isNew ? null : product!.code
  const displayDisabled = isNew ? !!form.is_disabled : !!product!.is_disabled

  return (
    <div className="flex flex-col h-full px-8 pt-4 pb-4 gap-2">
      <PageHeader title={isNew ? 'สร้างชุดสินค้าใหม่' : 'ชุดสินค้า'} />

      <TabStrip className="-mb-2">
        {/* New mode = single "ข้อมูล & รายการ" view, no tab strip (the form +
            components table stack in one scroll). Edit mode adds ฉลาก /
            ความเคลื่อนไหว tabs; the first tab now holds both form + components. */}
        {!isNew && (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList variant="segmented">
              <TabsTrigger value="general"><FileText /> ข้อมูล &amp; รายการ</TabsTrigger>
              <TabsTrigger value="labels"><Pill /> ฉลาก ({labelCount})</TabsTrigger>
              <TabsTrigger value="history"><History /> ความเคลื่อนไหว</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="primary-soft" size="lg" className="h-10 px-2" onClick={goBack}>
            <ArrowLeft className="size-4" /> ย้อนกลับ
          </Button>
          {/* Single Save commits the product + components together. Shown on the
              "ข้อมูล & รายการ" view (always, in new mode — tab is locked there). */}
          {tab === 'general' && (
            <Button
              size="lg"
              className="h-10 px-3"
              onClick={handleSave}
              disabled={saving || draftItems.length < 2}
              title={draftItems.length < 2 ? 'ต้องเพิ่มรายการอย่างน้อย 2 รายการก่อน' : undefined}
            >
              <Save className="size-4" /> {saving ? 'กำลังบันทึก...' : (isNew ? 'สร้างชุดสินค้า' : 'บันทึก')}
            </Button>
          )}
        </div>
      </TabStrip>

      {/* 4 cards: meta + cost + price + components. Layout mirrors
          EditProduct's top row (default-size h-32 cards, absolute-icon meta
          card with badges-at-bottom). Bundle differs from product in three
          ways: (1) cost is auto-summed from components (no "ล่าสุด"/"เฉลี่ย"
          concept — sub line stays blank); (2) badges are bundle-specific
          (ชุดสินค้า / ยังไม่บันทึก / VAT / ปิดใช้งาน); (3) the 4th card is
          component count (click → tab), not stock-on-hand (bundles own no
          lots). Live-value preview in new mode is intentionally preserved —
          drafted cost / retail / count give the operator immediate feedback
          before save, which EditProduct can't do (no values exist there yet). */}
      <div className="shrink-0 pt-3">
        <div className="grid grid-cols-4 gap-3 p-0.5">
        {/* Meta card — hand-rolled to match MetricCard default-size proportions
            (h-32, icon absolute top-right). Badges row sits at the bottom via
            mt-auto so the layout matches EditProduct's meta card pixel-for-pixel. */}
        <div className="bg-card rounded-card p-4 pt-3 shadow-card border border-border h-32 overflow-hidden relative">
          <TintIcon
            icon={Info}
            tint="primary"
            size="lg"
            bordered
            className={`absolute top-4 right-4 z-10 ${isNew ? 'opacity-50' : ''}`}
          />
          <div className="pr-10 min-w-0 relative z-10 h-full flex flex-col justify-start">
            <div
              className="text-base font-bold text-foreground truncate"
              title={displayName}
            >
              {displayName}
            </div>
            <div className="flex items-center gap-1.5 mt-1 min-w-0 text-sm h-[30px]">
              <span className="text-muted-foreground shrink-0">{displayCode ?? '—'}</span>
              <span className="text-muted-foreground shrink-0">·</span>
              <span className="text-muted-foreground truncate">{categoryName ?? 'ไม่ระบุ'}</span>
            </div>
            <div className="flex items-center gap-1 mt-auto min-w-0 flex-wrap">
              <Badge variant="primary-outline">ชุดสินค้า</Badge>
              {isNew && <Badge variant="amber-outline">ยังไม่บันทึก</Badge>}
              {displayDisabled && <Badge variant="destructive-outline">ปิดใช้งาน</Badge>}
            </div>
          </div>
        </div>

        <MetricCard
          label="ราคาทุน"
          value={formatCurrency(cost)}
          unit={baseUnit !== '—' ? `/ ${baseUnit}` : undefined}
          icon={Coins}
          tint="amber"
        />
        <MetricCard
          label="ราคาขาย"
          value={formatCurrency(retail)}
          valueClassName={'text-foreground'}
          unit={baseUnit !== '—' ? `/ ${baseUnit}` : undefined}
          sub={cost > 0
            ? `กำไร ${profit >= 0 ? '+' : ''}${profit.toFixed(2)} (${profit >= 0 ? '+' : ''}${profitPct.toFixed(0)}%)`
            : undefined}
          subClassName={profit < 0 ? 'text-destructive' : undefined}
          icon={Tag}
          tint="success"
        />
        <MetricCard
          label="รายการ"
          value={componentCount.toLocaleString()}
          unit={componentCount > 0 ? 'รายการ' : undefined}
          // New-mode hint: explain the 2-item minimum that gates the create
          // button (sub turns red automatically via the destructive tint).
          sub={isNew && componentCount < 2 ? 'ต้องมีอย่างน้อย 2 รายการ' : 'คลิกเพื่อไปยังรายการ'}
          icon={Package}
          tint={componentCount < 2 ? 'destructive' : 'info-soft'}
          onClick={scrollToComponents}
        />
        </div>
      </div>

      {/* "ข้อมูล & รายการ" stacks the form + the components table in one outer
          scroll (form on top, full-width table below). Labels / history keep
          their own internal sticky-header scroll, so they get flex-col only. */}
      <div className="flex-1 min-h-0 flex flex-col [scrollbar-gutter:stable]">
        {tab === 'labels' && !isNew ? (
          <div className="flex-1 min-h-0 flex flex-col">
            <LabelsTab
              product={product!}
              productId={productId}
              labelFrequencies={labelFrequencies}
              labelDosages={labelDosages}
              labelMealRelations={labelMealRelations}
              labelTimes={labelTimes}
              labelAdvices={labelAdvices}
              onRefresh={refreshProduct}
            />
          </div>
        ) : tab === 'history' && !isNew ? (
          <div className="flex-1 min-h-0 flex flex-col">
            <HistoryTab
              productId={productId}
              isNew={isNew}
              active={tab === 'history'}
            />
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin [scrollbar-gutter:stable] pt-4 pb-8 flex flex-col">
            <GeneralTab
              form={form}
              setF={setF}
              errors={errors}
              categories={categories}
              itemUnits={itemUnits}
              product={product}
              productId={productId}
              isNew={isNew}
              reloadToken={(product as any)?.updated_at ?? ''}
            />
            <div ref={componentsRef}>
              <ComponentsTab
                productId={isNew ? null : productId}
                controlledItems={draftItems}
                onControlledItemsChange={handleItemsChange}
              />
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={showLeaveConfirm}
        onOpenChange={setShowLeaveConfirm}
        variant="destructive"
        title="ยังไม่ได้บันทึก"
        description="มีข้อมูลที่กรอกไว้แต่ยังไม่ได้บันทึก หากออกตอนนี้ข้อมูลทั้งหมดจะหายไป"
        cancelLabel="กลับไปแก้ไข"
        confirmLabel="ออกจากหน้านี้"
        onConfirm={() => { setShowLeaveConfirm(false); setIsDirty(false); backToOrigin() }}
      />
      {overridePrice.dialog}
    </div>
  )
}
