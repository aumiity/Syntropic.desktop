import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

// Vertical progress stepper for multi-step flows (Setup wizard). `current` is
// 1-based. tone='light' styles it for the teal brand panel; 'dark' for a normal
// surface. States: done (check), active (filled), upcoming (dim).

export function Stepper({
  steps,
  current,
  tone = 'dark',
  className,
}: {
  steps: string[]
  current: number
  tone?: 'light' | 'dark'
  className?: string
}) {
  const light = tone === 'light'
  return (
    <ol className={cn('space-y-1', className)}>
      {steps.map((label, i) => {
        const n = i + 1
        const done = n < current
        const active = n === current
        const last = i === steps.length - 1
        return (
          <li key={label} className="flex gap-3">
            {/* node + connector */}
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  'flex items-center justify-center size-7 rounded-full text-xs font-semibold shrink-0 border transition-colors',
                  light
                    ? done
                      ? 'bg-primary-foreground text-primary border-primary-foreground'
                      : active
                        ? 'bg-primary-foreground/15 text-primary-foreground border-primary-foreground'
                        : 'bg-transparent text-primary-foreground/50 border-primary-foreground/25'
                    : done
                      ? 'bg-success text-success-foreground border-success'
                      : active
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card text-muted-foreground border-border',
                )}
              >
                {done ? <Check className="size-4" /> : n}
              </span>
              {!last && (
                <span
                  className={cn(
                    'w-px flex-1 my-1',
                    light
                      ? done
                        ? 'bg-primary-foreground/70'
                        : 'bg-primary-foreground/20'
                      : done
                        ? 'bg-success/60'
                        : 'bg-border',
                  )}
                />
              )}
            </div>
            {/* label */}
            <span
              className={cn(
                'text-sm pt-1 pb-3',
                light
                  ? active
                    ? 'text-primary-foreground font-medium'
                    : 'text-primary-foreground/65'
                  : active
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground',
              )}
            >
              {label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
