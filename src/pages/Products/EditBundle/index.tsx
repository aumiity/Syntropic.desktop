import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/toast'
import { PageHeader } from '@/components/layout/PageHeader'
import { ArrowLeft, FileText, Tag, Boxes, Pill, Save } from 'lucide-react'
import type { ProductCategory, ItemUnit } from '@/types'
import type { FullProduct } from '../EditProduct/shared'
import { LabelsTab } from '../EditProduct/LabelsTab'
import { GeneralTab } from './GeneralTab'
import { PriceTab } from './PriceTab'
import { ComponentsTab } from './ComponentsTab'

// EditBundle is a slimmer EditProduct dedicated to is_bundle=1 products.
// Why a separate page (vs. a flag on EditProduct): bundles have a disjoint
// field set — no drug-info, no stock-alert, no FDA flags, no own lots — so
// rendering them in one form would mean half-disabled inputs. Two pages
// make the data model clearer and the UI sharper.
export default function EditBundlePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const productId = Number(id)

  const [tab, setTab] = useState('general')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [product, setProduct] = useState<FullProduct | null>(null)
  const [form, setForm] = useState<any>({})
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [itemUnits, setItemUnits] = useState<ItemUnit[]>([])
  const [labelFrequencies, setLabelFrequencies] = useState<any[]>([])
  const [labelDosages, setLabelDosages] = useState<any[]>([])
  const [labelMealRelations, setLabelMealRelations] = useState<any[]>([])
  const [labelTimes, setLabelTimes] = useState<any[]>([])
  const [labelAdvices, setLabelAdvices] = useState<any[]>([])

  useEffect(() => { loadAll() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [productId])

  const loadAll = async () => {
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
        code: form.code || null,
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
        is_bundle: 1,
        is_stock_item: 0,
      }
      await window.api.products.update(productId, payload)
      toast({ title: 'บันทึกสำเร็จ', variant: 'success' })
      await refreshProduct()
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  if (loading || !product) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        กำลังโหลด...
      </div>
    )
  }

  const componentCount = product.bundle_items?.length ?? 0
  const labelCount = product.labels?.length ?? 0

  return (
    <div className="flex flex-col h-full px-8 pt-10 pb-4 gap-3">
      <PageHeader
        title={form.trade_name || 'ชุดสินค้า'}
        right={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="lg" onClick={() => navigate('/products/bundles')} className="h-10 px-2">
              <ArrowLeft className="size-4" /> กลับ
            </Button>
            <Button size="lg" onClick={handleSave} disabled={saving} className="h-10 px-3">
              <Save className="size-4" /> {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
          </div>
        }
      />

      <Tabs value={tab} onValueChange={setTab} className="items-center shrink-0">
        <TabsList>
          <TabsTrigger value="general"><FileText /> ข้อมูลทั่วไป</TabsTrigger>
          <TabsTrigger value="price"><Tag /> ราคา</TabsTrigger>
          <TabsTrigger value="components"><Boxes /> ส่วนประกอบ ({componentCount})</TabsTrigger>
          <TabsTrigger value="labels"><Pill /> ฉลาก ({labelCount})</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="w-full mt-3">
          <GeneralTab
            form={form}
            setF={setF}
            categories={categories}
            itemUnits={itemUnits}
          />
        </TabsContent>

        <TabsContent value="price" className="w-full mt-3">
          <PriceTab form={form} setF={setF} product={product} />
        </TabsContent>

        <TabsContent value="components" className="w-full mt-3 flex-1 min-h-0 flex flex-col">
          <ComponentsTab
            product={product}
            productId={productId}
            onRefresh={refreshProduct}
          />
        </TabsContent>

        <TabsContent value="labels" className="w-full mt-3 flex-1 min-h-0 flex flex-col">
          <LabelsTab
            product={product}
            productId={productId}
            labelFrequencies={labelFrequencies}
            labelDosages={labelDosages}
            labelMealRelations={labelMealRelations}
            labelTimes={labelTimes}
            labelAdvices={labelAdvices}
            onRefresh={refreshProduct}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
