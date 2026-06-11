import { useState, type ReactNode } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FileText, Tag, Receipt } from 'lucide-react'
import { DocumentSettingsTab } from './DocumentSettingsTab'
import { LabelSettingsTab } from './LabelSettingsTab'
import { ReceiptSettingsTab } from './ReceiptSettingsTab'

// Unified printer hub: each print group prints to its own physical printer
// (A4 documents / drug labels / cash receipts), so the operator maps all three
// here in one place. Each sub-section owns its own state + save button.
//
// The active sub-tab's บันทึก button is forwarded straight up to the Settings
// page's MAIN tab row (via onActions) — same placement as the การขาย save
// button — so it sits on the top tab strip, not the sub-tab strip below it.
export function PrintersTab({ onActions }: { onActions?: (node: ReactNode) => void }) {
  const [sub, setSub] = useState('documents')

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
      </div>

      <div>
        {sub === 'documents' && <DocumentSettingsTab onActions={onActions} />}
        {sub === 'labels' && <LabelSettingsTab onActions={onActions} />}
        {sub === 'receipts' && <ReceiptSettingsTab onActions={onActions} />}
      </div>
    </div>
  )
}
