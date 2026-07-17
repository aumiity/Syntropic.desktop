import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

// Shared Export-to-Excel button. Owns the loading state + result toasting so
// every caller is a one-liner: pass an onExport that resolves the IPC result
// ({ ok, path?, canceled? }). Success (saved) → green toast with the path;
// cancel (user dismissed the save dialog) → silent; throw → red toast.
//
// iconOnly = the filter-strip variant (h-8 square + tooltip). Otherwise a
// labelled button for the Export Hub rows.

interface ExportButtonProps {
  onExport: () => Promise<{ ok: boolean; path?: string; canceled?: boolean }>
  label?: string
  iconOnly?: boolean
  tooltip?: string
  disabled?: boolean
  className?: string
}

export function ExportButton({
  onExport,
  label = 'ส่งออก Excel',
  iconOnly = false,
  tooltip,
  disabled,
  className,
}: ExportButtonProps) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)

  const handleClick = async () => {
    if (busy) return
    setBusy(true)
    try {
      const res = await onExport()
      if (res?.canceled) return // user dismissed the save dialog — silent
      if (res?.ok) {
        toast({ title: 'ส่งออกสำเร็จ', description: res.path, variant: 'success' })
      }
    } catch (e: any) {
      toast({ title: 'ส่งออกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const Icon = busy ? Loader2 : Download

  if (iconOnly) {
    return (
      <Button
        size="lg"
        variant="elevated"
        className={cn('h-8 w-8 p-0 shrink-0', className)}
        onClick={handleClick}
        disabled={disabled || busy}
        tooltip={tooltip ?? label}
      >
        <Icon className={cn('size-4', busy && 'animate-spin')} />
      </Button>
    )
  }

  return (
    <Button
      size="lg"
      variant="elevated"
      className={cn('h-8', className)}
      onClick={handleClick}
      disabled={disabled || busy}
    >
      <Icon className={cn('size-4', busy && 'animate-spin')} /> {label}
    </Button>
  )
}
