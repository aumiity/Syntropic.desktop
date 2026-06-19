import { useState, useRef, type ReactNode } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { TabStrip } from '@/components/layout/TabStrip'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Store, FolderTree, Printer, ShoppingCart, Save, Database, Blocks, Stethoscope, Thermometer } from 'lucide-react'
import { ShopTab } from './ShopTab'
import { ProductMgmtTab } from './ProductMgmtTab'
import { UnitsTab } from './UnitsTab'
import { DrugUsageTab } from './DrugUsageTab'
import { PrintersTab } from './PrintersTab'
import { SalesTab } from './SalesTab'
import { EnvironmentTab } from './EnvironmentTab'
import { DatabaseTab } from './DatabaseTab'
import { usePublishDevTab } from '@/stores/devTabStore'

export default function SettingsPage() {
  const [tab, setTab] = useState('shop')
  usePublishDevTab(tab) // DEV ONLY — surfaces open sub-tab file in TitleBar path
  const salesSaveFn = useRef<() => void>()
  const [salesSaving, setSalesSaving] = useState(false)
  const envSaveFn = useRef<() => void>()
  const [envSaving, setEnvSaving] = useState(false)
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
            <TabsTrigger value="environment"><Thermometer /> อุณหภูมิ–ความชื้น</TabsTrigger>
            <TabsTrigger value="printers"><Printer /> การพิมพ์</TabsTrigger>
            <TabsTrigger value="database"><Database /> ฐานข้อมูล</TabsTrigger>
          </TabsList>
        </Tabs>
        {tab === 'sales' && (
          <Button className="h-10 ml-auto" onClick={() => salesSaveFn.current?.()} disabled={salesSaving}>
            <Save className="size-4" />{salesSaving ? 'กำลังบันทึก...' : 'บันทึก'}
          </Button>
        )}
        {tab === 'environment' && (
          <Button className="h-10 ml-auto" onClick={() => envSaveFn.current?.()} disabled={envSaving}>
            <Save className="size-4" />{envSaving ? 'กำลังบันทึก...' : 'บันทึก'}
          </Button>
        )}
        {tab === 'printers' && printersActions && (
          <div className="ml-auto flex items-center gap-2">{printersActions}</div>
        )}
      </TabStrip>

      {/* Manage-style content area: a flex column that fills the leftover height
          (flex-1 min-h-0, NO outer scroll). Table-card tabs (h-full) stretch to
          the bottom edge and scroll internally; natural-height form tabs get
          their OWN scroll wrapper (overflow-y-auto + pb-8 breathing room) so they
          can scroll without making the whole page scroll. Bottom margin is the
          root's pb-4 for every tab — same as the Manage page. */}
      <div className="flex flex-1 min-h-0 flex-col pt-3">
        {tab === 'shop' && <div className="flex-1 min-h-0 overflow-y-auto pb-8 [scrollbar-gutter:stable]"><ShopTab /></div>}
        {tab === 'product-mgmt' && <ProductMgmtTab />}
        {tab === 'units' && <UnitsTab />}
        {tab === 'drug-usage' && <DrugUsageTab />}
        {tab === 'sales' && (
          <div className="flex-1 min-h-0 overflow-y-auto pb-8 [scrollbar-gutter:stable]">
            <SalesTab
              registerSave={fn => { salesSaveFn.current = fn }}
              saving={salesSaving}
              setSaving={setSalesSaving}
            />
          </div>
        )}
        {tab === 'environment' && (
          <div className="flex-1 min-h-0 overflow-y-auto pb-8 [scrollbar-gutter:stable]">
            <EnvironmentTab
              registerSave={fn => { envSaveFn.current = fn }}
              saving={envSaving}
              setSaving={setEnvSaving}
            />
          </div>
        )}
        {tab === 'printers' && <PrintersTab onActions={setPrintersActions} />}
        {tab === 'database' && <div className="flex-1 min-h-0 overflow-y-auto pb-8 [scrollbar-gutter:stable]"><DatabaseTab /></div>}
      </div>
    </div>
  )
}
