import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { getCurrentUserId } from '@/stores/userStore'
import { printTaxInvoice, previewTaxInvoice } from '@/lib/receipt/print'
import type { SaleForPrint, Setting, TaxInvoice } from '@/types'
import { FileText, Printer, AlertTriangle } from 'lucide-react'

// Read-only tax-invoice issuer (ม.86/4). The buyer comes ONLY from the sale's
// linked customer (or the legal snapshot if one was already issued) — there is
// no picker and no free-text editing here. To change the buyer, reassign the
// bill's customer in SaleDetailDialog. The first successful print of the
// "ต้นฉบับ" locks the bill via tax:confirmOriginalPrinted (deferred lock —
// never at issue/preview time, so a cancelled print leaves the bill unlocked).
export function TaxInvoiceBuyerDialog({
  open, onOpenChange, saleId, sale, buyer, onIssued,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  saleId: number | null
  sale: SaleForPrint | null
  /** Buyer pulled from the bill's linked customer — read-only. */
  buyer?: { name?: string; address?: string; taxId?: string; branch?: string }
  /** Fired after a successful issue/print so callers can refresh their list. */
  onIssued?: () => void
}) {
  const { toast } = useToast()
  const [shop, setShop] = useState<Partial<Setting>>({})
  // Resolved buyer = snapshot (if a tax invoice exists) ELSE the bill's customer.
  // handlePreview/handlePrint/validate all read from this set only.
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [taxId, setTaxId] = useState('')
  const [branch, setBranch] = useState('')
  const [alreadyOriginal, setAlreadyOriginal] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || saleId == null) return
    window.api.settings.getShop().then(d => setShop((d as Setting) ?? {}))
    window.api.tax.get(saleId).then((rec: TaxInvoice | null) => {
      if (rec) {
        // A prior issuance is the legal snapshot — its buyer values win.
        setName(rec.buyer_name)
        setAddress(rec.buyer_address)
        setTaxId(rec.buyer_tax_id)
        setBranch(rec.buyer_branch || 'สำนักงานใหญ่')
        setAlreadyOriginal(rec.original_printed === 1)
      } else {
        setName(buyer?.name ?? '')
        setAddress(buyer?.address ?? '')
        setTaxId(buyer?.taxId ?? '')
        setBranch(buyer?.branch || 'สำนักงานใหญ่')
        setAlreadyOriginal(false)
      }
    })
  }, [open, saleId, buyer])

  // Block when the bill has no customer / incomplete info — a full tax invoice
  // needs at least a name + address.
  const incomplete = !name.trim() || !address.trim()

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
        // Deferred lock — only an ORIGINAL print (!copy) and ONLY after the
        // print succeeded. A failed/cancelled print never reaches here, so the
        // bill stays editable (P0).
        if (!copy) await window.api.tax.confirmOriginalPrinted(saleId)
        toast({ title: copy ? 'พิมพ์ใบกำกับภาษี (สำเนา) แล้ว' : 'พิมพ์ใบกำกับภาษี (ต้นฉบับ) แล้ว', variant: 'success' })
        onIssued?.()
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
          <DialogTitle>ใบกำกับภาษี</DialogTitle>
          <div className="text-sm text-muted-foreground">
            {alreadyOriginal
              ? 'การพิมพ์ครั้งนี้จะเป็น "สำเนาใบกำกับภาษี"'
              : 'โปรดตรวจสอบรายละเอียดผู้ซื้อให้ถูกต้อง'}
          </div>
        </DialogHeader>
        <DialogBody className="space-y-3">
          {incomplete && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2.5 text-sm text-warning-strong">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <span>บิลนี้ยังไม่มีลูกค้า หรือข้อมูลลูกค้าไม่ครบ (ขาดชื่อ/ที่อยู่) — กรุณากด "แก้ไขรายชื่อลูกค้า" ของบิลก่อนออกใบกำกับ</span>
            </div>
          )}
          <FormField label="ชื่อผู้ซื้อ">
            <Input value={name || '— ไม่มีลูกค้า —'} readOnly disabled />
          </FormField>
          <FormField label="ที่อยู่">
            <Input value={address || '—'} readOnly disabled />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="เลขประจำตัวผู้เสียภาษี">
              <Input value={taxId || '—'} readOnly disabled />
            </FormField>
            <FormField label="สาขา">
              <Input value={branch || '—'} readOnly disabled />
            </FormField>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="elevated" onClick={handlePreview} disabled={busy || incomplete}>
            <FileText className="size-4" /> ดูตัวอย่าง PDF
          </Button>
          <Button variant="default" onClick={handlePrint} disabled={busy || incomplete}>
            <Printer className="size-4" /> {busy ? 'กำลังพิมพ์...' : (alreadyOriginal ? 'พิมพ์สำเนา' : 'พิมพ์ใบกำกับภาษี')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
