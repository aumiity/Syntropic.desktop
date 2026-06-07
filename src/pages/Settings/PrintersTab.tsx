import { useState, type ReactNode } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FileText, Tag, Receipt } from 'lucide-react'
import { DocumentSettingsTab } from './DocumentSettingsTab'
import { LabelSettingsTab } from './LabelSettingsTab'
import { ReceiptSettingsTab } from './ReceiptSettingsTab'

// Unified printer hub: each print group prints to its own physical printer
// (A4 documents / drug labels / cash receipts), so the operator maps all three
// here in one place. Each sub-section owns its own state + save button.
export function PrintersTab() {
  const [sub, setSub] = useState('documents')
  // Each sub-tab registers its own action controls (preview/print/save) via
  // `onActions`, so they render on the SAME row as the sub-tab strip instead of
  // a separate titled bar inside each tab.
  const [actions, setActions] = useState<ReactNode>(null)

  // All three sub-tabs are page-scroll layouts: they flow at their natural height
  // and ride the Settings page's OWN outer scroll — so the sub-tab strip scrolls
  // away with the content and every tab gets the same page bottom margin.
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 shrink-0">
        <Tabs value={sub} onValueChange={setSub}>
          <TabsList variant="line">
            <TabsTrigger value="documents" className="flex-none px-4 py-2"><FileText /> เอกสาร A4</TabsTrigger>
            <TabsTrigger value="labels" className="flex-none px-4 py-2"><Tag /> ฉลากยา</TabsTrigger>
            <TabsTrigger value="receipts" className="flex-none px-4 py-2"><Receipt /> ใบเสร็จ</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex-1" />
        <div className="flex items-center gap-2">{actions}</div>
      </div>

      <div>
        {sub === 'documents' && <DocumentSettingsTab onActions={setActions} />}
        {sub === 'labels' && <LabelSettingsTab onActions={setActions} />}
        {sub === 'receipts' && <ReceiptSettingsTab onActions={setActions} />}
      </div>
    </div>
  )
}
