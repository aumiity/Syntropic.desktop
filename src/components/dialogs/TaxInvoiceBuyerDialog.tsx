import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { getCurrentUserId } from '@/stores/userStore'
import { printTaxInvoice, previewTaxInvoice } from '@/lib/receipt/print'
import type { SaleForPrint, Setting, TaxInvoice } from '@/types'
import { FileText, Printer } from 'lucide-react'

// Captures/edits the buyer details required for a full tax invoice (ม.86/4),
// then issues + prints it. Prefills from a prior issuance if one exists,
// otherwise from the linked customer. The first issue prints "ต้นฉบับ"; later
// issues print "สำเนา".
export function TaxInvoiceBuyerDialog({
  open, onOpenChange, saleId, sale, customerPrefill,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  saleId: number | null
  sale: SaleForPrint | null
  customerPrefill?: { name?: string; address?: string; taxId?: string }
}) {
  const { toast } = useToast()
  const [shop, setShop] = useState<Partial<Setting>>({})
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [taxId, setTaxId] = useState('')
  const [branch, setBranch] = useState('สำนักงานใหญ่')
  const [alreadyOriginal, setAlreadyOriginal] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || saleId == null) return
    window.api.settings.getShop().then(d => setShop((d as Setting) ?? {}))
    window.api.tax.get(saleId).then((rec: TaxInvoice | null) => {
      if (rec) {
        setName(rec.buyer_name)
        setAddress(rec.buyer_address)
        setTaxId(rec.buyer_tax_id)
        setBranch(rec.buyer_branch || 'สำนักงานใหญ่')
        setAlreadyOriginal(rec.original_printed === 1)
      } else {
        setName(customerPrefill?.name ?? '')
        setAddress(customerPrefill?.address ?? '')
        setTaxId(customerPrefill?.taxId ?? '')
        setBranch('สำนักงานใหญ่')
        setAlreadyOriginal(false)
      }
    })
  }, [open, saleId, customerPrefill])

  const validate = (): boolean => {
    if (!name.trim()) { toast({ title: 'กรุณาระบุชื่อผู้ซื้อ', variant: 'error' }); return false }
    if (!address.trim()) { toast({ title: 'กรุณาระบุที่อยู่ผู้ซื้อ', variant: 'error' }); return false }
    if (taxId.trim() && !/^\d{13}$/.test(taxId.trim())) {
      toast({ title: 'เลขประจำตัวผู้เสียภาษีต้องมี 13 หลัก', variant: 'error' }); return false
    }
    return true
  }

  // Preview uses a transient record so it does NOT commit issuance (won't burn
  // the "ต้นฉบับ"). The copy stamp mirrors whether an original already exists.
  const handlePreview = async () => {
    if (!sale || saleId == null || busy) return
    if (!validate()) return
    setBusy(true)
    try {
      const transient: TaxInvoice = {
        id: 0, sale_id: saleId, doc_no: sale.invoice_no,
        buyer_name: name.trim(), buyer_address: address.trim(),
        buyer_tax_id: taxId.trim(), buyer_branch: branch.trim(),
        original_printed: alreadyOriginal ? 1 : 0, issued_at: '',
      }
      const res = await previewTaxInvoice(sale, shop, transient, alreadyOriginal)
      if (!res.success) toast({ title: 'สร้าง PDF ไม่สำเร็จ', description: res.error, variant: 'error' })
    } finally { setBusy(false) }
  }

  const handlePrint = async () => {
    if (!sale || saleId == null || busy) return
    if (!validate()) return
    setBusy(true)
    try {
      const { record, copy } = await window.api.tax.issueOrGet({
        sale_id: saleId,
        buyer_name: name.trim(), buyer_address: address.trim(),
        buyer_tax_id: taxId.trim(), buyer_branch: branch.trim(),
        issued_by: getCurrentUserId(),
      }) as { record: TaxInvoice; copy: boolean }
      const res = await printTaxInvoice(sale, shop, record, copy, '')
      if (res.success) {
        toast({ title: copy ? 'พิมพ์ใบกำกับภาษี (สำเนา) แล้ว' : 'พิมพ์ใบกำกับภาษี (ต้นฉบับ) แล้ว', variant: 'success' })
        onOpenChange(false)
      } else {
        toast({ title: 'พิมพ์ไม่สำเร็จ', description: res.error, variant: 'error' })
      }
    } catch (e: any) {
      toast({ title: 'ออกใบกำกับไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" divided onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>ออกใบกำกับภาษีเต็มรูป</DialogTitle>
          {alreadyOriginal && (
            <div className="text-sm text-muted-foreground">ออกต้นฉบับไปแล้ว — การพิมพ์ครั้งนี้จะเป็น "สำเนา"</div>
          )}
        </DialogHeader>
        <DialogBody className="space-y-3">
          <FormField label="ชื่อผู้ซื้อ">
            <Input variant="elevated" value={name} onChange={e => setName(e.target.value)} placeholder="ชื่อบุคคล / นิติบุคคล" />
          </FormField>
          <FormField label="ที่อยู่">
            <Textarea variant="elevated" rows={3} className="resize-none" value={address} onChange={e => setAddress(e.target.value)} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="เลขประจำตัวผู้เสียภาษี (13 หลัก)">
              <Input variant="elevated" inputMode="numeric" maxLength={13} value={taxId} onChange={e => setTaxId(e.target.value.replace(/\D/g, ''))} />
            </FormField>
            <FormField label="สาขา">
              <Input variant="elevated" value={branch} onChange={e => setBranch(e.target.value)} placeholder="สำนักงานใหญ่" />
            </FormField>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="elevated" onClick={handlePreview} disabled={busy}>
            <FileText className="size-4" /> ดูตัวอย่าง PDF
          </Button>
          <Button variant="default" onClick={handlePrint} disabled={busy}>
            <Printer className="size-4" /> {busy ? 'กำลังพิมพ์...' : 'พิมพ์ใบกำกับภาษี'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
