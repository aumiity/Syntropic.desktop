import React, { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from './dialog'
import { Button } from './button'
import { Input } from './input'
import { AlertTriangle } from 'lucide-react'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'destructive'
  onConfirm: (reason?: string) => void
  requireReason?: boolean
  reasonLabel?: string
}

export function ConfirmDialog({
  open, onOpenChange, title, description,
  confirmLabel = 'ยืนยัน', cancelLabel = 'ยกเลิก',
  variant = 'default', onConfirm, requireReason, reasonLabel = 'เหตุผล',
}: ConfirmDialogProps) {
  const [reason, setReason] = useState('')

  const handleConfirm = () => {
    if (requireReason && !reason.trim()) return
    onConfirm(requireReason ? reason : undefined)
    setReason('')
  }

  const handleClose = () => {
    setReason('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent size="sm" onClose={handleClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {variant === 'destructive' && <AlertTriangle className="h-5 w-5 text-destructive" />}
            {title}
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
          {requireReason && (
            <div className="space-y-1">
              <label className="text-sm font-medium">{reasonLabel} <span className="text-destructive">*</span></label>
              <Input
                autoFocus
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="ระบุเหตุผล..."
              />
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>{cancelLabel}</Button>
          <Button
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            onClick={handleConfirm}
            disabled={requireReason && !reason.trim()}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
