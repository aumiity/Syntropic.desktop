import { useState, useEffect } from 'react'
import type { ReactNode, ComponentType } from 'react'
import {
  Dialog, DialogContent, DialogTitle, DialogBody, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { TintIcon, type TintIconTint } from '@/components/ui/tint-icon'
import { AlertTriangle, HelpCircle, CheckCircle2 } from 'lucide-react'

export type ConfirmVariant = 'default' | 'destructive' | 'warning' | 'success'

interface VariantSpec {
  icon: ComponentType<{ className?: string }>
  tint: TintIconTint
  confirmVariant:
    | 'default' | 'destructive' | 'success' | 'amber' | 'amber-soft'
  cancelVariant:
    | 'elevated' | 'destructive-soft'
}

// `warning` intentionally uses the warm `amber` palette (deep gold) instead of
// the harsh `--warning` yellow — same name in the public API for clarity.
const VARIANT_SPEC: Record<ConfirmVariant, VariantSpec> = {
  default:     { icon: HelpCircle,    tint: 'primary',     confirmVariant: 'default',     cancelVariant: 'elevated' },
  destructive: { icon: AlertTriangle, tint: 'destructive', confirmVariant: 'destructive', cancelVariant: 'destructive-soft' },
  warning:     { icon: AlertTriangle, tint: 'amber-soft',  confirmVariant: 'amber',  cancelVariant: 'elevated' },
  success:     { icon: CheckCircle2,  tint: 'success',     confirmVariant: 'success',     cancelVariant: 'elevated' },
}

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  variant?: ConfirmVariant
  /** Hide the cancel button — for acknowledgements (e.g. success dialogs). */
  singleButton?: boolean
  requireReason?: boolean
  reasonLabel?: string
  reasonPlaceholder?: string
  reasonPresets?: string[]
  /** Override the default icon for the chosen variant. */
  icon?: ComponentType<{ className?: string }>
  /** Auxiliary content rendered below the description, before the reason input.
      Use for structured info (diff lists, info panels). Block is left-aligned. */
  content?: ReactNode
  onConfirm: (reason?: string) => void
  busy?: boolean
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'ยืนยัน',
  cancelLabel = 'ยกเลิก',
  variant = 'default',
  singleButton = false,
  requireReason = false,
  reasonLabel = 'เหตุผล',
  reasonPlaceholder = 'ระบุเหตุผล...',
  reasonPresets,
  icon,
  content,
  onConfirm,
  busy = false,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState('')

  useEffect(() => { if (open) setReason('') }, [open])

  const spec = VARIANT_SPEC[variant]
  const Icon = icon ?? spec.icon
  const canConfirm = !requireReason || reason.trim().length > 0

  const presetSelectedCls: Record<ConfirmVariant, string> = {
    default:     'border-primary bg-primary-soft text-primary',
    destructive: 'border-destructive bg-destructive-soft text-destructive-strong',
    warning:     'border-amber/40 bg-amber-soft text-amber-strong',
    success:     'border-success bg-success-soft text-success',
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        showCloseButton={!singleButton}
        onClose={() => !busy && onOpenChange(false)}
      >
        <DialogBody className="flex flex-col items-center text-center gap-4 pt-2 pb-1">
          <TintIcon icon={Icon} tint={spec.tint} size="xl" />

          <div className="space-y-1.5 max-w-sm">
            <DialogTitle className="justify-center text-2xl font-bold leading-tight">{title}</DialogTitle>
            {description && (
              <div className="text-base text-muted-foreground leading-relaxed">
                {description}
              </div>
            )}
          </div>

          {content && (
            <div className="w-full text-left">{content}</div>
          )}

          {requireReason && (
            <div className="w-full space-y-2.5">
              {reasonLabel && (
                <label className="block text-sm font-semibold text-foreground text-left">
                  {reasonLabel}
                </label>
              )}
              {reasonPresets && reasonPresets.length > 0 && (
                <div className="flex flex-wrap gap-1.5 justify-start">
                  {reasonPresets.map(preset => {
                    const selected = reason === preset
                    return (
                      <Button
                        key={preset}
                        type="button"
                        variant="elevated"
                        size="sm"
                        onClick={() => setReason(preset)}
                        className={selected ? presetSelectedCls[variant] : ''}
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
                className="text-left"
              />
            </div>
          )}
        </DialogBody>

        <DialogFooter
          className={
            singleButton
              ? 'sm:flex-col sm:justify-stretch'
              : 'sm:grid sm:grid-cols-2 sm:gap-3'
          }
        >
          {!singleButton && (
            <Button
              size="xl"
              variant={spec.cancelVariant}
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              {cancelLabel}
            </Button>
          )}
          <Button
            size="xl"
            variant={spec.confirmVariant}
            disabled={!canConfirm || busy}
            onClick={() => onConfirm(reason.trim() || undefined)}
            autoFocus={singleButton}
            className={singleButton ? 'w-full h-14 text-lg' : ''}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
