import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Store, Tag, Ruler, Pill, Printer } from 'lucide-react'
import { ShopTab } from './ShopTab'
import { CategoriesTab } from './CategoriesTab'
import { UnitsTab } from './UnitsTab'
import { DrugTypesTab } from './DrugTypesTab'
import { LabelSettingsTab } from './LabelSettingsTab'

export default function SettingsPage() {
  const [tab, setTab] = useState('shop')

  return (
    <div className="flex flex-col h-full px-8 pt-10 pb-4 gap-3">
      <PageHeader title="ตั้งค่า" />

      <div className="flex-1 min-h-0 overflow-y-auto pb-8 [scrollbar-gutter:stable]">
        <Tabs value={tab} onValueChange={setTab} className="items-center">
          <TabsList>
            <TabsTrigger value="shop"><Store /> ข้อมูลร้าน</TabsTrigger>
            <TabsTrigger value="categories"><Tag /> หมวดหมู่</TabsTrigger>
            <TabsTrigger value="units"><Ruler /> หน่วยนับ</TabsTrigger>
            <TabsTrigger value="drugtypes"><Pill /> ประเภทยา</TabsTrigger>
            <TabsTrigger value="labels"><Printer /> การพิมพ์ฉลาก</TabsTrigger>
          </TabsList>
        </Tabs>

        {tab === 'shop' && <ShopTab />}
        {tab === 'categories' && <CategoriesTab />}
        {tab === 'units' && <UnitsTab />}
        {tab === 'drugtypes' && <DrugTypesTab />}
        {tab === 'labels' && <LabelSettingsTab />}
      </div>
    </div>
  )
}
