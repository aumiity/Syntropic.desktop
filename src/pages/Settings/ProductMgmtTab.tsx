import { useState } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tag, Pill, ReceiptText } from 'lucide-react'
import { CategoriesTab } from './CategoriesTab'
import { DrugTypesTab } from './DrugTypesTab'
import { ExpenseCategoriesTab } from './ExpenseCategoriesTab'

export function ProductMgmtTab() {
  const [sub, setSub] = useState('categories')

  return (
    <div className="h-full flex flex-col min-h-0">
      <Tabs value={sub} onValueChange={setSub}>
        <TabsList variant="line">
          <TabsTrigger value="categories" className="flex-none px-4 py-2"><Tag /> หมวดหมู่สินค้า</TabsTrigger>
          <TabsTrigger value="expenses" className="flex-none px-4 py-2"><ReceiptText /> หมวดหมู่ค่าใช้จ่าย</TabsTrigger>
          <TabsTrigger value="drugtypes" className="flex-none px-4 py-2"><Pill /> ประเภทของยา</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex-1 min-h-0">
        {sub === 'categories' && <CategoriesTab />}
        {sub === 'expenses' && <ExpenseCategoriesTab />}
        {sub === 'drugtypes' && <DrugTypesTab />}
      </div>
    </div>
  )
}
