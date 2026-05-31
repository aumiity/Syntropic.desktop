import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SectionCard } from '@/components/ui/card'
import { FormField } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import type { Setting } from '@/types'
import { Store, Save } from 'lucide-react'

export function ShopTab() {
  const { toast } = useToast()
  const [form, setForm] = useState<Partial<Setting>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.api.settings.getShop().then(data => setForm((data as Setting) ?? {}))
  }, [])

  const setF = (k: keyof Setting, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await window.api.settings.saveShop(form)
      toast({ title: 'บันทึกข้อมูลร้านสำเร็จ', variant: 'success' })
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally { setSaving(false) }
  }

  return (
    <div className="pt-4">
      <SectionCard
        icon={Store}
        title="ข้อมูลร้านค้า / ร้านยา"
        tint="primary"
        right={
          <Button onClick={handleSave} disabled={saving}>
            <Save className="size-4" />{saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <FormField label="ชื่อร้าน">
              <Input variant="elevated" value={form.shop_name ?? ''} onChange={e => setF('shop_name', e.target.value)} placeholder="ร้านยา..." />
            </FormField>
          </div>
          <div className="col-span-2">
            <FormField label="ที่อยู่">
              <Textarea
                variant="elevated"
                value={form.shop_address ?? ''}
                onChange={e => setF('shop_address' as keyof Setting, e.target.value)}
                rows={3}
                className="resize-none"
              />
            </FormField>
          </div>
          <FormField label="โทรศัพท์">
            <Input variant="elevated" value={form.shop_phone ?? ''} onChange={e => setF('shop_phone', e.target.value)} />
          </FormField>
          <FormField label="LINE ID">
            <Input variant="elevated" value={form.shop_line_id ?? ''} onChange={e => setF('shop_line_id', e.target.value)} />
          </FormField>
          <FormField label="เลขใบอนุญาต">
            <Input variant="elevated" value={form.shop_license_no ?? ''} onChange={e => setF('shop_license_no', e.target.value)} />
          </FormField>
          <FormField label="เลขผู้เสียภาษี">
            <Input variant="elevated" value={form.shop_tax_id ?? ''} onChange={e => setF('shop_tax_id', e.target.value)} />
          </FormField>
          <FormField label="สาขา (สำหรับใบกำกับภาษี)">
            <Input variant="elevated" value={form.shop_branch ?? ''} onChange={e => setF('shop_branch' as keyof Setting, e.target.value)} placeholder="สำนักงานใหญ่" />
          </FormField>
        </div>
      </SectionCard>
    </div>
  )
}
