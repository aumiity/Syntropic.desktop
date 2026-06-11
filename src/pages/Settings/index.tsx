import { useState, useRef, type ReactNode } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { TabStrip } from '@/components/layout/TabStrip'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Store, FolderTree, Printer, ShoppingCart, Save, Database, Blocks, Stethoscope } from 'lucide-react'
import { ShopTab } from './ShopTab'
import { ProductMgmtTab } from './ProductMgmtTab'
import { UnitsTab } from './UnitsTab'
import { DrugUsageTab } from './DrugUsageTab'
import { PrintersTab } from './PrintersTab'
import { SalesTab } from './SalesTab'
import { DatabaseTab } from './DatabaseTab'

export default function SettingsPage() {
  const [tab, setTab] = useState('shop')
  const salesSaveFn = useRef<() => void>()
  const [salesSaving, setSalesSaving] = useState(false)
  // The active การพิมพ์ sub-tab forwards its บันทึก button up here so it lands on
  // the MAIN tab row (same spot as the การขาย save button), not the sub-tab strip.
  const [printersActions, setPrintersActions] = useState<ReactNode>(null)

  return (
    <div className="flex flex-col h-full px-8 pt-4 pb-4 gap-2">
      <PageHeader title="ตั้งค่า" />

      <TabStrip className="-mb-2">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList variant="segmented">
            <TabsTrigger value="shop"><Store /> ข้อมูลร้าน</TabsTrigger>
            <TabsTrigger value="sales"><ShoppingCart /> การขาย</TabsTrigger>
            <TabsTrigger value="product-mgmt"><FolderTree /> หมวดหมู่และประเภท</TabsTrigger>
            <TabsTrigger value="units"><Blocks /> หน่วยนับ</TabsTrigger>
            <TabsTrigger value="drug-usage"><Stethoscope /> วิธีใช้</TabsTrigger>
            <TabsTrigger value="printers"><Printer /> การพิมพ์</TabsTrigger>
            <TabsTrigger value="database"><Database /> ฐานข้อมูล</TabsTrigger>
          </TabsList>
        </Tabs>
        {tab === 'sales' && (
          <Button className="h-10 ml-auto" onClick={() => salesSaveFn.current?.()} disabled={salesSaving}>
            <Save className="size-4" />{salesSaving ? 'กำลังบันทึก...' : 'บันทึก'}
          </Button>
        )}
        {tab === 'printers' && printersActions && (
          <div className="ml-auto flex items-center gap-2">{printersActions}</div>
        )}
      </TabStrip>

      <div className="flex-1 min-h-0 overflow-y-auto pb-8 pt-3 [scrollbar-gutter:stable]">
        {tab === 'shop' && <ShopTab />}
        {tab === 'product-mgmt' && <ProductMgmtTab />}
        {tab === 'units' && <UnitsTab />}
        {tab === 'drug-usage' && <DrugUsageTab />}
        {tab === 'sales' && (
          <SalesTab
            registerSave={fn => { salesSaveFn.current = fn }}
            saving={salesSaving}
            setSaving={setSalesSaving}
          />
        )}
        {tab === 'printers' && <PrintersTab onActions={setPrintersActions} />}
        {tab === 'database' && <DatabaseTab />}
      </div>
    </div>
  )
}
