import { useState } from 'react'
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

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <Tabs value={sub} onValueChange={setSub} className="shrink-0">
        <TabsList variant="segmented" className="h-9">
          <TabsTrigger value="documents"><FileText /> เอกสาร A4</TabsTrigger>
          <TabsTrigger value="labels"><Tag /> ฉลากยา</TabsTrigger>
          <TabsTrigger value="receipts"><Receipt /> ใบเสร็จ</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex-1 min-h-0">
        {sub === 'documents' && <DocumentSettingsTab />}
        {sub === 'labels' && <LabelSettingsTab />}
        {sub === 'receipts' && <ReceiptSettingsTab />}
      </div>
    </div>
  )
}
