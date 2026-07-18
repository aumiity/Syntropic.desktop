import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

// Large selectable option card (radio-like). Used for mutually-exclusive choices
// such as the VAT จด/ไม่จด decision in the Setup wizard. Selected = teal frame +
// ring + corner check.

export function ChoiceCard({
  title,
  desc,
  selected,
  onClick,
  className,
}: {
  title: string
  desc: string
  selected: boolean
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative rounded-lg border p-4 pr-9 text-left transition-colors',
        selected
          ? 'border-primary bg-primary/5 ring-[1px] ring-primary'
          : 'border-border bg-card hover:border-primary',
        className,
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
