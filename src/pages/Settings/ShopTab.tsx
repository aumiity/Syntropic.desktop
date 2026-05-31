import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SectionCard } from '@/components/ui/card'
import { FormField } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import type { Setting } from '@/types'
import { Store, Save, Eye, X } from 'lucide-react'
// DEV ONLY — preview hook for the first-run wizard. Remove this import + the
// preview button + the overlay block before shipping a production build.
import { SetupWizard } from '@/pages/Setup/SetupWizard'

export function ShopTab() {
  const { toast } = useToast()
  const [form, setForm] = useState<Partial<Setting>>({})
  const [saving, setSaving] = useState(false)
  // DEV ONLY — toggles the setup-wizard preview overlay.
  const [previewSetup, setPreviewSetup] = useState(false)

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
    <div>
      <SectionCard
        icon={Store}
        title="ข้อมูลร้านค้า / ร้านยา"
        tint="primary"
        right={
          <div className="flex items-center gap-2">
            {/* DEV ONLY — open the first-run setup wizard for styling/tweaks.
                Remove this button before a production build. */}
            <Button variant="elevated" onClick={() => setPreviewSetup(true)}>
              <Eye className="size-4" />ดูตัวอย่าง Setup (DEV)
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              <Save className="size-4" />{saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
          </div>
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

      {/* DEV ONLY — full-screen preview of the first-run setup wizard for
          styling/tweaks. dryRun=true so "เริ่มใช้งาน" validates but does NOT
          write the DB; onComplete just closes the overlay.
          Remove this whole block before a production build. */}
      {previewSetup && (
        <div className="fixed inset-0 z-[100] bg-background">
          <SetupWizard dryRun onComplete={() => setPreviewSetup(false)} />
          <Button
            variant="elevated"
            size="lg"
            onClick={() => setPreviewSetup(false)}
            className="fixed bottom-4 right-4 z-[110] shadow-lg"
          >
            <X className="size-4" />ปิดตัวอย่าง
          </Button>
        </div>
      )}
    </div>
  )
}
