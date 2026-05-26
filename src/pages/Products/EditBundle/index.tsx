import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MetricCard } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/toast'
import { PageHeader } from '@/components/layout/PageHeader'
import { ArrowLeft, FileText, Tag, Boxes, Pill, Save, Info, Coins, Package, History } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { ProductCategory, ItemUnit } from '@/types'
import type { FullProduct } from '../EditProduct/shared'
import { LabelsTab } from '../EditProduct/LabelsTab'
import { GeneralTab } from './GeneralTab'
import { PriceTab } from './PriceTab'
import { ComponentsTab, type DraftItem } from './ComponentsTab'
import { HistoryTab } from './HistoryTab'

// EditBundle is a slimmer EditProduct dedicated to is_bundle=1 products.
// Why a separate page (vs. a flag on EditProduct): bundles have a disjoint
// field set — no drug-info, no stock-alert, no FDA flags, no own lots — so
// rendering them in one form would mean half-disabled inputs. Two pages
// make the data model clearer and the UI sharper.
export default function EditBundlePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  // "new" mode = creating from scratch — no DB row exists yet. Atomic commit
  // on save (product + >=2 components in one transaction).
  const isNew = !id || id === 'new'
  const productId = isNew ? 0 : Number(id)

  const [tab, setTab] = useState('general')
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [product, setProduct] = useState<FullProduct | null>(null)
  const [form, setForm] = useState<any>(isNew
    ? {
        trade_name: '', name_for_print: '', code: '',
        barcode: '', barcode2: '', barcode3: '', barcode4: '',
        category_id: 0, unit_id: 0,
        price_retail: 0, price_wholesale1: 0, price_wholesale2: 0,
        has_vat: 0, search_keywords: '', note: '', is_disabled: 0,
      }
    : {})
  // New-mode only: components live here (controlled). Edit-mode: ComponentsTab
  // owns its own state and persists via products:saveBundleItems.
  const [draftItems, setDraftItems] = useState<DraftItem[]>([])
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
        has_vat: prod.has_vat ?? 0,
        search_keywords: prod.search_keywords ?? '',
        note: prod.note ?? '',
        is_disabled: prod.is_disabled ?? 0,
      })
    } finally {
      setLoading(false)
    }
  }

  const refreshProduct = async () => {
    const updated = await window.api.products.get(productId) as FullProduct
    setProduct(updated)
    // Sync editable fields that the server might have recomputed (cost_price).
    setForm((f: any) => ({ ...f, /* keep edits */ }))
  }

  const setF = (key: string, v: any) => setForm((f: any) => ({ ...f, [key]: v }))

  const handleSave = async () => {
    if (!form.trade_name?.trim()) {
      toast({ title: 'กรุณาระบุชื่อชุดสินค้า', variant: 'error' })
      // Bounce to General so the user sees what's missing.
      if (tab !== 'general') setTab('general')
      return
    }
    // New mode requires >=2 components in one shot (atomic create) — no
    // empty draft row ever lands in the DB.
    if (isNew && draftItems.length < 2) {
      toast({ title: 'ชุดสินค้าต้องมีรายการอย่างน้อย 2 รายการ', variant: 'error' })
      setTab('components')
      return
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
        has_vat: form.has_vat ? 1 : 0,
        search_keywords: form.search_keywords || null,
        note: form.note || null,
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
        toast({ title: 'สร้างชุดสินค้าสำเร็จ', variant: 'success' })
        // Replace history entry so back doesn't return to /new with stale state.
        navigate(`/products/bundles/${created.id}/edit`, { replace: true })
      } else {
        // Audit price changes BEFORE the generic update (same shape as
        // EditProduct save flow). products:update is a raw UPDATE with no
        // logging; products:updatePrice writes a price_logs row and self-
        // dedupes (skips when unchanged), so it must run while the column
        // still holds the old price.
        const priceNote = 'แก้ไขจากหน้าชุดสินค้า'
        await Promise.all([
          window.api.products.updatePrice(productId, { price_type: 'retail',     new_price: payload.price_retail,     note: priceNote }),
          window.api.products.updatePrice(productId, { price_type: 'wholesale1', new_price: payload.price_wholesale1, note: priceNote }),
          window.api.products.updatePrice(productId, { price_type: 'wholesale2', new_price: payload.price_wholesale2, note: priceNote }),
        ])
        await window.api.products.update(productId, { ...payload, code: form.code || null, is_bundle: 1, is_stock_item: 0 })
        toast({ title: 'บันทึกสำเร็จ', variant: 'success' })
        await refreshProduct()
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

  // In new mode `product` is null — derive stats from the in-memory form +
  // draftItems (cost = sum of component_cost * qty; recomputed live).
  const componentCount = isNew ? draftItems.length : (product!.bundle_items?.length ?? 0)
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
  const displayHasVat = isNew ? !!form.has_vat : !!product!.has_vat
  const displayDisabled = isNew ? !!form.is_disabled : !!product!.is_disabled

  return (
    <div className="flex flex-col h-full px-8 pt-4 pb-4 gap-2">
      <PageHeader
        title={form.trade_name || (isNew ? 'สร้างชุดสินค้าใหม่' : 'ชุดสินค้า')}
        right={
          <div className="flex items-center gap-2">
            <Button variant="primary-soft" size="lg" className="h-10 px-2" onClick={() => navigate('/products/bundles')}>
              <ArrowLeft className="size-4" /> ย้อนกลับ
            </Button>
            <Button
              size="lg"
              className="h-10 px-3"
              onClick={handleSave}
              disabled={saving || (isNew && draftItems.length < 2)}
              title={isNew && draftItems.length < 2 ? 'ต้องเพิ่มรายการอย่างน้อย 2 รายการก่อน' : undefined}
            >
              <Save className="size-4" /> {saving ? 'กำลังบันทึก...' : (isNew ? 'สร้างชุดสินค้า' : 'บันทึก')}
            </Button>
          </div>
        }
      />

      <Tabs value={tab} onValueChange={setTab} className="shrink-0 self-start">
        <TabsList variant="segmented" className="h-10">
          <TabsTrigger value="general"><FileText /> ข้อมูลทั่วไป</TabsTrigger>
          <TabsTrigger value="price"><Tag /> ราคา</TabsTrigger>
          <TabsTrigger value="components"><Boxes /> รายการ ({componentCount})</TabsTrigger>
          {!isNew && <TabsTrigger value="labels"><Pill /> ฉลาก ({labelCount})</TabsTrigger>}
          {!isNew && <TabsTrigger value="history"><History /> ความเคลื่อนไหว</TabsTrigger>}
        </TabsList>
      </Tabs>

      {/* 4 cards: meta + cost + price + components. Mirrors the EditProduct
          row but tailored to bundles — cost is auto from components, there
          are no own lots, so the 4th card is component count (click → tab). */}
      <div className="grid grid-cols-4 gap-3 shrink-0">
        {/* Meta card — hand-rolled to match MetricCard size="sm" proportions */}
        <div className="bg-card rounded-card shadow-card px-4 py-2 flex items-center gap-3 overflow-hidden">
          <div className="flex flex-col min-w-0 flex-1 text-left">
            <div
              className="text-base font-bold text-foreground truncate"
              title={displayName}
            >
              {displayName}
            </div>
            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
              <span className="text-sm text-muted-foreground font-mono shrink-0">{displayCode ?? '—'}</span>
              <span className="text-sm text-muted-foreground shrink-0">·</span>
              <span className="text-sm text-muted-foreground truncate">{categoryName ?? 'ไม่ระบุ'}</span>
              <Badge variant="brand-soft" className="text-xs rounded-md px-1.5 py-0">ชุดสินค้า</Badge>
              {isNew && <Badge variant="warning" className="text-xs rounded-md px-1.5 py-0">ยังไม่บันทึก</Badge>}
              {displayHasVat && <Badge variant="info-soft" className="text-xs rounded-md px-1.5 py-0">VAT</Badge>}
              {displayDisabled && <Badge variant="destructive" className="text-xs rounded-md px-1.5 py-0">ปิดใช้งาน</Badge>}
            </div>
          </div>
          <span className="grid place-items-center size-11 rounded-xl bg-primary-soft text-primary shrink-0">
            <Info className="size-7" />
          </span>
        </div>

        <MetricCard
          size="sm"
          label="ต้นทุนรวม"
          value={formatCurrency(cost)}
          unit={baseUnit !== '—' ? `/ ${baseUnit}` : undefined}
          icon={Coins}
          tint="warm"
        />
        <MetricCard
          size="sm"
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
          size="sm"
          label="รายการ"
          value={componentCount.toLocaleString()}
          unit={componentCount > 0 ? 'รายการ' : undefined}
          sub="คลิกเพื่อแก้ไข"
          icon={Package}
          tint={componentCount === 0 ? 'destructive' : 'info-soft'}
          onClick={() => setTab('components')}
        />
      </div>

      {/* Same scroll model as EditProduct: form tabs (general/price) use an
          outer overflow-y-auto wrapper; table tabs (components/labels) own
          their internal sticky-header scroll, so they get flex-col only. */}
      <div className="flex-1 min-h-0 flex flex-col [scrollbar-gutter:stable]">
        {tab === 'components' ? (
          <div className="flex-1 min-h-0 flex flex-col">
            <ComponentsTab
              product={product}
              productId={isNew ? null : productId}
              onRefresh={refreshProduct}
              controlledItems={isNew ? draftItems : undefined}
              onControlledItemsChange={isNew ? setDraftItems : undefined}
            />
          </div>
        ) : tab === 'labels' && !isNew ? (
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
          <div className="flex-1 min-h-0 overflow-y-auto pb-8">
            {tab === 'general' && (
              <GeneralTab
                form={form}
                setF={setF}
                categories={categories}
                itemUnits={itemUnits}
              />
            )}
            {tab === 'price' && (
              <PriceTab
                form={form}
                setF={setF}
                product={product}
                productId={productId}
                isNew={isNew}
                reloadToken={(product as any)?.updated_at ?? ''}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
