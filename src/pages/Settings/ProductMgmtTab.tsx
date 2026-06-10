import { useState } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tag, Pill, Blocks, ReceiptText, Stethoscope, ListChecks } from 'lucide-react'
import { CategoriesTab } from './CategoriesTab'
import { DrugTypesTab } from './DrugTypesTab'
import { UnitsTab } from './UnitsTab'
import { ExpenseCategoriesTab } from './ExpenseCategoriesTab'
import { LabelLookupTab } from './LabelLookupTab'
import { LabelPresetTab } from './LabelPresetTab'

export function ProductMgmtTab() {
  const [sub, setSub] = useState('categories')

  return (
    <div className="h-full flex flex-col min-h-0">
      <Tabs value={sub} onValueChange={setSub}>
        <TabsList variant="line">
          <TabsTrigger value="categories" className="flex-none px-4 py-2"><Tag /> หมวดหมู่</TabsTrigger>
          <TabsTrigger value="drugtypes" className="flex-none px-4 py-2"><Pill /> ประเภทยา</TabsTrigger>
          <TabsTrigger value="units" className="flex-none px-4 py-2"><Blocks /> หน่วยนับ</TabsTrigger>
          <TabsTrigger value="expenses" className="flex-none px-4 py-2"><ReceiptText /> หมวดค่าใช้จ่าย</TabsTrigger>
          <TabsTrigger value="label-usage" className="flex-none px-4 py-2"><Stethoscope /> วิธีใช้ยา</TabsTrigger>
          <TabsTrigger value="label-preset" className="flex-none px-4 py-2"><ListChecks /> preset วิธีใช้</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex-1 min-h-0">
        {sub === 'categories' && <CategoriesTab />}
        {sub === 'drugtypes' && <DrugTypesTab />}
        {sub === 'units' && <UnitsTab />}
        {sub === 'expenses' && <ExpenseCategoriesTab />}
        {sub === 'label-usage' && <LabelLookupTab />}
        {sub === 'label-preset' && <LabelPresetTab />}
      </div>
    </div>
  )
}
