import { useState, useRef } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { TabStrip } from '@/components/layout/TabStrip'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Store, Package, Printer, ShoppingCart, Save } from 'lucide-react'
import { ShopTab } from './ShopTab'
import { ProductMgmtTab } from './ProductMgmtTab'
import { LabelSettingsTab } from './LabelSettingsTab'
import { SalesTab } from './SalesTab'

export default function SettingsPage() {
  const [tab, setTab] = useState('shop')
  const salesSaveFn = useRef<() => void>()
  const [salesSaving, setSalesSaving] = useState(false)

  return (
    <div className="flex flex-col h-full px-8 pt-4 pb-4 gap-2">
      <PageHeader title="ตั้งค่า" />

      <TabStrip className="-mb-2">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList variant="segmented" className="h-10">
            <TabsTrigger value="shop"><Store /> ข้อมูลร้าน</TabsTrigger>
            <TabsTrigger value="product-mgmt"><Package /> จัดการสินค้า</TabsTrigger>
            <TabsTrigger value="sales"><ShoppingCart /> การขาย</TabsTrigger>
            <TabsTrigger value="labels"><Printer /> การพิมพ์ฉลาก</TabsTrigger>
          </TabsList>
        </Tabs>
        {tab === 'sales' && (
          <Button className="h-10 ml-auto" onClick={() => salesSaveFn.current?.()} disabled={salesSaving}>
            <Save className="size-4" />{salesSaving ? 'กำลังบันทึก...' : 'บันทึก'}
          </Button>
        )}
      </TabStrip>

      <div className="flex-1 min-h-0 overflow-y-auto pb-8 pt-3 [scrollbar-gutter:stable]">
        {tab === 'shop' && <ShopTab />}
        {tab === 'product-mgmt' && <ProductMgmtTab />}
        {tab === 'sales' && (
          <SalesTab
            registerSave={fn => { salesSaveFn.current = fn }}
            saving={salesSaving}
            setSaving={setSalesSaving}
          />
        )}
        {tab === 'labels' && <LabelSettingsTab />}
      </div>
    </div>
  )
}
