import * as React from 'react'
import { cn } from '@/lib/utils'

// Brand identity primitives — the Syntropic logomark + wordmark, and the
// gradient "brand panel" used on the gateway screens (Setup wizard, Login).
// Kept here (not in a page) so both screens render the exact same brand.
//
// tone:
//   'light' — sits on the teal brand panel / dark surfaces → frosted tile + white text
//   'dark'  — sits on a normal light surface → solid teal tile + foreground text

type BrandTone = 'light' | 'dark'

// Abstract growth mark — three ascending rounded bars (syntropy = order/growth,
// also reads as POS/data). Uses currentColor so the parent controls the color.
function LogoGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3.5" y="13.5" width="3.6" height="6.5" rx="1.8" fill="currentColor" opacity="0.6" />
      <rect x="10.2" y="9" width="3.6" height="11" rx="1.8" fill="currentColor" opacity="0.82" />
      <rect x="16.9" y="4" width="3.6" height="16" rx="1.8" fill="currentColor" />
    </svg>
  )
}

export function BrandMark({
  tone = 'dark',
  tagline,
  size = 'md',
  className,
}: {
  tone?: BrandTone
  tagline?: string
  size?: 'md' | 'lg'
  className?: string
}) {
  const lg = size === 'lg'
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        className={cn(
          'relative flex items-center justify-center rounded-2xl shrink-0 shadow-sm',
          lg ? 'size-14' : 'size-12',
          tone === 'light'
            ? 'bg-primary-foreground/10 ring-1 ring-primary-foreground/20 text-primary-foreground'
            : 'bg-primary text-primary-foreground',
        )}
      >
        <LogoGlyph className={lg ? 'size-8' : 'size-7'} />
        <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-accent" />
      </div>
      <div className="leading-tight">
        <div
          className={cn(
            'font-bold tracking-tight',
            lg ? 'text-2xl' : 'text-xl',
            tone === 'light' ? 'text-primary-foreground' : 'text-foreground',
          )}
        >
          Syntropic
        </div>
        {tagline && (
          <div
            className={cn(
              'text-xs',
              tone === 'light' ? 'text-primary-foreground/70' : 'text-muted-foreground',
            )}
          >
            {tagline}
          </div>
        )}
      </div>
    </div>
  )
}

// The left brand rail for gateway screens. Hidden on narrow widths (the form
// then takes the full pane). Children render in the middle band (e.g. a Stepper).
export function BrandPanel({
  tagline,
  footer,
  children,
  className,
}: {
  tagline?: string
  footer?: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'relative hidden md:flex flex-col justify-between overflow-hidden shrink-0',
        'w-[min(38%,21rem)] p-8',
        'bg-gradient-to-br from-primary to-primary-strong text-primary-foreground',
        className,
      )}
    >
      {/* decorative soft glows — purely visual */}
      <div aria-hidden="true" className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-primary-foreground/5 blur-2xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -left-20 size-72 rounded-full bg-accent/10 blur-3xl" />

      <div className="relative space-y-10">
        <BrandMark tone="light" tagline={tagline} />
        {children}
      </div>

      <div className="relative text-xs text-primary-foreground/50">
        {footer ?? <>&copy; Syntropic</>}
      </div>
    </div>
  )
}
