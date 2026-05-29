import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { TintIcon } from '@/components/ui/tint-icon'
import { AlertTriangle, HelpCircle } from 'lucide-react'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'destructive'
  requireReason?: boolean
  reasonLabel?: string
  reasonPlaceholder?: string
  reasonPresets?: string[]
  onConfirm: (reason?: string) => void
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'ยืนยัน',
  // Default to "กลับ" (go back) rather than "ยกเลิก" so the secondary button
  // never collides with a destructive confirm whose own label is "ยกเลิก..."
  // (e.g. "ยกเลิกบิล") — two "ยกเลิก" buttons read as ambiguous.
  cancelLabel = 'ยกเลิก',
  variant = 'default',
  requireReason = false,
  reasonLabel = 'เหตุผล',
  reasonPlaceholder = 'ระบุเหตุผล...',
  reasonPresets,
  onConfirm,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState('')

  // Reset reason whenever the dialog is opened
  useEffect(() => {
    if (open) setReason('')
  }, [open])

  const isDestructive = variant === 'destructive'
  const canConfirm = !requireReason || reason.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        {/* Header: tinted icon flags intent (danger vs. neutral) beside the title */}
        <DialogHeader>
          <div className="flex items-center gap-3">
            <TintIcon
              icon={isDestructive ? AlertTriangle : HelpCircle}
              tint={isDestructive ? 'destructive' : 'primary'}
              size="md"
            />
            <DialogTitle>{title}</DialogTitle>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-5">
          {/* Destructive prompts get a soft panel so the consequence reads clearly;
              neutral prompts stay as plain muted copy. */}
          {description && (
            isDestructive ? (
              <div className="rounded-lg border border-destructive/20 bg-destructive-soft px-4 py-3 text-sm leading-relaxed text-destructive-strong">
                {description}
              </div>
            ) : (
              <div className="text-sm leading-relaxed text-muted-foreground">{description}</div>
            )
          )}

          {requireReason && (
            <div className="space-y-2.5">
              <label className="block text-sm font-semibold text-foreground">
                {reasonLabel}
              </label>
              {reasonPresets && reasonPresets.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {reasonPresets.map(preset => {
                    const selected = reason === preset
                    // Selected tint follows the dialog intent so the highlight
                    // doesn't clash (red for a void, primary for neutral).
                    const selectedCls = isDestructive
                      ? 'border-destructive bg-destructive-soft text-destructive-strong'
                      : 'border-primary bg-primary-soft text-primary'
                    return (
                      <Button
                        key={preset}
                        type="button"
                        variant="elevated"
                        onClick={() => setReason(preset)}
                        className={`text-sm font-normal ${selected ? selectedCls : ''}`}
                      >
                        {preset}
                      </Button>
                    )
                  })}
                </div>
              )}
              <Textarea
                variant="elevated"
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder={reasonPlaceholder}
                rows={3}
                autoFocus
              />
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          {/* Secondary cancel is always neutral ELEVATED — keeps it visually
              distinct from the (possibly red) confirm so the safe exit doesn't
              read as another dangerous action. */}
          <Button
            size="xl"
            variant="elevated"
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            size="xl"
            variant={isDestructive ? 'destructive' : 'default'}
            disabled={!canConfirm}
            onClick={() => { onConfirm(reason.trim() || undefined) }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
