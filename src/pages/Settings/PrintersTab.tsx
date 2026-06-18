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

  // The hub fills the Settings content area (h-full): the sub-tab strip is pinned
  // at the top (shrink-0) and the active sub-tab owns the leftover height. The A4
  // sub-tab uses that to size its preview so the whole page fits the screen with
  // NO outer scroll; the taller labels/receipts sub-tabs scroll inside this
  // wrapper instead of the Settings page's outer scroll.
  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="flex items-center gap-2 shrink-0">
        <Tabs value={sub} onValueChange={setSub}>
          <TabsList variant="line">
            <TabsTrigger value="documents" className="flex-none px-4 py-2"><FileText /> เอกสาร A4</TabsTrigger>
            <TabsTrigger value="labels" className="flex-none px-4 py-2"><Tag /> ฉลากยา</TabsTrigger>
            <TabsTrigger value="receipts" className="flex-none px-4 py-2"><Receipt /> ใบเสร็จ</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {sub === 'documents' && <DocumentSettingsTab onActions={onActions} />}
        {sub === 'labels' && <LabelSettingsTab onActions={onActions} />}
        {sub === 'receipts' && <ReceiptSettingsTab onActions={onActions} />}
      </div>
    </div>
  )
}
