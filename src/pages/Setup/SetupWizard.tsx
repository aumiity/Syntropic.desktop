import { useState, useEffect } from 'react'
import { TitleBar } from '@/components/layout/TitleBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SectionCard } from '@/components/ui/card'
import { FormField } from '@/components/ui/label'
import { DateInput } from '@/components/ui/date-input'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { Store, ReceiptText, CheckCircle2, ArrowLeft, ArrowRight, AlertTriangle, Check } from 'lucide-react'

// First-run setup wizard. Rendered by the SetupGate in App.tsx whenever
// settings.setup_completed !== 1, replacing the whole app until the operator
// enters the essential shop identity (name/address/phone print on drug labels)
// and makes the one-time VAT decision. On finish, settings.completeSetup writes
// shop + VAT atomically and flips the gate.
//
// Why VAT is decided here and not as a casual Settings toggle: a VAT-registered
// shop must charge VAT on every taxable sale — flipping it off mid-stream leaves
// an auditable gap in the invoice sequence. The decision belongs at onboarding.

type VatChoice = 'yes' | 'no' | null

const focusField = (name: string) => {
  // Defer so a step that just mounted has its inputs in the DOM.
  setTimeout(() => document.querySelector<HTMLElement>(`[data-field="${name}"]`)?.focus(), 0)
}

// dryRun: skip the DB write on "เริ่มใช้งาน" (used by the DEV preview in ShopTab
// so the wizard can be clicked through safely without committing setup).
export function SetupWizard({ onComplete, dryRun = false }: { onComplete: () => void; dryRun?: boolean }) {
  const { toast } = useToast()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [busy, setBusy] = useState(false)

  // Step 1 — shop identity
  const [shopName, setShopName] = useState('')
  const [shopAddress, setShopAddress] = useState('')
  const [shopPhone, setShopPhone] = useState('')
  const [shopLicense, setShopLicense] = useState('')
  const [shopLine, setShopLine] = useState('')

  // Step 2 — VAT decision
  const [vatChoice, setVatChoice] = useState<VatChoice>(null)
  const [taxId, setTaxId] = useState('')
  const [branch, setBranch] = useState('สำนักงานใหญ่')
  const [vatRate, setVatRate] = useState('7')
  const [vatDate, setVatDate] = useState('')

  // Pre-fill from any existing settings. Fresh installs read back blanks (seed
  // inserts an empty shop row), so the required-field validation still bites; an
  // existing install being re-onboarded (e.g. configured but never sold) gets its
  // data back instead of re-typing. VAT is pre-selected only when already on —
  // a fresh/non-VAT shop keeps vatChoice null so the choice stays explicit.
  useEffect(() => {
    window.api.settings.getShop().then((d: any) => {
      if (!d) return
      setShopName(d.shop_name ?? '')
      setShopAddress(d.shop_address ?? '')
      setShopPhone(d.shop_phone ?? '')
      setShopLicense(d.shop_license_no ?? '')
      setShopLine(d.shop_line_id ?? '')
      if (d.shop_tax_id) setTaxId(d.shop_tax_id)
      if (d.shop_branch) setBranch(d.shop_branch)
      if (d.vat_registered_date) setVatDate(d.vat_registered_date)
    })
    window.api.settings.getSalesSettings().then((s: any) => {
      if (s?.vat_enabled === 1) {
        setVatChoice('yes')
        if (s.vat_rate != null) setVatRate(String(s.vat_rate))
      }
    })
  }, [])

  const validateStep1 = (): boolean => {
    if (!shopName.trim()) { toast({ title: 'กรุณาระบุชื่อร้าน', variant: 'error' }); focusField('shop_name'); return false }
    if (!shopAddress.trim()) { toast({ title: 'กรุณาระบุที่อยู่ร้าน', variant: 'error' }); focusField('shop_address'); return false }
    if (!shopPhone.trim()) { toast({ title: 'กรุณาระบุเบอร์โทร', variant: 'error' }); focusField('shop_phone'); return false }
    return true
  }

  const validateStep2 = (): boolean => {
    if (vatChoice === null) { toast({ title: 'กรุณาเลือกสถานะภาษีมูลค่าเพิ่ม (VAT)', variant: 'error' }); return false }
    if (vatChoice === 'yes') {
      if (!/^\d{13}$/.test(taxId.trim())) { toast({ title: 'เลขประจำตัวผู้เสียภาษีต้องมี 13 หลัก', variant: 'error' }); focusField('tax_id'); return false }
      const r = parseFloat(vatRate)
      if (Number.isNaN(r) || r <= 0 || r > 100) { toast({ title: 'อัตราภาษีไม่ถูกต้อง', variant: 'error' }); focusField('vat_rate'); return false }
      if (!vatDate) { toast({ title: 'กรุณาระบุวันที่จดทะเบียน VAT', variant: 'error' }); focusField('vat_date'); return false }
    }
    return true
  }

  const next = () => {
    if (step === 1 && !validateStep1()) return
    if (step === 2 && !validateStep2()) return
    setStep(s => (Math.min(3, s + 1) as 1 | 2 | 3))
  }
  const back = () => setStep(s => (Math.max(1, s - 1) as 1 | 2 | 3))

  const finish = async () => {
    if (busy) return
    if (!validateStep1() || !validateStep2()) return
    if (dryRun) {
      toast({ title: '(ตัวอย่าง) ผ่านการตรวจสอบ ไม่ได้บันทึกข้อมูล', variant: 'success' })
      onComplete()
      return
    }
    setBusy(true)
    try {
      await window.api.settings.completeSetup({
        shop: {
          shop_name: shopName.trim(),
          shop_address: shopAddress.trim(),
          shop_phone: shopPhone.trim(),
          shop_license_no: shopLicense.trim(),
          shop_line_id: shopLine.trim(),
          shop_tax_id: vatChoice === 'yes' ? taxId.trim() : '',
          shop_branch: vatChoice === 'yes' ? (branch.trim() || 'สำนักงานใหญ่') : 'สำนักงานใหญ่',
          vat_registered_date: vatChoice === 'yes' ? vatDate : null,
        },
        vat: {
          vat_enabled: vatChoice === 'yes' ? 1 : 0,
          vat_rate: vatChoice === 'yes' ? parseFloat(vatRate) : 7,
        },
      })
      toast({ title: 'ตั้งค่าร้านสำเร็จ เริ่มใช้งานได้เลย', variant: 'success' })
      onComplete()
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <TitleBar />
      <div className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-xl px-6 py-8 space-y-5">
          <StepHeader step={step} />

          {step === 1 && (
            <SectionCard icon={Store} title="ข้อมูลร้าน" tint="primary">
              <FormField label="ชื่อร้าน">
                <Input data-field="shop_name" variant="elevated" value={shopName} onChange={e => setShopName(e.target.value)} placeholder="ร้านยา..." />
              </FormField>
              <FormField label="ที่อยู่">
                <Textarea data-field="shop_address" variant="elevated" rows={3} className="resize-none" value={shopAddress} onChange={e => setShopAddress(e.target.value)} />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="เบอร์โทร">
                  <Input data-field="shop_phone" variant="elevated" inputMode="tel" value={shopPhone} onChange={e => setShopPhone(e.target.value)} />
                </FormField>
                <FormField label="LINE ID (ไม่บังคับ)">
                  <Input variant="elevated" value={shopLine} onChange={e => setShopLine(e.target.value)} />
                </FormField>
                <div className="col-span-2">
                  <FormField label="เลขใบอนุญาต (ไม่บังคับ)">
                    <Input variant="elevated" value={shopLicense} onChange={e => setShopLicense(e.target.value)} />
                  </FormField>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">ชื่อ ที่อยู่ และเบอร์โทร จะถูกพิมพ์บนฉลากยาและใบเสร็จ</p>
            </SectionCard>
          )}

          {step === 2 && (
            <SectionCard icon={ReceiptText} title="ภาษีมูลค่าเพิ่ม (VAT)" tint="info-soft">
              <div className="grid grid-cols-2 gap-3">
                <ChoiceCard
                  title="จดทะเบียน VAT"
                  desc="ออกใบกำกับภาษีได้ เก็บ VAT ทุกบิล"
                  selected={vatChoice === 'yes'}
                  onClick={() => setVatChoice('yes')}
                />
                <ChoiceCard
                  title="ไม่จดทะเบียน VAT"
                  desc="ขายปกติ ไม่มีภาษีมูลค่าเพิ่ม"
                  selected={vatChoice === 'no'}
                  onClick={() => setVatChoice('no')}
                />
              </div>

              {vatChoice === 'yes' && (
                <div className="space-y-3 pt-1">
                  <FormField label="เลขประจำตัวผู้เสียภาษี (13 หลัก)">
                    <Input data-field="tax_id" variant="elevated" inputMode="numeric" maxLength={13} value={taxId} onChange={e => setTaxId(e.target.value.replace(/\D/g, ''))} />
                  </FormField>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="สาขา">
                      <Input variant="elevated" value={branch} onChange={e => setBranch(e.target.value)} placeholder="สำนักงานใหญ่" />
                    </FormField>
                    <FormField label="อัตราภาษี (%)">
                      <Input data-field="vat_rate" variant="elevated" inputMode="decimal" className="text-right" value={vatRate} onChange={e => setVatRate(e.target.value)} />
                    </FormField>
                    <div className="col-span-2">
                      <FormField label="วันที่จดทะเบียน VAT">
                        <div data-field="vat_date">
                          <DateInput variant="elevated" value={vatDate} onChange={setVatDate} placeholder="วว/ดด/ปปปป" />
                        </div>
                      </FormField>
                    </div>
                  </div>
                  <div className="rounded-lg border border-warning bg-warning-soft px-3 py-2 flex items-start gap-2 text-xs text-foreground">
                    <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                    <span>เมื่อเปิดการใช้งาน VAT แล้ว การดำเนินการนี้จะย้อนกลับไม่ได้</span>
                  </div>
                </div>
              )}
            </SectionCard>
          )}

          {step === 3 && (
            <SectionCard icon={CheckCircle2} title="ยืนยันข้อมูล" tint="success">
              <dl className="text-sm divide-y divide-border">
                <SummaryRow label="ชื่อร้าน" value={shopName} />
                <SummaryRow label="ที่อยู่" value={shopAddress} />
                <SummaryRow label="เบอร์โทร" value={shopPhone} />
                {shopLicense.trim() && <SummaryRow label="เลขใบอนุญาต" value={shopLicense} />}
                {shopLine.trim() && <SummaryRow label="LINE ID" value={shopLine} />}
                <SummaryRow label="ภาษีมูลค่าเพิ่ม" value={vatChoice === 'yes' ? `จดทะเบียน VAT (${vatRate}%)` : 'ไม่จดทะเบียน VAT'} />
                {vatChoice === 'yes' && <SummaryRow label="เลขผู้เสียภาษี" value={taxId} />}
                {vatChoice === 'yes' && <SummaryRow label="สาขา" value={branch} />}
              </dl>
            </SectionCard>
          )}

          <div className="flex items-center gap-2">
            {step > 1 && (
              <Button variant="elevated" size="lg" onClick={back} disabled={busy}>
                <ArrowLeft className="size-4" />ย้อนกลับ
              </Button>
            )}
            <div className="flex-1" />
            {step < 3 ? (
              <Button size="lg" onClick={next}>
                ถัดไป<ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button size="lg" onClick={finish} disabled={busy}>
                <CheckCircle2 className="size-4" />{busy ? 'กำลังบันทึก...' : 'เริ่มใช้งาน'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StepHeader({ step }: { step: 1 | 2 | 3 }) {
  const labels = ['ข้อมูลร้าน', 'ภาษี (VAT)', 'ยืนยัน']
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-semibold text-foreground">ตั้งค่าร้านครั้งแรก</h1>
        <p className="text-sm text-muted-foreground">กรอกข้อมูลที่จำเป็นเพื่อเริ่มใช้งานโปรแกรม</p>
      </div>
      <div className="flex items-center gap-2">
        {labels.map((l, i) => {
          const n = (i + 1) as 1 | 2 | 3
          const active = n === step
          const done = n < step
          return (
            <div key={l} className="flex items-center gap-2 flex-1">
              <div className={cn(
                'flex items-center justify-center size-7 rounded-full text-xs font-semibold shrink-0 border',
                active && 'bg-primary text-primary-foreground border-primary',
                done && 'bg-success text-success-foreground border-success',
                !active && !done && 'bg-card text-muted-foreground border-border',
              )}>
                {done ? <CheckCircle2 className="size-4" /> : n}
              </div>
              <span className={cn('text-sm', active ? 'text-foreground font-medium' : 'text-muted-foreground')}>{l}</span>
              {i < labels.length - 1 && <div className="flex-1 h-px bg-border" />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ChoiceCard({ title, desc, selected, onClick }: { title: string; desc: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative rounded-card border-2 p-4 pr-9 text-left transition-colors',
        selected ? 'border-primary bg-primary/5 ring-2 ring-primary/25' : 'border-border bg-card hover:border-primary/40',
      )}
    >
      <span
        className={cn(
          'absolute top-3 right-3 flex items-center justify-center size-5 rounded-full border transition-colors',
          selected ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/40 text-transparent',
        )}
      >
        <Check className="size-3.5" />
      </span>
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <div className="text-xs text-muted-foreground mt-1">{desc}</div>
    </button>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="text-foreground text-right break-words">{value || '-'}</dd>
    </div>
  )
}
