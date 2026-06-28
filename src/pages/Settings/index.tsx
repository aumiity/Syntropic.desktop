import { useState, useRef, type ReactNode } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { TabStrip } from '@/components/layout/TabStrip'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Store, FolderTree, Printer, ShoppingCart, Save, Database, Blocks, Stethoscope, ShieldCheck } from 'lucide-react'
import { ShopTab } from './ShopTab'
import { ProductMgmtTab } from './ProductMgmtTab'
import { UnitsTab } from './UnitsTab'
import { DrugUsageTab } from './DrugUsageTab'
import { PrintersTab } from './PrintersTab'
import { SalesTab } from './SalesTab'
import { DatabaseTab } from './DatabaseTab'
import { PermissionsTab } from './PermissionsTab'
import { usePublishDevTab } from '@/stores/devTabStore'
import { useCan } from '@/hooks/useCan'

export default function SettingsPage() {
  const [tab, setTab] = useState('shop')
  usePublishDevTab(tab) // DEV ONLY — surfaces open sub-tab file in TitleBar path
  const salesSaveFn = useRef<() => void>()
  const [salesSaving, setSalesSaving] = useState(false)
  // The active การพิมพ์ sub-tab forwards its บันทึก button up here so it lands on
  // the MAIN tab row (same spot as the การขาย save button), not the sub-tab strip.
  const [printersActions, setPrintersActions] = useState<ReactNode>(null)
  const [permissionsActions, setPermissionsActions] = useState<ReactNode>(null)
  // The สิทธิ์การใช้งาน tab is owner-only (gated on permission.manage, which only
  // the owner ever holds and which is never editable in the matrix).
  const canManagePerms = useCan('permission.manage') !== 'off'

  // Full-bleed like Manage: the page runs full width so the form scrollers' bars
  // sit at the window edge. CAP re-centers each region (header, tab strip, form
  // body, table tabs) at max-w-7xl so content + tables look unchanged.
  const CAP = 'w-full max-w-7xl mx-auto px-8'
  // Form tabs (natural height) own a full-bleed scroll wrapper; the inner CAP keeps
  // the form centered while the scrollbar hugs the window edge.
  const formScroll = 'flex-1 min-h-0 overflow-y-auto scrollbar-thin pb-8 [scrollbar-gutter:stable]'
  // Table/hub tabs (h-full) fill the column but stay capped+centered (look identical).
  const tableTab = `flex flex-1 min-h-0 flex-col ${CAP}`

  return (
    <div className="flex flex-col h-full pt-4 pb-4 gap-2">
      <div className={CAP}>
        <PageHeader title="ตั้งค่า" />
      </div>

      <div className={CAP}>
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
            {canManagePerms && <TabsTrigger value="permissions"><ShieldCheck /> สิทธิ์การใช้งาน</TabsTrigger>}
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
        {tab === 'permissions' && permissionsActions}
      </TabStrip>
      </div>

      {/* Content area fills the leftover height (flex-1 min-h-0, NO outer scroll).
          Form tabs use a full-bleed scroll wrapper (formScroll) with an inner CAP;
          table/hub tabs (h-full) stay capped+centered (tableTab) and scroll
          internally. Bottom margin is the root's pb-4 for every tab. */}
      <div className="flex flex-1 min-h-0 flex-col pt-3">
        {tab === 'shop' && <div className={formScroll}><div className={CAP}><ShopTab /></div></div>}
        {tab === 'product-mgmt' && <div className={tableTab}><ProductMgmtTab /></div>}
        {tab === 'units' && <div className={tableTab}><UnitsTab /></div>}
        {tab === 'drug-usage' && <div className={tableTab}><DrugUsageTab /></div>}
        {tab === 'sales' && (
          <div className={formScroll}>
            <div className={CAP}>
              <SalesTab
                registerSave={fn => { salesSaveFn.current = fn }}
                saving={salesSaving}
                setSaving={setSalesSaving}
              />
            </div>
          </div>
        )}
        {tab === 'printers' && <div className={tableTab}><PrintersTab onActions={setPrintersActions} /></div>}
        {tab === 'database' && <div className={formScroll}><div className={CAP}><DatabaseTab /></div></div>}
        {tab === 'permissions' && canManagePerms && <div className={formScroll}><div className={CAP}><PermissionsTab onActions={setPermissionsActions} /></div></div>}
      </div>
    </div>
  )
}
