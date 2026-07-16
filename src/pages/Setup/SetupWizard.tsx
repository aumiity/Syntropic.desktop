import { useState, useEffect } from 'react'
import { TitleBar } from '@/components/layout/TitleBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { FormField } from '@/components/ui/label'
import { DateInput } from '@/components/ui/date-input'
import { BrandPanel, BrandMark } from '@/components/ui/brand'
import { Stepper } from '@/components/ui/stepper'
import { ChoiceCard } from '@/components/ui/choice-card'
import { TintIcon } from '@/components/ui/tint-icon'
import { useToast } from '@/components/ui/toast'
import { CheckCircle2, ArrowLeft, ArrowRight, AlertTriangle, KeyRound, Copy } from 'lucide-react'

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

const STEP_LABELS = ['ข้อมูลร้าน', 'ภาษี (VAT)', 'รหัสผ่าน', 'ยืนยัน']

const STEP_META: Record<1 | 2 | 3 | 4, { title: string; desc: string }> = {
  1: { title: 'ข้อมูลร้าน', desc: 'ชื่อ ที่อยู่ และเบอร์โทร จะถูกพิมพ์บนฉลากยาและใบเสร็จ' },
  2: { title: 'ภาษีมูลค่าเพิ่ม (VAT)', desc: 'เลือกสถานะภาษีของร้าน — ตัดสินใจครั้งเดียวตอนติดตั้ง' },
  3: { title: 'ตั้งรหัสผ่านผู้ดูแล', desc: 'รหัสผ่านสำหรับบัญชีผู้ดูแลระบบ (admin) เพื่อเข้าสู่ระบบ' },
  4: { title: 'ยืนยันข้อมูล', desc: 'ตรวจสอบความถูกต้องอีกครั้งก่อนเริ่มใช้งาน' },
}

const focusField = (name: string) => {
  // Defer so a step that just mounted has its inputs in the DOM.
  setTimeout(() => document.querySelector<HTMLElement>(`[data-field="${name}"]`)?.focus(), 0)
}

// dryRun: skip the DB write on "เริ่มใช้งาน" (used by the DEV preview in ShopTab
// so the wizard can be clicked through safely without committing setup).
export function SetupWizard({ onComplete, dryRun = false }: { onComplete: () => void; dryRun?: boolean }) {
  const { toast } = useToast()
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [busy, setBusy] = useState(false)

  // Step 3 — admin password (Phase 0 bootstrap)
  const [adminPw, setAdminPw] = useState('')
  const [adminPw2, setAdminPw2] = useState('')

  // Recovery code returned by completeSetup — shown once before handing off.
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null)

  // Step 1 — shop identity
  const [shopName, setShopName] = useState('')
  const [shopAddress, setShopAddress] = useState('')
  const [shopPostcode, setShopPostcode] = useState('')
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
      setShopPostcode(d.shop_postcode ?? '')
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
      const rate = parseFloat(vatRate)
      if (!Number.isFinite(rate) || rate <= 0 || rate > 100) { toast({ title: 'อัตราภาษีไม่ถูกต้อง', variant: 'error' }); focusField('vat_rate'); return false }
      if (!vatDate) { toast({ title: 'กรุณาระบุวันที่จดทะเบียน VAT', variant: 'error' }); return false }
    }
    return true
  }

  const validateStep3 = (): boolean => {
    if (!adminPw) { toast({ title: 'กรุณาตั้งรหัสผ่านผู้ดูแล', variant: 'error' }); focusField('admin_pw'); return false }
    if (adminPw.length < 4) { toast({ title: 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร', variant: 'error' }); focusField('admin_pw'); return false }
    if (adminPw !== adminPw2) { toast({ title: 'รหัสผ่านยืนยันไม่ตรงกัน', variant: 'error' }); focusField('admin_pw2'); return false }
    return true
  }

  const next = () => {
    if (step === 1 && !validateStep1()) return
    if (step === 2 && !validateStep2()) return
    if (step === 3 && !validateStep3()) return
    setStep(s => (Math.min(4, s + 1) as 1 | 2 | 3 | 4))
  }
  const back = () => setStep(s => (Math.max(1, s - 1) as 1 | 2 | 3 | 4))

  const finish = async () => {
    if (busy) return
    if (!validateStep1() || !validateStep2() || !validateStep3()) return
    if (dryRun) {
      // DEV preview — never writes the password; just shows the wizard works.
      toast({ title: '(ตัวอย่าง) ผ่านการตรวจสอบ ไม่ได้บันทึกข้อมูล', variant: 'success' })
      onComplete()
      return
    }
    setBusy(true)
    try {
      const res: any = await window.api.settings.completeSetup({
        adminPassword: adminPw,
        shop: {
          shop_name: shopName.trim(),
          shop_address: shopAddress.trim(),
          shop_postcode: shopPostcode.trim(),
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
      toast({ title: 'ตั้งค่าร้านสำเร็จ', variant: 'success' })
      // Show the recovery code once before handing off. If the backend didn't
      // return one (defensive), proceed straight to the app.
      if (res?.recoveryCode) setRecoveryCode(res.recoveryCode)
      else onComplete()
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const copyRecovery = async () => {
    if (!recoveryCode) return
    try { await navigator.clipboard.writeText(recoveryCode); toast({ title: 'คัดลอกรหัสกู้คืนแล้ว', variant: 'success' }) }
    catch { toast({ title: 'คัดลอกไม่สำเร็จ', variant: 'error' }) }
  }

  if (recoveryCode) {
    return (
      <div className="flex flex-col h-screen overflow-hidden bg-background">
        <TitleBar />
        <div className="flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-md px-6 py-12 space-y-6">
            <BrandMark tone="dark" tagline="ตั้งค่าร้านเสร็จแล้ว" />
            <Card>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2.5">
                  <TintIcon icon={KeyRound} tint="amber-soft" size="sm" bordered />
                  <h1 className="text-base font-semibold text-foreground">รหัสกู้คืน (Recovery Code)</h1>
                </div>
                <p className="text-sm text-muted-foreground">
                  เก็บรหัสนี้ไว้ในที่ปลอดภัย ใช้สำหรับกู้คืนรหัสผ่านผู้ดูแลหากลืม
                  <span className="text-warning-strong font-medium"> ระบบจะแสดงรหัสนี้เพียงครั้งเดียวเท่านั้น</span>
                </p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 rounded-lg border bg-muted/40 px-4 py-3 text-center text-lg font-semibold tracking-widest text-foreground">
                    {recoveryCode}
                  </div>
                  <Button variant="elevated" size="lg" onClick={copyRecovery}>
                    <Copy className="size-4" />คัดลอก
                  </Button>
                </div>
                <div className="rounded-lg border border-warning bg-warning-soft px-3 py-2 flex items-start gap-2 text-xs text-foreground">
                  <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                  <span>กรุณาจดหรือพิมพ์รหัสนี้เก็บไว้ก่อนดำเนินการต่อ เมื่อปิดหน้านี้แล้วจะไม่สามารถเรียกดูได้อีก</span>
                </div>
              </CardContent>
            </Card>
            <Button size="lg" className="w-full" onClick={() => onComplete()}>
              <CheckCircle2 className="size-4" />จดรหัสแล้ว เริ่มใช้งาน
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const meta = STEP_META[step]

  // Step 4 summary rows (built inline — no module-scope helper component).
  const summaryRows: [string, string][] = [
    ['ชื่อร้าน', shopName],
    ['ที่อยู่', shopAddress],
    ...(shopPostcode.trim() ? [['รหัสไปรษณีย์', shopPostcode] as [string, string]] : []),
    ['เบอร์โทร', shopPhone],
    ...(shopLicense.trim() ? [['เลขใบอนุญาต', shopLicense] as [string, string]] : []),
    ...(shopLine.trim() ? [['LINE ID', shopLine] as [string, string]] : []),
    ['ภาษีมูลค่าเพิ่ม', vatChoice === 'yes' ? `จดทะเบียน VAT (${vatRate}%)` : 'ไม่จดทะเบียน VAT'],
    ...(vatChoice === 'yes' ? [['เลขผู้เสียภาษี', taxId] as [string, string], ['สาขา', branch] as [string, string]] : []),
  ]

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <TitleBar />
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <BrandPanel tagline="ระบบขายหน้าร้าน สำหรับร้านยา">
          <Stepper tone="light" steps={STEP_LABELS} current={step} />
        </BrandPanel>

        <div className="flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-lg px-8 py-10 space-y-6">
            <div className="space-y-1.5">
              <div className="text-xs font-medium uppercase tracking-wide text-primary">ขั้นที่ {step} จาก 4</div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{meta.title}</h1>
              <p className="text-sm text-muted-foreground">{meta.desc}</p>
            </div>

            {step === 1 && (
              <Card>
                <CardContent className="space-y-3">
                  <FormField label="ชื่อร้าน" required>
                    <Input data-field="shop_name" value={shopName} onChange={e => setShopName(e.target.value)} placeholder="ร้านยา..." />
                  </FormField>
                  <FormField label="ที่อยู่" required>
                    <Textarea data-field="shop_address" rows={3} className="resize-none" value={shopAddress} onChange={e => setShopAddress(e.target.value)} />
                  </FormField>
                  <FormField label="รหัสไปรษณีย์ (ไม่บังคับ)">
                    <Input value={shopPostcode} onChange={e => setShopPostcode(e.target.value)} />
                  </FormField>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="เบอร์โทร" required>
                      <Input data-field="shop_phone" inputMode="numeric" value={shopPhone} onChange={e => setShopPhone(e.target.value.replace(/\D/g, ''))} />
                    </FormField>
                    <FormField label="LINE ID (ไม่บังคับ)">
                      <Input value={shopLine} onChange={e => setShopLine(e.target.value)} />
                    </FormField>
                    <div className="col-span-2">
                      <FormField label="เลขใบอนุญาต (ไม่บังคับ)">
                        <Input value={shopLicense} onChange={e => setShopLicense(e.target.value)} />
                      </FormField>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {step === 2 && (
              <Card>
                <CardContent className="space-y-3">
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
                    <div className="grid grid-cols-2 gap-3">
                      <FormField label="เลขประจำตัวผู้เสียภาษี (13 หลัก)">
                        <Input data-field="tax_id" inputMode="numeric" maxLength={13} value={taxId} onChange={e => setTaxId(e.target.value.replace(/\D/g, ''))} />
                      </FormField>
                      <FormField label="สาขา">
                        <Input value={branch} onChange={e => setBranch(e.target.value)} placeholder="สำนักงานใหญ่" />
                      </FormField>
                      <FormField label="อัตราภาษี (%)">
                        <Input data-field="vat_rate" inputMode="decimal" value={vatRate} onChange={e => setVatRate(e.target.value)} />
                      </FormField>
                      <FormField label="วันที่จดทะเบียน VAT">
                        <DateInput variant="elevated" value={vatDate} onChange={setVatDate} />
                      </FormField>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {step === 3 && (
              <Card>
                <CardContent className="space-y-3">
                  <FormField label="รหัสผ่าน">
                    <Input data-field="admin_pw" type="password" value={adminPw} onChange={e => setAdminPw(e.target.value)} placeholder="อย่างน้อย 4 ตัวอักษร" />
                  </FormField>
                  <FormField label="ยืนยันรหัสผ่าน">
                    <Input data-field="admin_pw2" type="password" value={adminPw2} onChange={e => setAdminPw2(e.target.value)} />
                  </FormField>
                </CardContent>
              </Card>
            )}

            {step === 4 && (
              <Card>
                <CardContent>
                  <dl className="text-sm divide-y divide-border">
                    {summaryRows.map(([label, value]) => (
                      <div key={label} className="flex items-start justify-between gap-4 py-2">
                        <dt className="text-muted-foreground shrink-0">{label}</dt>
                        <dd className="text-foreground text-right break-words">{value || '-'}</dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>
            )}

            <div className="flex items-center gap-2">
              {step > 1 && (
                <Button variant="elevated" size="lg" onClick={back} disabled={busy}>
                  <ArrowLeft className="size-4" />ย้อนกลับ
                </Button>
              )}
              <div className="flex-1" />
              {step < 4 ? (
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
    </div>
  )
}
