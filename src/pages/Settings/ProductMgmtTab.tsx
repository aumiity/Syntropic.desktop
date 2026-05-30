import { useState } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tag, Pill, Blocks } from 'lucide-react'
import { CategoriesTab } from './CategoriesTab'
import { DrugTypesTab } from './DrugTypesTab'
import { UnitsTab } from './UnitsTab'

export function ProductMgmtTab() {
  const [sub, setSub] = useState('categories')

  return (
    <div className="h-full flex flex-col min-h-0">
      <Tabs value={sub} onValueChange={setSub}>
        <TabsList variant="line">
          <TabsTrigger value="categories" className="flex-none px-4 py-2"><Tag /> หมวดหมู่</TabsTrigger>
          <TabsTrigger value="drugtypes" className="flex-none px-4 py-2"><Pill /> ประเภทยา</TabsTrigger>
          <TabsTrigger value="units" className="flex-none px-4 py-2"><Blocks /> หน่วยนับ</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex-1 min-h-0">
        {sub === 'categories' && <CategoriesTab />}
        {sub === 'drugtypes' && <DrugTypesTab />}
        {sub === 'units' && <UnitsTab />}
      </div>
    </div>
  )
}
