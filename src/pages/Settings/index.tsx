import { useState, useRef, useEffect } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Store, Tag, Ruler, Pill, Printer, ShoppingCart } from 'lucide-react'
import { ShopTab } from './ShopTab'
import { CategoriesTab } from './CategoriesTab'
import { UnitsTab } from './UnitsTab'
import { DrugTypesTab } from './DrugTypesTab'
import { LabelSettingsTab } from './LabelSettingsTab'
import { SalesTab } from './SalesTab'

export default function SettingsPage() {
  const [tab, setTab] = useState('shop')
  const tabsListRef = useRef<HTMLDivElement>(null)
  const [tabsWidth, setTabsWidth] = useState<number | null>(null)

  useEffect(() => {
    const el = tabsListRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setTabsWidth(el.offsetWidth))
    ro.observe(el)
    setTabsWidth(el.offsetWidth)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="flex flex-col h-full px-8 pt-4 pb-4 gap-2">
      <PageHeader title="ตั้งค่า" />

      <Tabs value={tab} onValueChange={setTab} className="shrink-0 self-start">
        <TabsList ref={tabsListRef}>
          <TabsTrigger value="shop"><Store /> ข้อมูลร้าน</TabsTrigger>
          <TabsTrigger value="categories"><Tag /> หมวดหมู่</TabsTrigger>
          <TabsTrigger value="units"><Ruler /> หน่วยนับ</TabsTrigger>
          <TabsTrigger value="drugtypes"><Pill /> ประเภทยา</TabsTrigger>
          <TabsTrigger value="sales"><ShoppingCart /> การขาย</TabsTrigger>
          <TabsTrigger value="labels"><Printer /> การพิมพ์ฉลาก</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex-1 min-h-0 overflow-y-auto pb-8 [scrollbar-gutter:stable]">
        {tab === 'shop' && <ShopTab width={tabsWidth} />}
        {tab === 'categories' && <CategoriesTab />}
        {tab === 'units' && <UnitsTab />}
        {tab === 'drugtypes' && <DrugTypesTab />}
        {tab === 'sales' && <SalesTab />}
        {tab === 'labels' && <LabelSettingsTab />}
      </div>
    </div>
  )
}
