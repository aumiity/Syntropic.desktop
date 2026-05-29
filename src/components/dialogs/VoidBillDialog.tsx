import { ConfirmDialog } from '@/components/ui/confirm-dialog'

// Shared void-bill confirmation. The exact same destructive prompt (title,
// copy, reason presets) is reused from Manage/Sales and both EditProduct /
// EditBundle history tabs — keep it here so the wording and reason list stay
// in one place.
const VOID_REASON_PRESETS = ['คีย์รายการผิด', 'ราคาผิด', 'ลูกค้ายกเลิก', 'ลูกค้าคืนสินค้า', 'บิลซ้ำ']

interface VoidBillDialogProps {
  /** The bill being voided; null closes the dialog. */
  target: { invoice_no: string } | null
  /** Called when the dialog should close (backdrop is disabled — this fires on cancel/confirm). */
  onClose: () => void
  /** Fired with the chosen reason when the user confirms the void. */
  onConfirm: (reason: string) => void
}

export function VoidBillDialog({ target, onClose, onConfirm }: VoidBillDialogProps) {
  return (
    <ConfirmDialog
      open={!!target}
      onOpenChange={open => { if (!open) onClose() }}
      title="ยกเลิกบิล"
      description={
      <>
      ทำการยกเลิกบิล {target?.invoice_no}
      <br />
      สต็อกจะถูกคืนกลับอัตโนมัติ
      </>
      }
      confirmLabel="ยืนยัน"
      variant="destructive"
      requireReason
      reasonLabel="เหตุผลการยกเลิก"
      reasonPresets={VOID_REASON_PRESETS}
      onConfirm={reason => onConfirm(reason ?? '')}
    />
  )
}
